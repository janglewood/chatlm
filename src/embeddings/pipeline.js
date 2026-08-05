import { getUnindexedMessages, markMessagesIndexed } from "../db/messages.js";
import { insertChunk } from "../db/chunks.js";
import { insertEmbedding } from "../db/embeddings.js";
import { withTransaction } from "../db/pool.js";
import { buildChunks } from "../ingestion/chunking.js";
import { getEmbeddingProvider } from "./index.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

// Voyage (and most embedding APIs) cap how many texts one request can carry;
// sending everything from a large backfill in a single call also makes any
// rate-limit or transient failure discard the whole batch. Batching keeps
// each request small and lets a failure be retried per-batch instead.
const EMBED_BATCH_SIZE = 64;

const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedBatchWithRetry(provider, batch, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.embed(batch, options);
    } catch (err) {
      const isRateLimit = err?.statusCode === 429;
      if (!isRateLimit || attempt >= MAX_RETRIES) throw err;
      const backoffMs = 2 ** attempt * 5000; // 5s, 10s, 20s, 40s
      logger.warn({ attempt, backoffMs }, "Embedding provider rate-limited, backing off");
      await sleep(backoffMs);
    }
  }
}

async function embedInBatches(provider, texts, options) {
  const results = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const batchResults = await embedBatchWithRetry(provider, batch, options);
    results.push(...batchResults);
  }
  return results;
}

/**
 * Groups newly-ingested, not-yet-chunked messages for a chat into
 * token-bounded chunks, embeds each chunk, and stores chunk + embedding rows
 * in a single transaction. Idempotent: messages already covered by a chunk
 * (indexed_at IS NOT NULL) are skipped. Shared by both ingestion sources
 * (real-time Bot API and the MTProto sync job) — API_CONTRACTS.md §2.
 *
 * @param {number} chatId
 * @returns {Promise<{ chunksCreated: number }>}
 */
export async function chunkAndEmbed(chatId) {
  const messages = await getUnindexedMessages(chatId);
  if (messages.length === 0) return { chunksCreated: 0 };

  const chunks = buildChunks(messages, env.CHUNK_MAX_TOKENS, env.CHUNK_MAX_GAP_MINUTES);
  const provider = getEmbeddingProvider();
  const embeddings = await embedInBatches(
    provider,
    chunks.map((chunk) => chunk.text),
    { inputType: "document" },
  );

  await withTransaction(async (client) => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];

      const chunkRow = await insertChunk(
        {
          chatId,
          sourceMessageIds: chunk.sourceMessageIds,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          firstMessageAt: chunk.firstMessageAt,
        },
        client,
      );

      await insertEmbedding(
        { chunkId: chunkRow.id, vector: embedding.vector, model: embedding.model },
        client,
      );
    }

    const allMessageIds = chunks.flatMap((chunk) => chunk.sourceMessageIds);
    await markMessagesIndexed(allMessageIds, client);
  });

  logger.info({ chatId, chunksCreated: chunks.length }, "Chunked and embedded new messages");
  return { chunksCreated: chunks.length };
}
