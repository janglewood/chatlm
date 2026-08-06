import { getMtprotoClient } from "./client.js";
import { getActiveChats, updateLastBackfillAt } from "../db/chats.js";
import { getMaxTelegramMessageId, insertMessage } from "../db/messages.js";
import { upsertUser } from "../db/users.js";
import { chunkAndEmbed } from "../embeddings/pipeline.js";
import { logger } from "../logger.js";
import { getBotIdentity } from "../telegram/botIdentity.js";
import { isAddressedToBot } from "../telegram/botMention.js";

const MAX_MIGRATION_CHAIN_DEPTH = 5;

function displayNameFromSender(sender, senderId) {
  if (sender) {
    const name = [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (sender.username) return sender.username;
  }
  return senderId ?? "Unknown";
}

/**
 * A basic group upgraded to a supergroup gets an entirely new Telegram peer
 * — its pre-upgrade history lives under the OLD peer ID and is never
 * renumbered into the new one. The only pointer back to it is a
 * MessageActionChannelMigrateFrom service message, normally the very first
 * item in the new peer's history. Returns the old peer's marked (Bot-API
 * style, negative) chat ID, or null if this peer was never upgraded from
 * something else.
 */
async function findMigrationSourceChatId(client, telegramChatId) {
  for await (const message of client.iterMessages(telegramChatId, { minId: 0, reverse: true, limit: 1 })) {
    if (message.action?.className === "MessageActionChannelMigrateFrom") {
      return -Number(message.action.chatId);
    }
  }
  return null;
}

/**
 * Pulls new-to-us messages for one specific Telegram peer via MTProto and
 * upserts them, idempotently, against our internal `chat.id`. On the very
 * first run for a peer (no messages stored yet from it) this fetches the
 * entire available history — i.e. this IS the backfill. On every later run
 * it only fetches messages newer than the last known one from THIS peer
 * (see getMaxTelegramMessageId's peer-scoping note).
 *
 * @param {number} chatId our internal chat id
 * @param {string|number} telegramChatId the peer to pull from — may differ
 *   from the chat's *current* telegram_chat_id when backfilling pre-upgrade
 *   history from an old, migrated-from peer.
 * @param {{ id: string, username: string|undefined }} botIdentity used to
 *   filter out the bot's own replies and "@bot, question" messages — see
 *   botIdentity.js/botMention.js. Unlike the live Bot API path, MTProto sees
 *   the full chat history exactly as a human member would, bot messages
 *   included, so this filtering has to happen here too.
 * @returns {Promise<{ fetched: number, upserted: number }>}
 */
async function syncFromPeer(client, chatId, telegramChatId, botIdentity) {
  const resumePoint = await getMaxTelegramMessageId(chatId, telegramChatId);

  let fetched = 0;
  let upserted = 0;

  // reverse: true walks oldest -> newest, and makes minId behave as an
  // exclusive resume point (per teleproto's IterMessagesParams docs) —
  // exactly what we want for "everything after the last message we have".
  for await (const message of client.iterMessages(telegramChatId, {
    minId: resumePoint ?? 0,
    reverse: true,
  })) {
    fetched++;

    // Skip non-text messages (media-only, service messages) for MVP — the
    // product only indexes text history.
    if (!message.message) continue;

    const senderId = message.senderId ? message.senderId.toString() : null;

    // Not real chat content — see botIdentity.js/botMention.js.
    if (senderId === botIdentity.id) continue;
    if (isAddressedToBot(message.message, botIdentity.username)) continue;

    const displayName = displayNameFromSender(message.sender, senderId);

    if (senderId) {
      await upsertUser({ telegramUserId: senderId, displayName });
    }

    const inserted = await insertMessage({
      chatId,
      telegramChatId,
      telegramMessageId: message.id,
      authorTelegramUserId: senderId,
      authorDisplayName: displayName,
      text: message.message,
      sentAt: new Date(message.date * 1000),
    });

    if (inserted) upserted++;
  }

  return { fetched, upserted };
}

/**
 * Syncs one chat's full reachable history: the current peer, plus — if it
 * was ever upgraded from a basic group — every peer further back in the
 * migration chain (rare to be more than one hop, but not impossible if a
 * group got migrated more than once). See API_CONTRACTS.md §2a — there is
 * deliberately no separate "backfill" code path; the first run for a peer
 * naturally fetches everything, later runs fetch only what's new.
 *
 * @param {{ id: number, telegram_chat_id: string|number }} chat
 * @returns {Promise<{ fetched: number, upserted: number }>} totals across
 *   every peer in the chain
 */
export async function runMtprotoSync(chat) {
  const client = await getMtprotoClient();
  const botIdentity = await getBotIdentity();

  let totalFetched = 0;
  let totalUpserted = 0;
  let telegramChatId = chat.telegram_chat_id;

  for (let hop = 0; hop < MAX_MIGRATION_CHAIN_DEPTH; hop++) {
    const { fetched, upserted } = await syncFromPeer(client, chat.id, telegramChatId, botIdentity);
    totalFetched += fetched;
    totalUpserted += upserted;

    const sourceChatId = await findMigrationSourceChatId(client, telegramChatId);
    if (sourceChatId == null) break;

    logger.info({ chatId: chat.id, telegramChatId, sourceChatId }, "Following migration chain for pre-upgrade history");
    telegramChatId = sourceChatId;
  }

  await updateLastBackfillAt(chat.id);

  if (totalUpserted > 0) {
    await chunkAndEmbed(chat.id);
  }

  logger.info({ chatId: chat.id, fetched: totalFetched, upserted: totalUpserted }, "MTProto sync complete");
  return { fetched: totalFetched, upserted: totalUpserted };
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
