import { pool } from "./pool.js";

/**
 * Resolves a chat row by its Telegram chat id, creating one if it doesn't
 * exist yet. No consent gate — see MVP_SCOPE.md risk #2.
 */
export async function getOrCreateChat({ telegramChatId, title, ownerTelegramUserId }) {
  const existing = await pool.query(`SELECT * FROM chats WHERE telegram_chat_id = $1`, [
    telegramChatId,
  ]);
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await pool.query(
    `INSERT INTO chats (telegram_chat_id, title, owner_telegram_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_chat_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id
     RETURNING *`,
    [telegramChatId, title ?? null, ownerTelegramUserId ?? null],
  );
  return inserted.rows[0];
}

export async function getChatById(chatId) {
  const { rows } = await pool.query(`SELECT * FROM chats WHERE id = $1`, [chatId]);
  return rows[0] ?? null;
}

export async function getChatByTelegramId(telegramChatId) {
  const { rows } = await pool.query(`SELECT * FROM chats WHERE telegram_chat_id = $1`, [
    telegramChatId,
  ]);
  return rows[0] ?? null;
}

/** Chats the MTProto sync job and other background jobs should still act on. */
export async function getActiveChats() {
  const { rows } = await pool.query(`SELECT * FROM chats WHERE deleted_at IS NULL`);
  return rows;
}

/**
 * Used to resolve which chat a DM question is about. MVP has no
 * chat-membership tracking (brief §4 scopes out team roles), so this only
 * looks at chats the user personally connected the bot to — see
 * bot/index.js's DM handler for the "which chat?" disambiguation this feeds.
 */
export async function getActiveChatsOwnedByUser(telegramUserId) {
  const { rows } = await pool.query(
    `SELECT * FROM chats WHERE owner_telegram_user_id = $1 AND deleted_at IS NULL`,
    [telegramUserId],
  );
  return rows;
}

export async function updateLastBackfillAt(chatId) {
  await pool.query(`UPDATE chats SET last_backfill_at = now() WHERE id = $1`, [chatId]);
}

export async function markChatDeleted(chatId, client = pool) {
  await client.query(`UPDATE chats SET deleted_at = now() WHERE id = $1`, [chatId]);
}

export async function setPlanTier(chatId, planTier) {
  await pool.query(`UPDATE chats SET plan_tier = $2 WHERE id = $1`, [chatId, planTier]);
}
