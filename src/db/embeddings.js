import { pool } from "./pool.js";
import { toSql } from "pgvector/pg";

/** @param {import('pg').PoolClient | typeof pool} [client] */
export async function insertEmbedding({ chunkId, vector, model }, client = pool) {
  await client.query(
    `INSERT INTO embeddings (chunk_id, vector, model) VALUES ($1, $2::vector, $3)`,
    [chunkId, toSql(vector), model],
  );
}

/**
 * Top-k nearest chunks for a chat, ranked by cosine similarity.
 * `<=>` is pgvector's cosine *distance* operator (0 = identical); we convert
 * to a similarity score (1 - distance) since vectors are normalized by the
 * embedding provider — see DATA_MODEL.md.
 *
 * @returns {Promise<Array<{ chunkId: number, text: string, firstMessageAt: Date,
 *   sourceMessageIds: number[], similarityScore: number }>>}
 */
export async function topK(chatId, vector, k) {
  const { rows } = await pool.query(
    `SELECT
       c.id AS chunk_id,
       c.text,
       c.first_message_at,
       c.source_message_ids,
       1 - (e.vector <=> $2::vector) AS similarity_score
     FROM embeddings e
     JOIN chunks c ON c.id = e.chunk_id
     WHERE c.chat_id = $1
     ORDER BY e.vector <=> $2::vector
     LIMIT $3`,
    [chatId, toSql(vector), k],
  );

  return rows.map((row) => ({
    chunkId: Number(row.chunk_id),
    text: row.text,
    firstMessageAt: row.first_message_at,
    sourceMessageIds: row.source_message_ids,
    similarityScore: Number(row.similarity_score),
  }));
}

export async function deleteAllForChat(chatId, client = pool) {
  await client.query(
    `DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE chat_id = $1)`,
    [chatId],
  );
}
