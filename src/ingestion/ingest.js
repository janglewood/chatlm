import { getOrCreateChat } from "../db/chats.js";
import { upsertUser } from "../db/users.js";
import { insertMessage } from "../db/messages.js";
import { chunkAndEmbed } from "../embeddings/pipeline.js";
import { debounce } from "./queue.js";
import { logger } from "../logger.js";

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

/** Called on `my_chat_member` when the bot is added to a group. */
export async function handleBotAddedToChat({ telegramChatId, chatTitle, ownerTelegramUserId }) {
  const chat = await getOrCreateChat({
    telegramChatId,
    title: chatTitle,
    ownerTelegramUserId,
  });
  logger.info({ chatId: chat.id, telegramChatId }, "Bot added to chat");
  return chat;
}
