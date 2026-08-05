import { env } from "../config/env.js";
import * as voyageProvider from "./voyageProvider.js";

// Only Voyage is implemented for MVP (see MVP_SCOPE.md §Embedding provider
// decision). OpenAI/Cohere adapters can be added here later behind the same
// { embed(texts, options) } shape without touching any caller.
const providers = {
  voyage: voyageProvider,
};

export function getEmbeddingProvider() {
  const provider = providers[env.EMBEDDING_PROVIDER];
  if (!provider) {
    throw new Error(
      `Unknown EMBEDDING_PROVIDER "${env.EMBEDDING_PROVIDER}" — only "voyage" is implemented.`,
    );
  }
  return provider;
}
