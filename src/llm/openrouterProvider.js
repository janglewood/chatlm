import OpenAI from "openai";
import { env, requireEnv } from "../config/env.js";
import {
  SYSTEM_PROMPT,
  EXPANSION_SYSTEM_PROMPT,
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

/**
 * LLMProvider implementation routed through OpenRouter (openrouter.ai) —
 * lets LLM_MODEL point at any model in their catalog, including Claude
 * itself (e.g. "anthropic/claude-sonnet-5"), billed via an OpenRouter
 * account instead of a direct Anthropic one. Same prompt/behavior contract
 * as anthropicProvider.js — see promptTemplate.js.
 *
 * @param {{ question: string, contextChunks: Array<{ text: string, firstMessageAt: Date }> }} params
 * @returns {Promise<{ text: string, refused: boolean, offTopic: boolean, tokensUsed: number, sourceIndex: number|null, sourceMessageIndex: number|null }>}
 *   `text` is empty on refusal — the caller (answerQuestion.js) fills in a
 *   localized refusal message based on the question's language, since this
 *   provider has no opinion on that.
 */
export async function generateAnswer({ question, contextChunks }) {
  const response = await getClient().chat.completions.create({
    model: env.LLM_MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserTurn(question, contextChunks, new Date()) },
    ],
  });

  const choice = response.choices?.[0];
  const rawText = choice?.message?.content?.trim() ?? "";
  const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

  if (rawText === NOT_RELATED_MARKER) {
    return { text: "", refused: true, offTopic: true, tokensUsed, sourceIndex: null, sourceMessageIndex: null };
  }

  if (choice?.finish_reason === "content_filter" || rawText === NO_ANSWER_MARKER || rawText === "") {
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
  const response = await getClient().chat.completions.create({
    model: env.LLM_MODEL,
    max_tokens: 60,
    messages: [
      { role: "system", content: EXPANSION_SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
  });

  const text = response.choices?.[0]?.message?.content?.trim() || question;
  const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);
  return { text, tokensUsed };
}
