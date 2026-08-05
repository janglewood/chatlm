import { getChatById } from "../db/chats.js";
import { incrementQuestionCount } from "../db/usage.js";
import { env } from "../config/env.js";

export class RateLimitExceededError extends Error {}

/**
 * Atomically checks and increments today's question counter for a chat,
 * before any embedding/LLM call is made (API_CONTRACTS.md §5 — this is the
 * first of the two cost guardrails; the confidence-threshold short-circuit
 * in the query pipeline is the second).
 *
 * @throws {RateLimitExceededError} if the chat's plan-tier daily cap is exceeded
 */
export async function checkAndIncrement(chatId) {
  const chat = await getChatById(chatId);
  const limit = chat?.plan_tier === "free" ? env.FREE_TIER_DAILY_QUESTION_LIMIT : Infinity;

  const count = await incrementQuestionCount(chatId);
  if (count > limit) {
    throw new RateLimitExceededError(`Chat ${chatId} exceeded its daily question limit (${limit})`);
  }
}
