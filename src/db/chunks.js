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

/**
 * Drops specific chunks — used when one of a chunk's source messages was
 * deleted from Telegram (see query/deletionFilter.js). A chunk merges
 * several messages into one embedded blob of text, so there's no clean way
 * to excise just the deleted message's contribution; the whole chunk is
 * discarded and its surviving messages get re-chunked fresh. Cascades to
 * the chunk's embedding via embeddings.chunk_id's ON DELETE CASCADE.
 */
export async function deleteChunksByIds(chunkIds, client = pool) {
  if (chunkIds.length === 0) return;
  await client.query(`DELETE FROM chunks WHERE id = ANY($1::bigint[])`, [chunkIds]);
}
