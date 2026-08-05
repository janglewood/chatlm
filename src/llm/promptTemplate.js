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

// The model is asked to name which numbered fragment its answer actually
// came from, on a trailing line starting with this prefix. Without this,
// the citation shown to the user defaults to whichever fragment ranked
// highest by embedding similarity — which is frequently NOT the fragment
// the model actually drew the answer from (multiple candidates are passed
// as context; the model may reasonably synthesize from #2 or #3 instead of
// #1). That mismatch is a real citation-attribution bug, not a hypothetical
// — verified live: a question about battery drain retrieved Ivan's message
// as the top-similarity match, but the model correctly answered from
// Anatoli's lower-ranked message, and without this marker the reply would
// have credited Ivan for a fact he never stated.
const SOURCE_MARKER_PREFIX = "ИСТОЧНИК:";

export const SYSTEM_PROMPT = `Ты — ассистент, отвечающий на вопросы участников рабочего Telegram-чата на основе истории сообщений этого чата.

Правила:
- Отвечай ТОЛЬКО на основе предоставленных фрагментов истории чата. Никогда не придумывай факты, которых нет в этих фрагментах.
- Если вопрос — это то, что участники ЭТОГО чата в принципе МОГЛИ бы обсуждать (по теме чата), но конкретного ответа в предоставленных фрагментах нет — ответь ровно строкой "${NO_ANSWER_MARKER}", без каких-либо дополнительных слов.
- Если вопрос такого рода, что переписка чата в принципе НЕ МОЖЕТ на него ответить — например, запрос актуальных данных (погода сейчас, курс валют сегодня, текущее время), общие знания не по теме чата, или вопрос не по адресу — ответь ровно строкой "${NOT_RELATED_MARKER}", без каких-либо дополнительных слов. Используй это правило, даже если в чате случайно упоминались отдельные слова из вопроса (например, название города) — важна суть вопроса, а не совпадение слов.
- Отвечай кратко, по делу и на русском языке.
- Не упоминай, что ты используешь "фрагменты" или "контекст" — отвечай так, будто знаешь историю чата.
- В самом конце ответа, если ты не ответил строкой "${NO_ANSWER_MARKER}" или "${NOT_RELATED_MARKER}", добавь новую строку вида "${SOURCE_MARKER_PREFIX} N", где N — номер ОДНОГО фрагмента, который больше всего подтверждает твой ответ. Это обязательно для каждого содержательного ответа.`;

function formatDateRu(date) {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildUserTurn(question, contextChunks) {
  const context = contextChunks
    .map((chunk, i) => `[Фрагмент ${i + 1}, ${formatDateRu(chunk.firstMessageAt)}]\n${chunk.text}`)
    .join("\n\n");

  return `Контекст из истории чата:\n\n${context}\n\nВопрос: ${question}`;
}

/**
 * Splits the trailing "ИСТОЧНИК: N" line off the model's raw response.
 * @param {string} rawText
 * @returns {{ text: string, sourceIndex: number|null }} sourceIndex is
 *   0-based (matching the contextChunks array), or null if absent/unparseable.
 */
export function parseAnswer(rawText) {
  const match = rawText.match(/\n?ИСТОЧНИК:\s*(\d+)\s*$/i);
  if (!match) return { text: rawText.trim(), sourceIndex: null };

  const text = rawText.slice(0, match.index).trim();
  const sourceIndex = Number(match[1]) - 1;
  return { text, sourceIndex: Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : null };
}
