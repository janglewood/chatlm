# DATA_MODEL.md — Postgres schema (with pgvector)

Requires the `vector` extension (pgvector ≥ 0.7.0 recommended for HNSW support):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Vector width (`EMBEDDING_DIMENSIONS`) is fixed at deploy time and baked into the `embeddings.vector` column. **Changing embedding provider/model later requires a migration + full re-embedding of all chunks** — this is a real constraint, not a config flip, though cheap in dollar terms at MVP scale (see `MVP_SCOPE.md` risk #5).

---

## Tables

### `chats`

One row per Telegram group the bot has been added to.

No consent-tracking columns — the opt-in/consent flow is cut from MVP per `MVP_SCOPE.md` risk #2. `owner_telegram_user_id` is retained purely to authorize the `/forget_chat` deletion command.

```sql
CREATE TABLE chats (
  id                   BIGSERIAL PRIMARY KEY,
  telegram_chat_id     BIGINT NOT NULL UNIQUE,
  title                TEXT,
  owner_telegram_user_id BIGINT,          -- admin who added the bot; authorizes /forget_chat
  plan_tier            TEXT NOT NULL DEFAULT 'free'
                         CHECK (plan_tier IN ('free', 'pro', 'business')),
  last_backfill_at     TIMESTAMPTZ,        -- updated by the MTProto sync job each run; NULL = never synced
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ          -- set on /forget_chat, row kept for audit
);
```

### `users`

Telegram users seen as message authors, for citation display.

```sql
CREATE TABLE users (
  id                BIGSERIAL PRIMARY KEY,
  telegram_user_id  BIGINT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,        -- first_name (+ last_name) or username at time of last seen
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### `messages`

Raw message history, populated by both ingestion sources (real-time Bot API updates and the twice-daily MTProto sync — see `ARCHITECTURE.md` §2/§2a). The `UNIQUE (chat_id, telegram_message_id)` constraint is what makes upserts from either source idempotent and safe to run concurrently.

```sql
CREATE TABLE messages (
  id                    BIGSERIAL PRIMARY KEY,
  chat_id               BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  telegram_message_id   BIGINT NOT NULL,
  author_telegram_user_id BIGINT,
  author_display_name   TEXT NOT NULL,     -- denormalized snapshot for cheap citation rendering
  text                  TEXT NOT NULL,
  sent_at               TIMESTAMPTZ NOT NULL,
  indexed_at            TIMESTAMPTZ,       -- set once this message has been folded into a chunk
  deleted_at            TIMESTAMPTZ,       -- soft-delete: message edited away / user deleted it in Telegram
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_message_id)
);

CREATE INDEX idx_messages_chat_sent_at ON messages (chat_id, sent_at);
CREATE INDEX idx_messages_unindexed ON messages (chat_id) WHERE indexed_at IS NULL;
```

### `chunks`

A chunk is one or more consecutive messages concatenated up to a token budget. `source_message_ids` keeps the mapping back to raw messages for citation (author + date of the *first* message in the chunk is used as the primary citation, per the brief's UX: "per message from X, date Y").

```sql
CREATE TABLE chunks (
  id                  BIGSERIAL PRIMARY KEY,
  chat_id             BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  source_message_ids  BIGINT[] NOT NULL,   -- ordered, references messages.id
  text                TEXT NOT NULL,       -- concatenated chunk text sent to the embedding model
  token_count         INT NOT NULL,
  first_message_at    TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_chat_id ON chunks (chat_id);
```

### `embeddings`

Separate from `chunks` so the vector width/model can be swapped without touching chunk text, and so re-embedding is an additive operation (old embeddings can be kept until the new ones are verified).

```sql
CREATE TABLE embeddings (
  chunk_id      BIGINT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  vector        VECTOR(1024) NOT NULL,     -- 1024 = Voyage voyage-4-lite default output_dimension (MVP choice)
  model         TEXT NOT NULL,             -- e.g. 'voyage-4-lite'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for cosine similarity search, scoped per-chat via the WHERE clause in queries
-- (pgvector has no native partitioned-by-column index, so chat_id filtering happens at query time —
--  acceptable at MVP scale of ~5-50k chunks/chat; revisit partitioning per-chat if a single
--  installation ever holds many large chats).
CREATE INDEX idx_embeddings_vector_cosine ON embeddings
  USING hnsw (vector vector_cosine_ops);
```

> Query pattern for top-k: `SELECT c.*, e.vector <=> $questionVector AS distance FROM embeddings e JOIN chunks c ON c.id = e.chunk_id WHERE c.chat_id = $chatId ORDER BY distance LIMIT $k;` — the `<=>` cosine-distance operator requires normalized vectors for the distance to equal `1 - cosine_similarity`; most embedding providers already return normalized vectors, but confirm per provider.

### `usage_counters`

Per-chat, per-day question counter — backs the rate limit / cost guardrail.

```sql
CREATE TABLE usage_counters (
  chat_id           BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  day               DATE NOT NULL,
  question_count    INT NOT NULL DEFAULT 0,
  llm_tokens_used   BIGINT NOT NULL DEFAULT 0,
  embedding_tokens_used BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, day)
);
```

### `subscriptions`

```sql
CREATE TABLE subscriptions (
  id                    BIGSERIAL PRIMARY KEY,
  chat_id               BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  plan_tier             TEXT NOT NULL CHECK (plan_tier IN ('free', 'pro', 'business')),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'past_due', 'canceled', 'manual')),
  provider              TEXT CHECK (provider IN ('stripe', 'yookassa', 'cloudpayments', 'manual')),
  external_customer_id      TEXT,
  external_subscription_id  TEXT,
  current_period_end    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_chat_active ON subscriptions (chat_id)
  WHERE status IN ('active', 'past_due');
```

### `deletion_requests`

Audit trail for the "right to delete" requirement (brief §7).

```sql
CREATE TABLE deletion_requests (
  id             BIGSERIAL PRIMARY KEY,
  chat_id        BIGINT NOT NULL,          -- not FK'd — chat row itself gets deleted/soft-deleted
  requested_by_telegram_user_id BIGINT NOT NULL,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'completed', 'failed'))
);
```

---

## Chat-to-owner mapping

`chats.owner_telegram_user_id` is the single source of truth for "who is allowed to trigger deletion" in MVP (one admin connects the bot — brief §4 explicitly scopes out team roles/permissions; consent/opt-in itself is cut per `MVP_SCOPE.md` risk #2).

## Notes on indexes for pgvector similarity search

- **HNSW** (`vector_cosine_ops`) is preferred over IVFFlat for MVP: no need to pick/tune a `lists` parameter ahead of data volume, and recall stays good without periodic `REINDEX`.
- All similarity queries **must** filter by `chat_id` first (`WHERE c.chat_id = $1`) — there is no cross-tenant search in this product; a missing chat_id filter is both a correctness bug and a data-leak risk between groups.
- Re-embedding after a model/provider change: write new rows to `embeddings` under the new `model` value using a temporary column or a blue/green table swap — do not attempt to resize the existing `vector` column type in place under load. In practice, at MVP token volumes this migration costs cents in API fees (see `MVP_SCOPE.md` §Embedding provider decision) — the real cost is engineering time to re-run the pipeline, not the provider bill.
