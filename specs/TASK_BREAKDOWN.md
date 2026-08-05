# TASK_BREAKDOWN.md — ordered implementation milestones

Each task is scoped to be buildable and independently testable before moving to the next. Do not start a task until the previous one's acceptance criteria pass.

---

### 1. Bot skeleton + connectivity
- Node.js project scaffold, `package.json`, env loading/validation.
- Telegraf client wired up in **polling mode** for local dev.
- `/start` command replies with a static message.
- Postgres connection pool established; `SELECT 1` health check on boot.
- **Acceptance:** running `npm start` locally connects to a real test bot (via BotFather token) and `/start` gets a reply in a private chat.

### 2. Database schema + migrations
- Migration tool set up (see `ENV_SETUP.md`), all tables from `DATA_MODEL.md` created, `vector` extension enabled.
- **Acceptance:** `npm run migrate` runs clean against a fresh Postgres+pgvector container; all tables and the HNSW index exist.

### 3. Message ingestion + storage (Bot API, real-time)
- `my_chat_member` handler creates a `chats` row when the bot is added to a group (no consent step — see `MVP_SCOPE.md` risk #2).
- `handleIncomingMessage` persists every message going forward; author upsert into `users`.
- **Acceptance:** adding the bot to a real test group and sending 20 messages results in 20 rows in `messages`, immediately, with no confirmation step required.

### 4. MTProto backfill + twice-daily sync
- One-time interactive session-generation script (phone number + login code, per `ENV_SETUP.md`) produces `MTPROTO_SESSION_STRING`.
- `runMtprotoSync(chatId)` implemented per `API_CONTRACTS.md` §2a: resumes from `MAX(telegram_message_id)`, upserts idempotently, updates `last_backfill_at`.
- `runMtprotoSyncForAllChats` scheduled via `node-cron` at `MTPROTO_SYNC_CRON` (twice daily), skips chats with `deleted_at IS NOT NULL`.
- **Acceptance:** running the sync job once against a test group where the MTProto account is a member fully backfills its pre-existing history into `messages`; running it a second time with no new Telegram activity inserts zero additional rows (idempotent); a chat's `last_backfill_at` updates on each run.

### 5. Chunking pipeline
- `chunkAndEmbed` groups unindexed messages into token-bounded chunks (no embedding call yet — stub the embedding step or run it against a real provider if #6 is done in parallel).
- **Acceptance:** given a batch of test messages, chunk boundaries respect the token budget and never split a single message.

### 6. Embedding provider adapter + embedding pipeline
- Implement `EmbeddingProvider` interface with one concrete provider (pick per `ENV_SETUP.md`).
- Wire `chunkAndEmbed` to call it and persist to `embeddings`.
- **Acceptance:** after ingesting messages, `embeddings` rows exist with the correct vector width; re-running `chunkAndEmbed` on the same chat is idempotent (no duplicate chunks).

### 7. Vector search
- Top-k cosine similarity query scoped by `chat_id`.
- **Acceptance:** a manual test query returns the expected top-3 chunks for a hand-crafted seed conversation, ranked correctly.

### 8. LLM provider adapter + answer generation with citation
- Implement `LLMProvider` interface with one concrete provider.
- Prompt template enforcing "cite from context, never fabricate, say 'I don't know' when unsure."
- Confidence-threshold short-circuit (no LLM call below threshold).
- **Acceptance:** a question with a clear answer in the seed data returns a correct, cited answer; a question with no relevant history returns the "couldn't find information" response without an LLM call (verify via logging/mocked provider call count).

### 9. Question intake (DM + @mention)
- Route DM messages and @mention-in-group messages to the query pipeline; format the Telegram reply per `API_CONTRACTS.md` §3.
- **Acceptance:** asking a question via DM and via @mention in the group both produce a correctly formatted reply within the target latency.

### 10. Rate limiting + cost guardrails
- `usage_counters` table wired into `checkAndIncrement`; free-tier daily cap enforced before any embedding/LLM call.
- **Acceptance:** exceeding the configured daily limit on a free-tier test chat returns the limit message and does not increment further or call any provider.

### 11. Data deletion command
- `/forget_chat` with confirmation step; hard-deletes messages/chunks/embeddings; logs to `deletion_requests`.
- **Acceptance:** running the command and confirming leaves zero rows in `messages`/`chunks`/`embeddings` for that `chat_id`, and a completed `deletion_requests` row.

### 12. Basic subscription/payment stub
- `subscriptions` table wired to `plan_tier` on `chats`; a manual "upgrade" path (admin contact / manual invoice, per `MVP_SCOPE.md` risk #8) that flips a chat to `pro`/`business`.
- **Acceptance:** manually marking a chat as `pro` removes the daily question cap for that chat.

### 13. End-to-end validation against the brief's success criteria
- Seed a test chat with 5000+ synthetic messages, run the full ingest → ask → answer loop.
- Measure answer latency (<10s target), verify citation correctness on a sample of questions, confirm no ingestion failures across the full volume.
- **Acceptance:** all four criteria in `MVP_SCOPE.md` / brief §8 are demonstrably met on this seeded chat.
