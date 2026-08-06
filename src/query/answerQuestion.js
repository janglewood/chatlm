import { getEmbeddingProvider } from "../embeddings/index.js";
import { topK } from "../db/embeddings.js";
import { getMessagesByIds } from "../db/messages.js";
import { getLlmProvider } from "../llm/index.js";
import { checkAndIncrement } from "../rateLimit/rateLimiter.js";
import { addLlmTokensUsed } from "../db/usage.js";
import { env } from "../config/env.js";
import { detectLanguage, t } from "./i18n.js";
import { filterDeletedCandidates } from "./deletionFilter.js";
import { logger } from "../logger.js";

const TOP_K = 8;
const PREVIEW_MAX_CHARS = 100;

/**
 * @typedef {Object} Citation
 * @property {string} authorDisplayName
 * @property {Date} messageDate
 * @property {number|undefined} telegramMessageId
 * @property {string} textPreview
 * @property {string|null} link
 */

/**
 * Question → embed → retrieve top-k → confidence gate → LLM → cited answer.
 * API_CONTRACTS.md §3, extended with a "related messages" section: when
 * answered, citations[0] is the message the model actually drew its answer
 * from and any remaining entries are other loosely-related messages found
 * along the way; when refused, citations holds whatever loosely-related
 * messages exist (possibly none) instead of always being empty.
 *
 * @param {{ chatId: number, telegramUserId: string|number, questionText: string }} params
 * @returns {Promise<{ text: string, citations: Citation[], refused: boolean, lang: string }>}
 */
export async function handleQuestion({ chatId, telegramUserId, questionText }) {
  // Cost guardrail #1: enforced before any embedding/LLM call.
  await checkAndIncrement(chatId, telegramUserId);

  // Detected from the question itself, not the chat's history — the model
  // is instructed to match the question's language for its own answer
  // (promptTemplate.js), and this keeps our own reply "chrome" (headings,
  // refusal text, citation phrasing) consistent with that instead of always
  // defaulting to Russian regardless of what language was actually asked in.
  const lang = detectLanguage(questionText);
  const strings = t(lang);

  const llmProvider = getLlmProvider();

  // Retrieval-only rewrite, not part of the answer prompt — the model still
  // answers against the user's original wording (see below). Verified live:
  // the identical question scored 0.28 phrased naturally but only 0.18 as a
  // terse keyword fragment ("anything about 'freeze scope'" vs "freeze
  // scope info") — short/fragmentary text embeds measurably weaker in
  // basically any embedding model, so rewriting before embedding is the
  // actual fix, not just pushing CONFIDENCE_THRESHOLD lower. Best-effort: a
  // failure here should never block answering, so fall back to the raw
  // question rather than surface an error over what's just a quality boost.
  let embedText = questionText;
  try {
    const expansion = await llmProvider.expandQuery(questionText);
    embedText = expansion.text;
    if (expansion.tokensUsed) {
      await addLlmTokensUsed(chatId, expansion.tokensUsed);
    }
  } catch (err) {
    logger.error({ err, chatId }, "Query expansion failed, falling back to raw question");
  }

  const embeddingProvider = getEmbeddingProvider();
  const [{ vector }] = await embeddingProvider.embed([embedText], { inputType: "query" });

  const rawCandidates = await topK(chatId, vector, TOP_K);
  // Checked before the LLM ever sees these, not just before citing them —
  // see deletionFilter.js for why that distinction matters.
  const candidates = await filterDeletedCandidates(chatId, rawCandidates);

  // Cost guardrail #2: below-threshold retrieval never reaches the LLM —
  // but we still surface loosely-related messages if any clear the much
  // lower RELATED_MESSAGES_MIN_SCORE bar, instead of a bare "not found".
  if (candidates.length === 0 || candidates[0].similarityScore < env.CONFIDENCE_THRESHOLD) {
    const citations = await buildCitations(filterRelated(candidates), lang);
    return { text: strings.noInfo, citations, refused: true, lang };
  }

  const enrichedCandidates = await enrichWithMessages(candidates);
  const answer = await llmProvider.generateAnswer({ question: questionText, contextChunks: enrichedCandidates });

  if (answer.tokensUsed) {
    await addLlmTokensUsed(chatId, answer.tokensUsed);
  }

  if (answer.refused) {
    // The model itself judges relatedness (promptTemplate.js) rather than
    // us inferring it from which code path was taken — a genuinely on-topic
    // question can clear CONFIDENCE_THRESHOLD and still get correctly
    // refused, and that case should still offer related content (the topic
    // is right, just not this exact fact). Only suppress it when the model
    // says the question isn't related to this chat at all — showing
    // whatever scored highest by embedding similarity would just be noise.
    const citations = answer.offTopic
      ? []
      : await buildCitations(filterRelated(candidates), lang);
    return { text: strings.noInfo, citations, refused: true, lang };
  }

  // The model names which candidate its answer actually came from
  // (answer.sourceIndex) — that's frequently NOT the top-similarity
  // candidate, since several are passed as context and the model may
  // reasonably draw from any of them. Put that one first so formatReply's
  // "cite the top entry" logic credits the right person; everything else
  // (above the related-message bar) becomes the "also found" section.
  const primaryIndex =
    answer.sourceIndex != null && candidates[answer.sourceIndex] ? answer.sourceIndex : 0;
  const primary = candidates[primaryIndex];

  // Same idea one level down: a fragment merges several messages into one
  // embedded blob, so the model also names WHICH message within that
  // fragment it actually used (answer.sourceMessageIndex) — without this,
  // the citation would default to the fragment's first message regardless
  // of which one the answer came from. Verified live: a fragment whose
  // first message was an unrelated bug report and whose last message
  // answered the question produced a citation preview that looked
  // completely unrelated, even though the right fragment was found.
  const citedMessageId =
    answer.sourceMessageIndex != null && primary.sourceMessageIds[answer.sourceMessageIndex] != null
      ? primary.sourceMessageIds[answer.sourceMessageIndex]
      : primary.sourceMessageIds[0];

  const others = filterRelated(candidates.filter((_, i) => i !== primaryIndex));

  const citations = await buildCitations([{ ...primary, citedMessageId }, ...others], lang);
  return { text: answer.text, citations, refused: false, lang };
}

/**
 * Attaches each candidate's individual source messages (author + text, in
 * sourceMessageIds order) so the LLM can be shown a fragment as separately
 * lettered messages and cite a specific one — see promptTemplate.js's
 * renderFragment/SOURCE_MARKER_PREFIX. Only needed right before the LLM
 * call; the confidence-gate-rejected path never reaches here.
 */
async function enrichWithMessages(candidates) {
  const allIds = [...new Set(candidates.flatMap((c) => c.sourceMessageIds))];
  const messages = await getMessagesByIds(allIds);
  const byId = new Map(messages.map((m) => [Number(m.id), m]));

  return candidates.map((c) => ({
    ...c,
    messages: c.sourceMessageIds.map((id) => {
      const m = byId.get(Number(id));
      return { authorDisplayName: m?.author_display_name ?? "Unknown", text: m?.text ?? "" };
    }),
  }));
}

function filterRelated(candidates) {
  return candidates
    .filter((c) => c.similarityScore >= env.RELATED_MESSAGES_MIN_SCORE)
    .slice(0, env.RELATED_MESSAGES_LIMIT);
}

function truncate(text, maxChars) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > maxChars ? `${singleLine.slice(0, maxChars - 1)}…` : singleLine;
}

/**
 * t.me/c/ deep links only resolve for supergroups/channels (marked chat id
 * starting with "-100"), not plain "basic" groups — Telegram auto-upgrades
 * a group to a supergroup once it grows or certain features are used, but a
 * brand-new small group may still be "basic" and has no working deep-link
 * scheme at all. Omit the link rather than hand back one that 404s.
 *
 * Takes the message's own origin peer (message.telegram_chat_id), NOT the
 * parent chat's current telegram_chat_id — those differ for messages
 * backfilled from a pre-supergroup-upgrade peer (see mtproto/sync.js), and
 * building a link from the wrong peer would 404 even when the current chat
 * IS a supergroup.
 */
function buildMessageLink(telegramChatId, telegramMessageId) {
  if (!telegramChatId || !telegramMessageId) return null;
  const idStr = String(telegramChatId);
  if (!idStr.startsWith("-100")) return null;
  return `https://t.me/c/${idStr.slice(4)}/${telegramMessageId}`;
}

/**
 * Author, date, short preview, and (when possible) a deep link for each
 * candidate's cited source message — `candidate.citedMessageId` when the
 * model told us which specific message within the fragment it used (see
 * handleQuestion), falling back to sourceMessageIds[0] otherwise (the
 * refused/related path never gets model guidance on this, since the LLM
 * either wasn't consulted or didn't single out a source).
 */
async function buildCitations(candidates, lang) {
  if (candidates.length === 0) return [];

  const targetMessageIds = candidates.map((c) => c.citedMessageId ?? c.sourceMessageIds[0]);
  const messages = await getMessagesByIds(targetMessageIds);
  const byId = new Map(messages.map((m) => [Number(m.id), m]));
  const unknownAuthor = lang === "ru" ? "неизвестный автор" : "unknown author";

  return candidates.map((candidate, i) => {
    const message = byId.get(Number(targetMessageIds[i]));
    return {
      authorDisplayName: message?.author_display_name ?? unknownAuthor,
      messageDate: candidate.firstMessageAt,
      telegramMessageId: message?.telegram_message_id,
      textPreview: truncate(message?.text ?? "", PREVIEW_MAX_CHARS),
      link: buildMessageLink(message?.telegram_chat_id, message?.telegram_message_id),
    };
  });
}
