# API_CONTRACTS.md — internal module contracts

All signatures are illustrative TypeScript-flavored JSDoc/interfaces — implementation language is plain JS/Node per the stack constraint; types are for clarity of contract, not a mandate to use TypeScript.

---

## 1. Provider adapters (embeddings and LLM are separate interfaces)

```js
/**
 * @typedef {Object} EmbeddingResult
 * @property {number[]} vector
 * @property {string} model
 * @property {number} dims
 */

/**
 * EmbeddingProvider — turns text into vectors. NOT the same provider/vendor
 * as LLMProvider by default (Anthropic Claude has no embeddings endpoint).
 * Selected via env var EMBEDDING_PROVIDER.
 */
class EmbeddingProvider {
  /** @param {string[]} texts @returns {Promise<EmbeddingResult[]>} */
  async embed(texts) {}
}

/**
 * @typedef {Object} ContextChunk
 * @property {number} chunkId
 * @property {string} text
 * @property {string} authorDisplayName
 * @property {Date} firstMessageAt
 * @property {number} similarityScore   // 0..1, higher = more similar
 */

/**
 * @typedef {Object} LLMAnswer
 * @property {string} text
 * @property {boolean} refused          // true if the model/policy declined
 */

/**
 * LLMProvider — generates the final answer from retrieved context.
 * Selected via env var LLM_PROVIDER.
 */
class LLMProvider {
  /**
   * @param {{ question: string, contextChunks: ContextChunk[], systemPrompt: string }} params
   * @returns {Promise<LLMAnswer>}
   */
  async generateAnswer(params) {}
}
```

Concrete implementations (one per provider) live behind these interfaces so provider keys can be plugged in later without touching the pipeline:

- `EmbeddingProvider`: `VoyageEmbeddingProvider`, `OpenAIEmbeddingProvider`, `CohereEmbeddingProvider`
- `LLMProvider`: `AnthropicLLMProvider`, `OpenAILLMProvider`

A factory (`createEmbeddingProvider(env)`, `createLLMProvider(env)`) reads `EMBEDDING_PROVIDER` / `LLM_PROVIDER` and returns the configured implementation — the rest of the codebase only ever depends on the interface.

---

## 2. Ingestion pipeline (Bot API, real-time) — message arrives → chunk → embed → store

No consent gate — MVP indexes every chat the bot is connected to (see `MVP_SCOPE.md` risk #2 for the accepted trade-off).

```js
/**
 * @typedef {Object} InboundMessage
 * @property {string} telegramChatId
 * @property {number} telegramMessageId
 * @property {string} telegramUserId
 * @property {string} authorDisplayName
 * @property {string} text
 * @property {Date} sentAt
 */

/**
 * Entry point for every Telegram `message` update in a group chat.
 * @param {InboundMessage} msg
 * @returns {Promise<void>}
 */
async function handleIncomingMessage(msg) {
  // 1. resolve or create `chats` row by telegramChatId
  // 2. upsert `users` row for the author
  // 3. INSERT into `messages` (ON CONFLICT (chat_id, telegram_message_id) DO NOTHING —
  //    the MTProto sync job in §2a may race with this on the same message)
  // 4. enqueue { chatId, messageId } for chunking (in-process queue is fine at MVP scale)
}

/**
 * Groups newly-ingested, not-yet-chunked messages for a chat into
 * token-bounded chunks, embeds each chunk, and stores chunk + embedding rows.
 * Idempotent: messages already covered by a chunk (indexed_at IS NOT NULL)
 * are skipped. Shared by both ingestion sources (§2 and §2a).
 * @param {number} chatId
 * @returns {Promise<{ chunksCreated: number }>}
 */
async function chunkAndEmbed(chatId) {
  // 1. SELECT messages WHERE chat_id = ? AND indexed_at IS NULL ORDER BY sent_at
  // 2. greedily group into chunks up to CHUNK_MAX_TOKENS (env var, default ~400)
  //    - never split a single message across two chunks
  //    - a message longer than CHUNK_MAX_TOKENS becomes its own chunk
  // 3. embeddingProvider.embed(chunkTexts)
  // 4. INSERT chunks + embeddings in a transaction
  // 5. UPDATE messages SET indexed_at = now() for all covered message ids
}
```

---

## 2a. MTProto backfill + twice-daily sync (GramJS)

The Bot API cannot retrieve messages sent before the bot joined a chat. This job — authenticated as a real Telegram **user** account via MTProto, not the bot token — fills that gap. The same function serves both the one-time full backfill and every subsequent reconciliation run; there is no separate "backfill" code path.

```js
/**
 * Pulls new-to-us messages for one chat via MTProto and upserts them.
 * On the very first run for a chat (no prior messages stored), this
 * fetches the entire available history — i.e. this IS the backfill.
 * On every later run it only fetches messages newer than the last known one.
 * @param {number} chatId
 * @returns {Promise<{ fetched: number, upserted: number }>}
 */
async function runMtprotoSync(chatId) {
  // 1. const chat = SELECT * FROM chats WHERE id = ?
  // 2. const resumePoint = SELECT MAX(telegram_message_id) FROM messages WHERE chat_id = ?
  //    -- NULL on first-ever run => fetch full history
  // 3. const gramClient = getMtprotoClient()  // long-lived, authenticated via persisted session string
  // 4. for await (const msg of gramClient.iterMessages(chat.telegramChatId, { minId: resumePoint ?? 0 })) {
  //      upsert into `messages` mapping Telegram's message shape -> InboundMessage,
  //      ON CONFLICT (chat_id, telegram_message_id) DO NOTHING
  //    }
  // 5. UPDATE chats SET last_backfill_at = now() WHERE id = ?
  // 6. enqueue chunkAndEmbed(chatId) for the newly-inserted messages
  // 7. return { fetched, upserted }
}

/**
 * Scheduler entry point — iterates every chat the bot is connected to and
 * runs the sync for each. Registered via node-cron at MTPROTO_SYNC_CRON
 * (default: twice a day, e.g. "0 0,12 * * *").
 */
async function runMtprotoSyncForAllChats() {
  // for each chat in `chats` WHERE deleted_at IS NULL: await runMtprotoSync(chat.id)
  // -- run sequentially (or with small concurrency) to stay well under Telegram's
  //    account-level rate limits; log failures per-chat without aborting the whole run
}
```

**Operational note:** the MTProto client must be logged in as a real Telegram user account that is *itself a member* of every target group (a bot token cannot be used for MTProto history fetches). See `ENV_SETUP.md` for the one-time interactive session-generation step and `MVP_SCOPE.md` risk #1 for the account/session security and Telegram ToS considerations this introduces.

---

## 3. Query pipeline — question → embed → retrieve top-k → prompt → LLM → cited answer

```js
/**
 * @typedef {Object} Citation
 * @property {string} authorDisplayName
 * @property {Date} messageDate
 * @property {number} telegramMessageId  // for building a t.me deep link if available
 */

/**
 * @typedef {Object} AnswerResult
 * @property {string} text
 * @property {Citation[]} citations
 * @property {boolean} refused           // true = "I couldn't find information on that"
 */

/**
 * @param {{ chatId: number, telegramUserId: string, questionText: string }} params
 * @returns {Promise<AnswerResult>}
 */
async function handleQuestion({ chatId, telegramUserId, questionText }) {
  // 1. rateLimiter.checkAndIncrement(chatId, telegramUserId)
  //    -> throws RateLimitExceededError if the chat's daily free-tier cap is hit
  // 2. const [{ vector }] = await embeddingProvider.embed([questionText])
  // 3. const candidates = await vectorSearch.topK(chatId, vector, K)   // K default 8
  // 4. if candidates.length === 0 || candidates[0].similarityScore < CONFIDENCE_THRESHOLD:
  //      return { text: "Не нашёл информации по этому вопросу.", citations: [], refused: true }
  //      -- NO LLM call is made in this branch (cost guard + honesty requirement)
  // 5. const answer = await llmProvider.generateAnswer({
  //      question: questionText,
  //      contextChunks: candidates,
  //      systemPrompt: ANSWER_SYSTEM_PROMPT,   // instructs: cite sources, never fabricate,
  //                                            // say "I don't know" if context is insufficient
  //    })
  // 6. if answer.refused: return { text: answer.text, citations: [], refused: true }
  // 7. map candidates -> citations (author + date of each chunk's first source message)
  // 8. record usage_counters.llm_tokens_used += <tokens from provider response>
  // 9. return { text: answer.text, citations, refused: false }
}
```

**Prompt construction contract** (`ANSWER_SYSTEM_PROMPT` + user turn):

- System prompt instructs the model to: (a) answer only from the provided context chunks, (b) never fabricate facts not present in context, (c) explicitly say it doesn't know when context is insufficient rather than guessing, (d) keep answers concise.
- User turn includes each retrieved chunk labeled with its author and date so the model can naturally produce "по словам {author}, {date}: ..." style attribution, plus the question.
- The bot layer is the source of truth for the *structured* citation (author/date/message link) sent back to Telegram — it does not trust the LLM to get formatting/links right, only to ground its answer in the right chunk.

**Reply formatting contract** (Bot Layer):

```
{answer.text}

— по сообщению от {citation.authorDisplayName}, {citation.messageDate formatted as DD.MM.YYYY}
```

If `refused === true`, send the plain "couldn't find information" text with no citation line.

---

## 4. Data deletion — "delete all my indexed data"

There is no consent/opt-in flow to gate this on (cut per `MVP_SCOPE.md` risk #2) — the delete-on-request capability is kept regardless, since it's a distinct data-rights requirement from the brief, not part of the consent UX.

```js
/**
 * `/forget_chat` command (or equivalent). Admin-only, requires confirmation.
 * @param {{ chatId: number, telegramUserId: string }} cmd
 */
async function onForgetChatCommand(cmd) {
  // 1. verify cmd.telegramUserId is chats.owner_telegram_user_id OR a current Telegram chat admin
  // 2. sendMessage with confirm/cancel inline keyboard (destructive action — never single-step)
}

async function onForgetChatConfirm(cb) {
  // 1. INSERT deletion_requests (status = 'pending')
  // 2. in a transaction:
  //      DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE chat_id = ?)
  //      DELETE FROM chunks WHERE chat_id = ?
  //      DELETE FROM messages WHERE chat_id = ?
  //      UPDATE chats SET deleted_at = now() WHERE id = ?
  // 3. UPDATE deletion_requests SET status = 'completed', completed_at = now()
  // 4. sendMessage(chatId, "Все проиндексированные данные удалены.")
  // -- MVP scale (single chat, tens of thousands of rows) completes synchronously within request time;
  //    move to a background job only if this stops being true in practice.
  //    NOTE: this does not stop the twice-daily MTProto sync from re-fetching and
  //    re-indexing the chat's history on its next run — if the chat should stay
  //    permanently forgotten, the sync job must also skip any chat with deleted_at IS NOT NULL.
}
```

---

## 5. Rate limiting / cost guardrail

```js
class RateLimitExceededError extends Error {}

/**
 * Atomically checks and increments today's question counter for a chat.
 * @param {number} chatId
 * @param {string} telegramUserId
 * @throws {RateLimitExceededError} if the chat's plan-tier daily cap is exceeded
 */
async function checkAndIncrement(chatId, telegramUserId) {
  // UPSERT usage_counters (chat_id, day = today) ON CONFLICT DO UPDATE SET question_count = question_count + 1
  //   RETURNING question_count
  // const limit = chat.plan_tier === 'free' ? FREE_TIER_DAILY_QUESTION_LIMIT : Infinity
  // if (question_count > limit) throw new RateLimitExceededError()
}
```

This check runs **before** any embedding or LLM call is made, so a chat that's already over its cap costs nothing further that day — the confidence-threshold short-circuit in §3 step 4 is the second, per-question cost guard.
