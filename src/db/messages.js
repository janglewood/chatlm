import { pool } from "./pool.js";

/**
 * Idempotent insert — used by both the real-time Bot API listener and the
 * MTProto sync job, which may race on the same message (API_CONTRACTS.md §2).
 * Returns the inserted row, or null if it already existed.
 */
export async function insertMessage({
  chatId,
  telegramMessageId,
  authorTelegramUserId,
  authorDisplayName,
  text,
  sentAt,
}) {
  const { rows } = await pool.query(
    `INSERT INTO messages (chat_id, telegram_message_id, author_telegram_user_id, author_display_name, text, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (chat_id, telegram_message_id) DO NOTHING
     RETURNING *`,
    [chatId, telegramMessageId, authorTelegramUserId ?? null, authorDisplayName, text, sentAt],
  );
  return rows[0] ?? null;
}

/** Resume point for the MTProto sync job (API_CONTRACTS.md §2a). */
export async function getMaxTelegramMessageId(chatId) {
  const { rows } = await pool.query(
    `SELECT MAX(telegram_message_id) AS max_id FROM messages WHERE chat_id = $1`,
    [chatId],
  );
  return rows[0]?.max_id ?? null;
}

export async function getUnindexedMessages(chatId) {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE chat_id = $1 AND indexed_at IS NULL ORDER BY sent_at ASC`,
    [chatId],
  );
  return rows;
}

export async function markMessagesIndexed(messageIds, client = pool) {
  if (messageIds.length === 0) return;
  await client.query(`UPDATE messages SET indexed_at = now() WHERE id = ANY($1::bigint[])`, [
    messageIds,
  ]);
}

/** Bulk lookup used for citation formatting (author + date of a chunk's first message). */
export async function getMessagesByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(`SELECT * FROM messages WHERE id = ANY($1::bigint[])`, [ids]);
  return rows;
}

export async function deleteAllForChat(chatId, client = pool) {
  await client.query(`DELETE FROM messages WHERE chat_id = $1`, [chatId]);
}
