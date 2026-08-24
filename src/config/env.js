import "dotenv/config";
import { z } from "zod";

const boolFromString = z
  .string()
  .transform((v) => v.toLowerCase() === "true")
  .pipe(z.boolean());

const intFromString = z.coerce.number().int();
const floatFromString = z.coerce.number();

// Feature-specific keys (bot token, provider keys, MTProto creds) are kept
// optional here on purpose: several entry points (the session-generation
// script, the plan-tier script, tests) only need a subset of them, and
// forcing every script to supply every key just to pass env validation is
// bad UX. Each feature module fails clearly at the point of use instead —
// see requireEnv() below.
const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    LOG_LEVEL: z.string().default("info"),

    // Telegram Bot API
    TELEGRAM_BOT_TOKEN: z.string().default(""),
    USE_POLLING: boolFromString.default("true"),
    TELEGRAM_WEBHOOK_URL: z.string().url().optional().or(z.literal("")),
    PORT: intFromString.default(3000),

    // Postgres
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    // Embeddings
    EMBEDDING_PROVIDER: z.enum(["voyage", "openai", "cohere"]).default("voyage"),
    EMBEDDING_API_KEY: z.string().default(""),
    EMBEDDING_MODEL: z.string().min(1).default("voyage-4-lite"),
    EMBEDDING_DIMENSIONS: intFromString.default(1024),

    // LLM — "anthropic" calls Claude directly; "openrouter" routes the same
    // (or any other) model through openrouter.ai instead, see llm/openrouterProvider.js
    LLM_PROVIDER: z.enum(["anthropic", "openrouter"]).default("anthropic"),
    LLM_API_KEY: z.string().default(""),
    LLM_MODEL: z.string().min(1).default("claude-opus-4-8"),

    // Query pipeline tuning
    // Calibrated against live retrieval scores, not guessed — a real,
    // correct match came back at 0.28 top-score for a short/casual chat
    // corpus with Voyage embeddings, well under the previous 0.35 default,
    // which was gating out genuinely-answerable questions before the LLM
    // ever saw them. Lowered again after a second live case: the same
    // correct chunk scored only 0.18 for a terse, keyword-style phrasing of
    // the same question ("freeze scope info" vs "anything about 'freeze
    // scope'") — short/fragmentary queries embed measurably weaker than
    // full questions, a structural property of embedding similarity, not a
    // bug specific to this corpus. No calibration data yet on how low this
    // can go before admitting false positives; revisit as more real
    // questions are logged.
    CONFIDENCE_THRESHOLD: floatFromString.default(0.18),
    // Tried lowering this alongside the threshold (200 -> 120) to reduce
    // topic-dilution in chunks covering several sub-topics in one fast
    // exchange, but measured it live and it backfired: shrinking a chunk
    // didn't isolate the target sentence, it just left it diluted by
    // *different* neighboring content, and shorter chunks scored lower
    // against Voyage overall — the target dropped from rank #4 to #9,
    // outside TOP_K entirely. Reverted; CONFIDENCE_THRESHOLD is the lever
    // that's actually validated by data for this failure mode.
    CHUNK_MAX_TOKENS: intFromString.default(200),
    CHUNK_MAX_GAP_MINUTES: intFromString.default(20),
    // pgvector's HNSW index (idx_embeddings_vector_cosine) is approximate —
    // recall trades off against ef_search, and pgvector's own default (40)
    // is tuned for generic workloads, not calibrated against this corpus.
    // Verified live: the single best-matching chunk for a real question
    // (cosine score 0.55, well clear of every other candidate) was silently
    // missing from the ANN top-8 at ef_search=40, even though nothing else
    // scored close to it — raising this to 100 reliably surfaced it at rank
    // #1. Higher ef_search costs more per query (wider graph search); 100
    // is a conservative first bump validated against one failure case, not
    // an exhaustive sweep — revisit if latency becomes an issue at scale.
    HNSW_EF_SEARCH: intFromString.default(100),
    FREE_TIER_DAILY_QUESTION_LIMIT: intFromString.default(20),
    // "Also found" / "possibly related" section — shown alongside a normal
    // answer, and in place of a bare refusal when there's at least
    // something loosely relevant. Deliberately a much lower bar than
    // CONFIDENCE_THRESHOLD (which gates whether the LLM even gets called).
    RELATED_MESSAGES_LIMIT: intFromString.default(4),
    RELATED_MESSAGES_MIN_SCORE: floatFromString.default(0.15),

    // MTProto
    TELEGRAM_API_ID: z.string().default("").transform((v) => (v === "" ? undefined : Number(v))),
    TELEGRAM_API_HASH: z.string().default(""),
    MTPROTO_SESSION_STRING: z.string().default(""),
    MTPROTO_SYNC_CRON: z.string().default("0 0,12 * * *"),
  })
  .superRefine((env, ctx) => {
    if (!env.USE_POLLING && !env.TELEGRAM_WEBHOOK_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TELEGRAM_WEBHOOK_URL"],
        message: "TELEGRAM_WEBHOOK_URL is required when USE_POLLING=false",
      });
    }
  });

/**
 * Fails loudly and specifically when a feature is actually used without its
 * required env vars — e.g. called from src/bot/index.js, the Voyage/Anthropic
 * provider modules, and the MTProto client, rather than blocking unrelated
 * scripts at parse time.
 */
export function requireEnv(keys) {
  const missing = keys.filter((key) => env[key] === "" || env[key] == null);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
