import { getEmbeddingProvider } from "../embeddings/index.js";
import { topK } from "../db/embeddings.js";
import { getMessagesByIds } from "../db/messages.js";
import { getChatById } from "../db/chats.js";
import { getLlmProvider } from "../llm/index.js";
import { checkAndIncrement } from "../rateLimit/rateLimiter.js";
import { addLlmTokensUsed } from "../db/usage.js";
import { env } from "../config/env.js";

const TOP_K = 8;
const NO_INFO_TEXT = "Не нашёл информации по этому вопросу.";
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
 * @returns {Promise<{ text: string, citations: Citation[], refused: boolean }>}
 */
export async function handleQuestion({ chatId, telegramUserId, questionText }) {
  // Cost guardrail #1: enforced before any embedding/LLM call.
  await checkAndIncrement(chatId, telegramUserId);

  const chat = await getChatById(chatId);
  const embeddingProvider = getEmbeddingProvider();
  const [{ vector }] = await embeddingProvider.embed([questionText], { inputType: "query" });

  const candidates = await topK(chatId, vector, TOP_K);

  // Cost guardrail #2: below-threshold retrieval never reaches the LLM —
  // but we still surface loosely-related messages if any clear the much
  // lower RELATED_MESSAGES_MIN_SCORE bar, instead of a bare "not found".
  if (candidates.length === 0 || candidates[0].similarityScore < env.CONFIDENCE_THRESHOLD) {
    const citations = await buildCitations(filterRelated(candidates), chat.telegram_chat_id);
    return { text: NO_INFO_TEXT, citations, refused: true };
  }

  const llmProvider = getLlmProvider();
  const answer = await llmProvider.generateAnswer({ question: questionText, contextChunks: candidates });

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
      : await buildCitations(filterRelated(candidates), chat.telegram_chat_id);
    return { text: answer.text, citations, refused: true };
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
  const others = filterRelated(candidates.filter((_, i) => i !== primaryIndex));

  const citations = await buildCitations([primary, ...others], chat.telegram_chat_id);
  return { text: answer.text, citations, refused: false };
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
 */
function buildMessageLink(telegramChatId, telegramMessageId) {
  if (!telegramChatId || !telegramMessageId) return null;
  const idStr = String(telegramChatId);
  if (!idStr.startsWith("-100")) return null;
  return `https://t.me/c/${idStr.slice(4)}/${telegramMessageId}`;
}

/** Author, date, short preview, and (when possible) a deep link for each candidate's first source message. */
async function buildCitations(candidates, telegramChatId) {
  if (candidates.length === 0) return [];

  const firstMessageIds = candidates.map((c) => c.sourceMessageIds[0]);
  const firstMessages = await getMessagesByIds(firstMessageIds);
  const byId = new Map(firstMessages.map((m) => [Number(m.id), m]));

  return candidates.map((candidate) => {
    const message = byId.get(Number(candidate.sourceMessageIds[0]));
    return {
      authorDisplayName: message?.author_display_name ?? "неизвестный автор",
      messageDate: candidate.firstMessageAt,
      telegramMessageId: message?.telegram_message_id,
      textPreview: truncate(message?.text ?? "", PREVIEW_MAX_CHARS),
      link: buildMessageLink(telegramChatId, message?.telegram_message_id),
    };
  });
}
