import { env } from "../config/env.js";
import * as anthropicProvider from "./anthropicProvider.js";
import * as openrouterProvider from "./openrouterProvider.js";

// Two ways to reach Claude (direct Anthropic API, or the same models via
// OpenRouter's billing/routing) plus room for a third provider later — all
// behind the same { generateAnswer({ question, contextChunks }) } shape, so
// the query pipeline never needs to know which one is active.
const providers = {
  anthropic: anthropicProvider,
  openrouter: openrouterProvider,
};

export function getLlmProvider() {
  const provider = providers[env.LLM_PROVIDER];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${env.LLM_PROVIDER}" — only "anthropic" and "openrouter" are implemented.`,
    );
  }
  return provider;
}
