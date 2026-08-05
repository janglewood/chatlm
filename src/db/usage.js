import { pool } from "./pool.js";

/** Atomically bumps today's question counter for a chat and returns the new count. */
export async function incrementQuestionCount(chatId) {
  const { rows } = await pool.query(
    `INSERT INTO usage_counters (chat_id, day, question_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (chat_id, day) DO UPDATE SET question_count = usage_counters.question_count + 1
     RETURNING question_count`,
    [chatId],
  );
  return rows[0].question_count;
}

export async function addLlmTokensUsed(chatId, tokens) {
  if (!tokens) return;
  await pool.query(
    `INSERT INTO usage_counters (chat_id, day, llm_tokens_used)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (chat_id, day) DO UPDATE SET llm_tokens_used = usage_counters.llm_tokens_used + $2`,
    [chatId, tokens],
  );
}

export async function addEmbeddingTokensUsed(chatId, tokens) {
  if (!tokens) return;
  await pool.query(
    `INSERT INTO usage_counters (chat_id, day, embedding_tokens_used)
     VALUES ($1, CURRENT_DATE, $2)
     ON CONFLICT (chat_id, day) DO UPDATE SET embedding_tokens_used = usage_counters.embedding_tokens_used + $2`,
    [chatId, tokens],
  );
}
