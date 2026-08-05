import Anthropic from "@anthropic-ai/sdk";
import { env, requireEnv } from "../config/env.js";
import {
  SYSTEM_PROMPT,
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

const NO_INFO_TEXT = "Не нашёл информации по этому вопросу.";

/**
 * LLMProvider implementation for Anthropic Claude, called directly against
 * the Anthropic API (API_CONTRACTS.md §1/§3). Never used for embeddings —
 * see ARCHITECTURE.md §4. See openrouterProvider.js for the same model
 * family routed through OpenRouter instead.
 *
 * @param {{ question: string, contextChunks: Array<{ text: string, firstMessageAt: Date }> }} params
 * @returns {Promise<{ text: string, refused: boolean, offTopic: boolean, tokensUsed: number, sourceIndex: number|null }>}
 */
export async function generateAnswer({ question, contextChunks }) {
  const response = await getClient().messages.create({
    model: env.LLM_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserTurn(question, contextChunks) }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const rawText = textBlock?.text?.trim() ?? "";
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  if (rawText === NOT_RELATED_MARKER) {
    return { text: NO_INFO_TEXT, refused: true, offTopic: true, tokensUsed, sourceIndex: null };
  }

  if (response.stop_reason === "refusal" || rawText === NO_ANSWER_MARKER || rawText === "") {
    return { text: NO_INFO_TEXT, refused: true, offTopic: false, tokensUsed, sourceIndex: null };
  }

  const { text, sourceIndex } = parseAnswer(rawText);
  return { text, refused: false, offTopic: false, tokensUsed, sourceIndex };
}
