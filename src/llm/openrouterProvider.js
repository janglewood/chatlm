import OpenAI from "openai";
import { env, requireEnv } from "../config/env.js";
import {
  SYSTEM_PROMPT,
  NO_ANSWER_MARKER,
  NOT_RELATED_MARKER,
  buildUserTurn,
  parseAnswer,
} from "./promptTemplate.js";

// OpenRouter speaks the OpenAI-compatible chat completions format, not
// Anthropic's Messages API — this is a genuinely different wire shape from
// anthropicProvider.js even when LLM_MODEL points at a Claude model
// (e.g. "anthropic/claude-sonnet-5"). Constructed lazily for the same
// reason as the other providers — see config/env.js.
let client = null;
function getClient() {
  if (!client) {
    requireEnv(["LLM_API_KEY"]);
    client = new OpenAI({
      apiKey: env.LLM_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      // Optional per OpenRouter's docs (used for their app-attribution
      // leaderboard) — harmless to include, not required for requests to work.
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/",
        "X-Title": "Telegram KB Bot",
      },
    });
  }
  return client;
}

const NO_INFO_TEXT = "Не нашёл информации по этому вопросу.";

/**
 * LLMProvider implementation routed through OpenRouter (openrouter.ai) —
 * lets LLM_MODEL point at any model in their catalog, including Claude
 * itself (e.g. "anthropic/claude-sonnet-5"), billed via an OpenRouter
 * account instead of a direct Anthropic one. Same prompt/behavior contract
 * as anthropicProvider.js — see promptTemplate.js.
 *
 * @param {{ question: string, contextChunks: Array<{ text: string, firstMessageAt: Date }> }} params
 * @returns {Promise<{ text: string, refused: boolean, offTopic: boolean, tokensUsed: number, sourceIndex: number|null }>}
 */
export async function generateAnswer({ question, contextChunks }) {
  const response = await getClient().chat.completions.create({
    model: env.LLM_MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserTurn(question, contextChunks) },
    ],
  });

  const choice = response.choices?.[0];
  const rawText = choice?.message?.content?.trim() ?? "";
  const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

  if (rawText === NOT_RELATED_MARKER) {
    return { text: NO_INFO_TEXT, refused: true, offTopic: true, tokensUsed, sourceIndex: null };
  }

  if (choice?.finish_reason === "content_filter" || rawText === NO_ANSWER_MARKER || rawText === "") {
    return { text: NO_INFO_TEXT, refused: true, offTopic: false, tokensUsed, sourceIndex: null };
  }

  const { text, sourceIndex } = parseAnswer(rawText);
  return { text, refused: false, offTopic: false, tokensUsed, sourceIndex };
}
