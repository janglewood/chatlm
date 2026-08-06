// Shared across every LLMProvider implementation — the prompt itself is
// provider-agnostic; only how each provider is *called* differs.

// Two distinct "can't answer" sentinels, not one — the difference matters
// for what we show the user afterward (see answerQuestion.js):
// - NO_ANSWER_MARKER: the question fits this chat's subject matter, but the
//   specific answer isn't in the provided fragments. Worth still offering
//   loosely-related messages — the topic is right, just not this exact fact.
// - NOT_RELATED_MARKER: the question has nothing to do with what this chat
//   discusses at all (e.g. asking a car-club chat about the weather).
//   Offering "related" content here would just be noise — whatever scored
//   highest by embedding similarity is still unrelated to the question.
// Without this split we can only infer relatedness indirectly (did the
// question clear CONFIDENCE_THRESHOLD before reaching the LLM?), which is a
// poor proxy — a genuinely on-topic question can clear that gate and still
// get correctly refused by the LLM, and conflating that with "off-topic"
// wrongly hides content the user could actually use. See API_CONTRACTS.md
// §3 ("never fabricate ... say 'I don't know'").
export const NO_ANSWER_MARKER = "NO_ANSWER_FOUND";
export const NOT_RELATED_MARKER = "NOT_RELATED_TO_CHAT";

// The model is asked to name which numbered fragment — AND which specific
// lettered message within it — its answer actually came from, on a trailing
// line starting with this prefix (e.g. "SOURCE: 3b" = fragment 3, message b).
// Without the fragment part, the citation shown to the user defaults to
// whichever fragment ranked highest by embedding similarity — which is
// frequently NOT the fragment the model actually drew the answer from
// (multiple candidates are passed as context; the model may reasonably
// synthesize from #2 or #3 instead of #1). That mismatch is a real
// citation-attribution bug, not a hypothetical — verified live: a question
// about battery drain retrieved Ivan's message as the top-similarity match,
// but the model correctly answered from Anatoli's lower-ranked message.
// Without the per-message letter, the same problem recurs one level down: a
// fragment merges several messages into one embedded blob, and the citation
// link/preview would default to that fragment's FIRST message even when the
// answer actually came from its last one — verified live: a fragment whose
// first message was about an unrelated UI bug and whose last message
// answered the actual question produced a citation preview that looked
// completely unrelated, even though the right fragment was correctly found.
// English, ASCII sentinel — kept literal/untranslated regardless of what
// language the model answers in (see the "respond in the question's
// language" rule below). An ASCII marker is a safer sentinel than a
// Cyrillic one here: it can't be confused with translated answer content
// and survives round-tripping through any response language unambiguously.
const SOURCE_MARKER_PREFIX = "SOURCE:";

const MESSAGE_LETTERS = "abcdefghijklmnopqrstuvwxyz";

export const SYSTEM_PROMPT = `You are an assistant that answers questions from members of a work Telegram chat, based on that chat's message history.

Rules:
- Answer ONLY based on the provided chat history fragments below. Never invent facts that aren't in these fragments.
- Respond in the SAME LANGUAGE the question was asked in, regardless of what language the chat history itself is in.
- Each fragment is dated, and you're told today's actual date. Use both to resolve relative time references ("today", "tomorrow", "this week", "next Monday") in either the question or the chat history — don't guess, and don't treat a question just because it uses a relative time word as automatically unanswerable. A dated fragment that clearly settles a relative-time question (e.g. a fragment from today's date saying a decision was made) is a real answer, not a live-data request.
- If the question is something this chat's participants could plausibly discuss, but the specific answer isn't in the provided fragments, respond with exactly "${NO_ANSWER_MARKER}" and nothing else.
- If the question is the kind of thing this chat's history could never answer NO MATTER WHAT it contains or when it's asked (e.g. the current weather right now, today's exchange rate, the current time) — as opposed to a question about a decision/event/plan that this chat's history could plausibly have recorded — respond with exactly "${NOT_RELATED_MARKER}" and nothing else. Also use this for general knowledge unrelated to what this chat discusses, or a misdirected question. Apply this even if the chat happens to share some vocabulary with the question (e.g. a place name) — judge the substance of the question, not incidental word overlap.
- Keep answers concise and to the point.
- Plain text only — no Markdown (no **bold**, *italics*, backticks, or bullet/numbered lists). The reply is sent as-is, so any markup would show up as literal asterisks/symbols instead of formatting.
- Don't refer to "fragments" or "context" — answer as though you simply know the chat's history.
- Each fragment lists its individual messages, lettered (a), (b), (c)... At the end of a substantive answer (i.e. not when you respond with "${NO_ANSWER_MARKER}" or "${NOT_RELATED_MARKER}"), add a new line "${SOURCE_MARKER_PREFIX} Na", where N is the fragment number and "a" is the letter of the ONE specific message within that fragment that most directly supports your answer (e.g. "${SOURCE_MARKER_PREFIX} 3b" = fragment 3, message b). This is required for every substantive answer — always include both the number and the letter.`;

// Query expansion — a separate, small LLM call before embedding, not part
// of the main answer prompt. Verified live: the SAME correct chunk scored
// 0.28 for "anything about 'freeze scope'" but only 0.18 for "freeze scope
// info" — a terse, keyword-style phrasing of the identical question. This
// isn't a quirk of our corpus; short/fragmentary text embeds measurably
// weaker than complete natural-language text in basically any embedding
// model, so rewriting the query before embedding (not before answering —
// the main LLM call still gets the user's original wording) is the actual
// fix for phrasing-sensitivity, not just pushing CONFIDENCE_THRESHOLD lower
// and hoping. Kept intentionally terse/example-driven and low max_tokens
// (see providers) since this only needs to run once per question and
// shouldn't meaningfully add cost/latency on top of the main answer call.
export const EXPANSION_SYSTEM_PROMPT = `Rewrite the user's input as a complete, natural-language question, preserving its exact meaning — never add facts, assumptions, or details the input doesn't imply. If it's already a complete, clear question, return it unchanged.

Respond with ONLY the rewritten question — no explanation, no quotes, no extra text.

Examples:
Input: freeze scope info
Output: What is the status of the scope freeze?

Input: deploy status
Output: What is the current deployment status?

Input: is scope frozen today
Output: Is the scope frozen today?`;

function formatFragmentDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function renderFragment(chunk, index) {
  const lines = chunk.messages.map(
    (m, i) => `(${MESSAGE_LETTERS[i] ?? i}) ${m.authorDisplayName}: ${m.text}`,
  );
  return `[Fragment ${index + 1}, ${formatFragmentDate(chunk.firstMessageAt)}]\n${lines.join("\n")}`;
}

/**
 * @param {Array<{ firstMessageAt: Date, messages: Array<{ authorDisplayName: string, text: string }> }>} contextChunks
 *   each chunk's `messages` are its individual source messages, in order —
 *   rendered lettered so the model can cite a specific one (see
 *   SOURCE_MARKER_PREFIX) instead of only the fragment as a whole.
 * @param {Date} [currentDate] the moment the question was asked — without
 *   this, the model has no way to tell whether a relative reference like
 *   "today" in the question lines up with a fragment's date, and (rightly,
 *   given no anchor) tends to refuse rather than guess. Verified live: a
 *   question about a same-day decision came back "not found" purely because
 *   of this gap, even with the right dated fragment in context. Optional
 *   only for callers/tests that don't care about temporal reasoning.
 */
export function buildUserTurn(question, contextChunks, currentDate) {
  const context = contextChunks.map((chunk, i) => renderFragment(chunk, i)).join("\n\n");

  const dateLine = currentDate ? `Today's date: ${formatFragmentDate(currentDate)}\n\n` : "";
  return `${dateLine}Chat history context:\n\n${context}\n\nQuestion: ${question}`;
}

/**
 * Splits the trailing "SOURCE: Na" line off the model's raw response.
 * @param {string} rawText
 * @returns {{ text: string, sourceIndex: number|null, sourceMessageIndex: number|null }}
 *   Both 0-based (sourceIndex matches the contextChunks array, sourceMessageIndex
 *   matches that chunk's `messages` array) — null/null if absent/unparseable.
 */
export function parseAnswer(rawText) {
  const match = rawText.match(/\n?SOURCE:\s*(\d+)([a-zA-Z])\s*$/);
  if (!match) return { text: rawText.trim(), sourceIndex: null, sourceMessageIndex: null };

  const text = rawText.slice(0, match.index).trim();
  const sourceIndex = Number(match[1]) - 1;
  const sourceMessageIndex = match[2].toLowerCase().charCodeAt(0) - 97;
  return {
    text,
    sourceIndex: Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : null,
    sourceMessageIndex: sourceMessageIndex >= 0 ? sourceMessageIndex : null,
  };
}
