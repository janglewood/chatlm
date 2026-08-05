import { pool } from "./pool.js";

export async function createDeletionRequest({ chatId, requestedByTelegramUserId }) {
  const { rows } = await pool.query(
    `INSERT INTO deletion_requests (chat_id, requested_by_telegram_user_id) VALUES ($1, $2) RETURNING *`,
    [chatId, requestedByTelegramUserId],
  );
  return rows[0];
}

export async function markDeletionRequestCompleted(id) {
  await pool.query(
    `UPDATE deletion_requests SET status = 'completed', completed_at = now() WHERE id = $1`,
    [id],
  );
}

export async function markDeletionRequestFailed(id) {
  await pool.query(`UPDATE deletion_requests SET status = 'failed' WHERE id = $1`, [id]);
}
