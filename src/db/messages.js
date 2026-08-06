import { pool } from "./pool.js";

/**
 * Idempotent insert — used by both the real-time Bot API listener and the
 * MTProto sync job, which may race on the same message (API_CONTRACTS.md §2).
 * Returns the inserted row, or null if it already existed.
 *
 * `telegramChatId` is the peer this specific message came from — see the
 * column comment in the schema migration. For ordinary ingestion this is
 * just the chat's current telegram_chat_id; it only differs when backfilling
 * pre-supergroup-upgrade history from an old peer.
 */
export async function insertMessage({
  chatId,
  telegramChatId,
  telegramMessageId,
  authorTelegramUserId,
  authorDisplayName,
  text,
  sentAt,
}) {
  const { rows } = await pool.query(
    `INSERT INTO messages (chat_id, telegram_chat_id, telegram_message_id, author_telegram_user_id, author_display_name, text, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (chat_id, telegram_chat_id, telegram_message_id) DO NOTHING
     RETURNING *`,
    [chatId, telegramChatId, telegramMessageId, authorTelegramUserId ?? null, authorDisplayName, text, sentAt],
  );
  return rows[0] ?? null;
}

/**
 * Resume point for the MTProto sync job (API_CONTRACTS.md §2a) — scoped to
 * one peer. A chat with pre-upgrade history spans two peers with entirely
 * separate telegram_message_id sequences (see schema comment), so a resume
 * point can only ever mean "the last ID we have from THIS peer" — a bare
 * MAX() across both would let a small ID from one peer wrongly look like
 * "already synced" against a large ID from the other, or vice versa.
 */
export async function getMaxTelegramMessageId(chatId, telegramChatId) {
  const { rows } = await pool.query(
    `SELECT MAX(telegram_message_id) AS max_id FROM messages WHERE chat_id = $1 AND telegram_chat_id = $2`,
    [chatId, telegramChatId],
  );
  return rows[0]?.max_id ?? null;
}

export async function getUnindexedMessages(chatId) {
  const { rows } = await pool.query(
    `SELECT * FROM messages WHERE chat_id = $1 AND indexed_at IS NULL AND deleted_at IS NULL ORDER BY sent_at ASC`,
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

/**
 * Marks messages confirmed deleted on Telegram's side — see
 * query/deletionFilter.js. Once set, getUnindexedMessages skips them
 * permanently: they should never end up re-chunked/re-embedded.
 */
export async function markMessagesDeleted(messageIds, client = pool) {
  if (messageIds.length === 0) return;
  await client.query(`UPDATE messages SET deleted_at = now() WHERE id = ANY($1::bigint[])`, [
    messageIds,
  ]);
}

/**
 * Requeues messages for re-chunking (see query/deletionFilter.js): when a
 * chunk is dropped because one of its source messages was deleted, its
 * surviving messages need a fresh chunk built without the deleted one —
 * this is what makes chunkAndEmbed pick them up again.
 */
export async function resetIndexedAt(messageIds, client = pool) {
  if (messageIds.length === 0) return;
  await client.query(`UPDATE messages SET indexed_at = NULL WHERE id = ANY($1::bigint[])`, [
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
