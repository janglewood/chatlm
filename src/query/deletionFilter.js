import { getMessagesByIds, markMessagesDeleted, resetIndexedAt } from "../db/messages.js";
import { deleteChunksByIds } from "../db/chunks.js";
import { findDeletedMessageIds } from "../mtproto/checkDeleted.js";
import { chunkAndEmbed } from "../embeddings/pipeline.js";
import { logger } from "../logger.js";

/**
 * Drops any retrieved candidate whose underlying chat history was deleted
 * from Telegram since we indexed it. Checked here — right after retrieval,
 * before the LLM ever sees the candidates — rather than only scrubbing
 * citations after the fact: a deleted-but-uncited candidate could still
 * shape the model's free-text answer even if we later hid it from the
 * citation list, and presenting possibly-retracted information as settled
 * fact is exactly the failure mode this exists to prevent. Someone deleting
 * a message is a deliberate signal we should honor, same principle as
 * /forget_chat, just at message granularity instead of whole-chat.
 *
 * A chunk merges several messages into one embedded blob of text, so
 * deletion is detected at message granularity but has to be enforced at
 * chunk granularity — there's no clean way to excise one message's words
 * from an already-concatenated chunk. A chunk with ANY deleted source
 * message is dropped entirely (its embedding goes with it via ON DELETE
 * CASCADE), and its surviving messages are requeued (indexed_at reset to
 * NULL) so the next chunking pass regroups them cleanly instead of losing
 * them for good.
 *
 * Confirmed deletions are written back to messages.deleted_at so a future
 * question retrieving the same chunk doesn't pay the MTProto round trip
 * again — this runs once per message, not once per question.
 *
 * @param {number} chatId
 * @param {Array<{ chunkId: number, sourceMessageIds: number[] }>} candidates
 * @returns {Promise<typeof candidates>} candidates with tainted chunks removed
 */
export async function filterDeletedCandidates(chatId, candidates) {
  if (candidates.length === 0) return candidates;

  const allMessageIds = [...new Set(candidates.flatMap((c) => c.sourceMessageIds))];
  const messages = await getMessagesByIds(allMessageIds);

  const deletedIds = await findDeletedMessageIds(
    messages.map((m) => ({
      id: Number(m.id),
      telegramChatId: m.telegram_chat_id,
      // pg returns BIGINT columns as strings by default — MTProto's
      // getMessages throws ("Cannot cast ... to InputMessage") on a string
      // id instead of silently coercing it, so this has to be a real Number.
      telegramMessageId: Number(m.telegram_message_id),
    })),
  );

  if (deletedIds.size === 0) return candidates;

  await markMessagesDeleted([...deletedIds]);

  const taintedChunkIds = [];
  const survivorIds = [];
  const liveCandidates = [];

  for (const candidate of candidates) {
    const hasDeleted = candidate.sourceMessageIds.some((id) => deletedIds.has(Number(id)));
    if (!hasDeleted) {
      liveCandidates.push(candidate);
      continue;
    }
    taintedChunkIds.push(candidate.chunkId);
    for (const id of candidate.sourceMessageIds) {
      if (!deletedIds.has(Number(id))) survivorIds.push(id);
    }
  }

  await deleteChunksByIds(taintedChunkIds);
  await resetIndexedAt(survivorIds);
  logger.info(
    { chatId, deletedMessageCount: deletedIds.size, taintedChunkCount: taintedChunkIds.length },
    "Dropped chunks containing Telegram-deleted messages",
  );

  // Fire-and-forget: get survivors re-chunked promptly rather than waiting
  // for the next real message or twice-daily sync to trigger it. Doesn't
  // block this question's answer either way.
  chunkAndEmbed(chatId).catch((err) => {
    logger.error({ err, chatId }, "Re-chunking survivors after deletion failed");
  });

  return liveCandidates;
}
