import { VoyageAIClient } from "voyageai";
import { env, requireEnv } from "../config/env.js";

// Constructed lazily (not at module load) so merely importing this file —
// e.g. via the bot's import chain — doesn't fail before EMBEDDING_API_KEY is
// actually needed. See config/env.js's note on why these keys are optional.
let client = null;
function getClient() {
  if (!client) {
    requireEnv(["EMBEDDING_API_KEY"]);
    client = new VoyageAIClient({ apiKey: env.EMBEDDING_API_KEY });
  }
  return client;
}

/**
 * EmbeddingProvider implementation for Voyage AI (MVP default — see
 * MVP_SCOPE.md §Embedding provider decision). `inputType` enables Voyage's
 * asymmetric query/document encoding: pass 'document' when embedding chunks
 * for storage, 'query' when embedding a user's question for retrieval.
 *
 * @param {string[]} texts
 * @param {{ inputType?: 'query' | 'document' }} [options]
 * @returns {Promise<Array<{ vector: number[], model: string, dims: number }>>}
 */
export async function embed(texts, { inputType } = {}) {
  if (texts.length === 0) return [];

  const response = await getClient().embed({
    input: texts,
    model: env.EMBEDDING_MODEL,
    outputDimension: env.EMBEDDING_DIMENSIONS,
    inputType,
  });

  const model = response.model ?? env.EMBEDDING_MODEL;

  return (response.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => ({ vector: item.embedding, model, dims: item.embedding.length }));
}
