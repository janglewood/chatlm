import { pool } from "./pool.js";

/** @param {import('pg').PoolClient | typeof pool} [client] */
export async function insertChunk(
  { chatId, sourceMessageIds, text, tokenCount, firstMessageAt },
  client = pool,
) {
  const { rows } = await client.query(
    `INSERT INTO chunks (chat_id, source_message_ids, text, token_count, first_message_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [chatId, sourceMessageIds, text, tokenCount, firstMessageAt],
  );
  return rows[0];
}

export async function deleteAllForChat(chatId, client = pool) {
  await client.query(`DELETE FROM chunks WHERE chat_id = $1`, [chatId]);
}
