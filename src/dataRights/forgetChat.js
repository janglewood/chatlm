import { withTransaction } from "../db/pool.js";
import * as messagesRepo from "../db/messages.js";
import * as chunksRepo from "../db/chunks.js";
import * as embeddingsRepo from "../db/embeddings.js";
import { markChatDeleted } from "../db/chats.js";
import {
  createDeletionRequest,
  markDeletionRequestCompleted,
  markDeletionRequestFailed,
} from "../db/deletionRequests.js";
import { logger } from "../logger.js";

/**
 * Hard-deletes all indexed data for a chat (API_CONTRACTS.md §4). There is
 * no consent/opt-in flow to gate this on — cut from MVP per MVP_SCOPE.md
 * risk #2 — but this is a distinct data-rights requirement from the brief,
 * kept regardless.
 *
 * Note: the MTProto sync job skips chats with deleted_at IS NOT NULL (see
 * mtproto/sync.js), or a "forgotten" chat's history would simply be
 * re-indexed on the next twice-daily run.
 *
 * @param {{ chatId: number, requestedByTelegramUserId: string|number }} params
 */
export async function forgetChat({ chatId, requestedByTelegramUserId }) {
  const request = await createDeletionRequest({ chatId, requestedByTelegramUserId });

  try {
    await withTransaction(async (client) => {
      await embeddingsRepo.deleteAllForChat(chatId, client);
      await chunksRepo.deleteAllForChat(chatId, client);
      await messagesRepo.deleteAllForChat(chatId, client);
      await markChatDeleted(chatId, client);
    });

    await markDeletionRequestCompleted(request.id);
    logger.info({ chatId }, "Chat data deleted on request");
  } catch (err) {
    await markDeletionRequestFailed(request.id);
    logger.error({ err, chatId }, "Failed to delete chat data");
    throw err;
  }
}
