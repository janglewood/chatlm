import { getOrCreateChat, getChatByTelegramId, updateTelegramChatId } from "../db/chats.js";
import { upsertUser } from "../db/users.js";
import { insertMessage } from "../db/messages.js";
import { chunkAndEmbed } from "../embeddings/pipeline.js";
import { debounce } from "./queue.js";
import { logger } from "../logger.js";
import { runMtprotoSync } from "../mtproto/sync.js";

/**
 * Entry point for every real-time Telegram message in a group chat
 * (API_CONTRACTS.md §2). No consent gate — MVP indexes every chat the bot is
 * connected to (MVP_SCOPE.md risk #2).
 *
 * @param {{ telegramChatId: string|number, chatTitle?: string, telegramMessageId: number,
 *   telegramUserId?: string|number, authorDisplayName: string, text: string, sentAt: Date }} msg
 * @returns {Promise<{ chat: object, inserted: object|null }>}
 */
export async function handleIncomingMessage(msg) {
  const chat = await getOrCreateChat({
    telegramChatId: msg.telegramChatId,
    title: msg.chatTitle,
  });

  await upsertUser({
    telegramUserId: msg.telegramUserId,
    displayName: msg.authorDisplayName,
  });

  const inserted = await insertMessage({
    chatId: chat.id,
    telegramChatId: msg.telegramChatId,
    telegramMessageId: msg.telegramMessageId,
    authorTelegramUserId: msg.telegramUserId,
    authorDisplayName: msg.authorDisplayName,
    text: msg.text,
    sentAt: msg.sentAt,
  });

  if (inserted) {
    debounce(chat.id, () => chunkAndEmbed(chat.id));
  }

  return { chat, inserted };
}

/**
 * Called on `my_chat_member` when the bot is added to a group.
 *
 * The Bot API only sees messages sent *after* the bot joins, so without an
 * immediate backfill a freshly-added chat would have zero searchable history
 * until the next twice-daily MTProto sync — up to a 12h dead window where
 * questions about pre-existing history come back "not found" even though
 * the chat has plenty of that history. Kick off a sync right away instead.
 *
 * Fire-and-forget deliberately: runMtprotoSync can take a while for a chat
 * with real history, and there's no reason to make the my_chat_member
 * handler (and thus Telegraf's update loop) wait on it. A failure here just
 * means the twice-daily cron picks it up later — runMtprotoSync resumes
 * from the last message it has, so nothing is lost or re-fetched by rerunning.
 */
export async function handleBotAddedToChat({ telegramChatId, chatTitle, ownerTelegramUserId }) {
  const chat = await getOrCreateChat({
    telegramChatId,
    title: chatTitle,
    ownerTelegramUserId,
  });
  logger.info({ chatId: chat.id, telegramChatId }, "Bot added to chat");

  runMtprotoSync(chat).catch((err) => {
    logger.error({ err, chatId: chat.id }, "Immediate backfill on chat-add failed");
  });

  return chat;
}

/**
 * Resolves the chat row for a question asked via @mention (bot/index.js).
 * Group questions can arrive without ever going through handleBotAddedToChat
 * — the bot might already have been a member before this process started
 * (no fresh my_chat_member "added" event fires for that), and the very
 * first interaction can be a question rather than a plain message. A bare
 * getOrCreateChat in that situation would silently spin up a chat row with
 * zero history and no backfill ever triggered, so every question against it
 * comes back "not found" even though the chat has plenty of real history —
 * this is what actually happened in testing before this existed.
 *
 * Unlike handleBotAddedToChat's fire-and-forget sync, this AWAITS the
 * backfill when the chat has never been synced (last_backfill_at is null) —
 * deliberately, since it only happens once per chat (every later question
 * already has last_backfill_at set) and answering "not found" when the real
 * answer was one sync away is a worse outcome than the asker waiting a bit
 * longer for a real answer.
 */
export async function resolveChatForQuestion({ telegramChatId, chatTitle }) {
  const chat = await getOrCreateChat({ telegramChatId, title: chatTitle });

  if (chat.last_backfill_at == null) {
    try {
      await runMtprotoSync(chat);
    } catch (err) {
      logger.error({ err, chatId: chat.id }, "Backfill on first question failed");
    }
  }

  return chat;
}

/**
 * Called when Telegram reports a basic-group-to-supergroup upgrade
 * (`migrate_to_chat_id` on the old chat, or `migrate_from_chat_id` on the
 * new one — see bot/index.js). Unlike joining/leaving, this does NOT change
 * the bot's own membership, so `my_chat_member` never fires for it — without
 * this handler, the next message would arrive addressed to an ID we don't
 * recognize, and getOrCreateChat would spin up a second, empty chat row,
 * orphaning every message/chunk/embedding already indexed under the old one.
 *
 * Repointing chats.telegram_chat_id is sufficient on its own: every other
 * table (messages, chunks, embeddings, usage_counters, ...) is keyed by our
 * internal chat.id, not the Telegram id, so nothing else needs to move.
 * Already-stored message rows correctly keep their own (old) telegram_chat_id
 * — see the messages schema comment — since that's genuinely where they
 * came from and mtproto/sync.js's migration-chain logic already knows how to
 * resume syncing both peers under this one chat.id.
 */
export async function handleChatMigrated({ oldTelegramChatId, newTelegramChatId }) {
  const chat = await getChatByTelegramId(oldTelegramChatId);
  if (!chat) return; // we weren't tracking this chat under its old id — nothing to do

  await updateTelegramChatId(chat.id, newTelegramChatId);
  logger.info({ chatId: chat.id, oldTelegramChatId, newTelegramChatId }, "Chat migrated to supergroup");

  runMtprotoSync({ ...chat, telegram_chat_id: newTelegramChatId }).catch((err) => {
    logger.error({ err, chatId: chat.id }, "Post-migration sync failed");
  });
}
