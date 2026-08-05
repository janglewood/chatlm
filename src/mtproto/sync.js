import { getMtprotoClient } from "./client.js";
import { getActiveChats, updateLastBackfillAt } from "../db/chats.js";
import { getMaxTelegramMessageId, insertMessage } from "../db/messages.js";
import { upsertUser } from "../db/users.js";
import { chunkAndEmbed } from "../embeddings/pipeline.js";
import { logger } from "../logger.js";

function displayNameFromSender(sender, senderId) {
  if (sender) {
    const name = [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (sender.username) return sender.username;
  }
  return senderId ?? "Unknown";
}

/**
 * Pulls new-to-us messages for one chat via MTProto and upserts them,
 * idempotently. On the very first run for a chat (no messages stored yet)
 * this fetches the entire available history — i.e. this IS the backfill.
 * On every later run it only fetches messages newer than the last known
 * one. See API_CONTRACTS.md §2a — there is deliberately no separate
 * "backfill" code path.
 *
 * @param {{ id: number, telegram_chat_id: string|number }} chat
 * @returns {Promise<{ fetched: number, upserted: number }>}
 */
export async function runMtprotoSync(chat) {
  const client = await getMtprotoClient();
  const resumePoint = await getMaxTelegramMessageId(chat.id);

  let fetched = 0;
  let upserted = 0;

  // reverse: true walks oldest -> newest, and makes minId behave as an
  // exclusive resume point (per teleproto's IterMessagesParams docs) —
  // exactly what we want for "everything after the last message we have".
  for await (const message of client.iterMessages(chat.telegram_chat_id, {
    minId: resumePoint ?? 0,
    reverse: true,
  })) {
    fetched++;

    // Skip non-text messages (media-only, service messages) for MVP — the
    // product only indexes text history.
    if (!message.message) continue;

    const senderId = message.senderId ? message.senderId.toString() : null;
    const displayName = displayNameFromSender(message.sender, senderId);

    if (senderId) {
      await upsertUser({ telegramUserId: senderId, displayName });
    }

    const inserted = await insertMessage({
      chatId: chat.id,
      telegramMessageId: message.id,
      authorTelegramUserId: senderId,
      authorDisplayName: displayName,
      text: message.message,
      sentAt: new Date(message.date * 1000),
    });

    if (inserted) upserted++;
  }

  await updateLastBackfillAt(chat.id);

  if (upserted > 0) {
    await chunkAndEmbed(chat.id);
  }

  logger.info({ chatId: chat.id, fetched, upserted }, "MTProto sync complete");
  return { fetched, upserted };
}

/**
 * Scheduler entry point (node-cron, twice daily — see src/mtproto/schedule.js).
 * Iterates every active chat sequentially — not in parallel — to stay well
 * under Telegram's account-level rate limits for a single user account
 * (MVP_SCOPE.md risk #6). `getActiveChats()` already excludes chats with
 * deleted_at set, so a "forgotten" chat (risk #7) is never re-synced.
 */
export async function runMtprotoSyncForAllChats() {
  const chats = await getActiveChats();
  for (const chat of chats) {
    try {
      await runMtprotoSync(chat);
    } catch (err) {
      logger.error({ err, chatId: chat.id }, "MTProto sync failed for chat");
    }
  }
}
