import Anthropic from "@anthropic-ai/sdk";
import { env, requireEnv } from "../config/env.js";
import {
  SYSTEM_PROMPT,
  EXPANSION_SYSTEM_PROMPT,
  NO_ANSWER_MARKER,
  NOT_RELATED_MARKER,
  buildUserTurn,
  parseAnswer,
} from "./promptTemplate.js";

// Constructed lazily (not at module load) so merely importing this file —
// e.g. via the bot's import chain — doesn't fail before LLM_API_KEY is
// actually needed. See config/env.js's note on why these keys are optional.
let client = null;
function getClient() {
  if (!client) {
    requireEnv(["LLM_API_KEY"]);
    client = new Anthropic({ apiKey: env.LLM_API_KEY });
  }
  return client;
}

/**
 * LLMProvider implementation for Anthropic Claude, called directly against
 * the Anthropic API (API_CONTRACTS.md §1/§3). Never used for embeddings —
 * see ARCHITECTURE.md §4. See openrouterProvider.js for the same model
 * family routed through OpenRouter instead.
 *
 * @param {{ question: string, contextChunks: Array<{ text: string, firstMessageAt: Date }> }} params
 * @returns {Promise<{ text: string, refused: boolean, offTopic: boolean, tokensUsed: number, sourceIndex: number|null, sourceMessageIndex: number|null }>}
 *   `text` is empty on refusal — the caller (answerQuestion.js) fills in a
 *   localized refusal message based on the question's language, since this
 *   provider has no opinion on that.
 */
export async function generateAnswer({ question, contextChunks }) {
  const response = await getClient().messages.create({
    model: env.LLM_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserTurn(question, contextChunks, new Date()) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock?.text?.trim() ?? "";
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  if (rawText === NOT_RELATED_MARKER) {
    return { text: "", refused: true, offTopic: true, tokensUsed, sourceIndex: null, sourceMessageIndex: null };
  }

  if (response.stop_reason === "refusal" || rawText === NO_ANSWER_MARKER || rawText === "") {
    return { text: "", refused: true, offTopic: false, tokensUsed, sourceIndex: null, sourceMessageIndex: null };
  }

  const { text, sourceIndex, sourceMessageIndex } = parseAnswer(rawText);
  return { text, refused: false, offTopic: false, tokensUsed, sourceIndex, sourceMessageIndex };
}

/**
 * Rewrites a terse/fragmentary question into a fuller natural-language form
 * before it's embedded for retrieval — see EXPANSION_SYSTEM_PROMPT for why.
 * A small, separate call from generateAnswer; failures here should never
 * block answering, so the caller (answerQuestion.js) falls back to the
 * original question on error.
 *
 * @param {string} question
 * @returns {Promise<{ text: string, tokensUsed: number }>}
 */
export async function expandQuery(question) {
  const response = await getClient().messages.create({
    model: env.LLM_MODEL,
    max_tokens: 60,
    system: EXPANSION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: question }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const text = textBlock?.text?.trim() || question;
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  return { text, tokensUsed };
}
