# MVP_SCOPE.md

## The single core feature

> Admin connects the bot to a Telegram group → bot indexes the chat's message history → any participant asks a question (DM to the bot, or @mention in the group) → bot searches the indexed history semantically and answers in natural language, **citing which message (author + date) the answer is based on** → if it's not confident, it says so honestly instead of guessing.

Everything else is explicitly out of scope for v1. If a task doesn't serve this loop, it doesn't belong in the MVP build.

## Explicit out-of-scope (restated from the product brief, §4, plus decisions made during spec review)

- Exporting the knowledge base to a separate document / Notion — v2.
- Chat summarization / digests — separate feature, not mixed into MVP.
- Interface localization — Russian-only UI strings at launch.
- Integration with external sources (Google Docs, Confluence, etc.) — only the chat's own message history is ever indexed.
- Team roles / per-user access control — MVP has exactly one admin who connects the bot; that's sufficient.
- Mobile app — the Telegram bot *is* the product surface, no separate app.
- **Consent/opt-in flow** — cut from MVP by explicit decision. The bot indexes every chat it's connected to with no welcome/opt-in step. See risk #2 for the accepted trade-off this creates.
- **Payment integration** — cut from MVP by explicit decision. `plan_tier`/`subscriptions` scaffolding exists in the data model, but no real gateway (Stripe, ЮKassa, etc.) is wired up; upgrades are handled manually outside the bot.

## Technically risky or underspecified items

### 1. Historical backfill — resolved via MTProto, twice-daily sync

The Telegram Bot API cannot retrieve messages sent before the bot joined a chat — there is no bot-accessible history or export endpoint. **Decision: use MTProto (GramJS)**, authenticated as a real Telegram user account, to pull full chat history and reconcile it on a **twice-daily schedule**. Real-time messages after the bot joins are still handled by the ordinary Bot API listener — MTProto is not needed for that path. See `ARCHITECTURE.md` §2a and `API_CONTRACTS.md` §2a for the resulting design (`runMtprotoSync`, idempotent on `(chat_id, telegram_message_id)`, doubles as both first-run backfill and ongoing reconciliation).

This resolves the *mechanism* but introduces new, real operational considerations worth being explicit about:

- **A real Telegram user account is required**, and that account must itself be a member of every group being indexed (a bot token cannot be used for MTProto history fetches) — this is an onboarding step beyond "admin adds the bot," worth accounting for in the pilot rollout process.
- **Telegram ToS risk.** Automating a personal account, even read-only, sits in a greyer area than the Bot API. Low-volume, read-only history sync for a small number of pilot chats is a reasonable risk to accept for an MVP; revisit if scaling beyond a handful of trusted pilot groups.
- **The MTProto session string is a high-value credential** — functionally equivalent to full access to that Telegram account. It must never be committed to the repo, must be stored the same way any production secret would be (secrets manager / encrypted env, not a plaintext `.env` in git), and should be rotated if ever exposed. See `ENV_SETUP.md`.
- **Up to ~12 hours of lag** between something happening and the sync catching it, for anything the real-time Bot API listener didn't already catch (e.g., messages sent while the bot itself was offline). Acceptable for MVP; not a general substitute for the real-time path.

### 2. Consent flow cut — indexing happens with no opt-in (accepted risk)

By explicit decision, MVP does **not** implement any consent/welcome/opt-in step (the brief's own §7 emphasis on requiring explicit agreement before indexing is being knowingly deferred, not satisfied). The moment the bot (and, per risk #1, the MTProto account) is present in a group, its full history and ongoing messages are indexed — no admin confirmation, no per-member notice, no `/optout`. This is a real legal/personal-data exposure the user has chosen to accept for the pilot/MVP stage described in the brief (§9: 5-10 calls with real SMB teams). **Recommendation:** do not scale this beyond a small set of chats where the operator has an out-of-band relationship with the group (i.e., the actual pilot calls) without revisiting this before any wider rollout or paid launch.

### 3. Embeddings and answer-generation are not the same "LLM API"

The brief describes one "LLM API (provider-agnostic)... for embeddings and answer generation" — no major LLM vendor, including Anthropic, exposes both under one endpoint (Claude's Messages API has no embeddings endpoint). The architecture treats these as two separate, independently swappable provider adapters (`EmbeddingProvider`, `LLMProvider`) — see `ARCHITECTURE.md` §4 and `API_CONTRACTS.md` §1. This changes nothing about scope, but it does mean **two** API keys/vendors to configure, not one.

### 4. Embedding provider — decision made: Voyage AI (`voyage-4-lite`)

Compared against OpenAI `text-embedding-3-small` and Cohere `embed-v4` on real, current pricing:

| Provider / model | Price / 1M tokens | Free tier |
|---|---|---|
| OpenAI `text-embedding-3-small` | $0.02 | none |
| OpenAI `text-embedding-3-large` | $0.13 | none |
| **Voyage `voyage-4-lite` (chosen)** | **$0.02** | **200M tokens free** |
| Voyage `voyage-4` | $0.06 | 200M tokens free |
| Cohere `embed-v4` | $0.12 | none |

At MVP scale (a handful of pilot chats, ~15k-message initial backfill each + a few hundred new messages/day, roughly 4M tokens/month in aggregate), **every option above costs under $1/month** — cost was not the deciding factor. Voyage's 200M free-token allowance likely makes embeddings **free** for the entire pilot phase regardless, and `voyage-4-lite`'s default output is 1024 dimensions (matches the `VECTOR(1024)` column in `DATA_MODEL.md`). Cohere `embed-v4` remains the fallback if Russian-language retrieval quality from Voyage disappoints in practice — worth a quick empirical spot-check with real chat messages early in the build, since none of these were benchmarked here specifically on Russian text.

Because token volume at this scale is small, a future provider switch (see risk #5) would cost cents in re-embedding fees — the real cost of switching is engineering time, not the API bill.

### 5. Vector dimension lock-in (lower severity than initially flagged)

The pgvector column width (1024, per the Voyage `voyage-4-lite` decision above) is fixed at deploy time. Switching embedding providers/models later means a full re-embed + migration, not a config change — but given the actual MVP token volumes (risk #4), that migration is cheap in dollar terms; it's an engineering-time cost, not a budget risk.

### 6. Telegram API rate limits (Bot API and MTProto)

Bot API: ~30 messages/second globally, ~20 messages/minute per group for outbound replies — not a concern at MVP scale. MTProto: Telegram enforces account-level rate limits on a user account doing bulk history reads; the twice-daily sync job should paginate with reasonable delays between requests and run chats sequentially (or with small concurrency) rather than in a tight parallel loop, to avoid tripping automated-behavior flags on the sync account.

### 7. Synchronous deletion assumption

"Delete all my data" is specified as a synchronous, in-request delete (`API_CONTRACTS.md` §4). Fine at the row counts implied by "5000+ messages" (brief §8); would need to move to a background job if a single chat's data volume grows far beyond that. Also note: the sync job in risk #1 must skip any chat with `deleted_at IS NOT NULL`, or a "forgotten" chat's history will simply be re-indexed on the next twice-daily run.

### 8. Payment integration cut from MVP (accepted, confirmed)

Brief §6 specifies Stripe + a local RF payment provider (ЮKassa/CloudPayments); brief §8 itself says a full Stripe integration isn't required for v1 ("even manual invoice/crypto is OK"). By explicit decision, MVP builds the `subscriptions` table and `plan_tier` gating (`TASK_BREAKDOWN.md`) but wires no real payment gateway — upgrades are a manual, out-of-band process (e.g. an admin flips `plan_tier` after an invoice/crypto payment is confirmed outside the bot).

## Criteria for success (restated from the brief, §8 — unchanged, included here so nothing drifts during build)

- Bot stably indexes a chat with 5000+ messages without failures.
- An answer to a question arrives within a reasonable time (<10 seconds).
- Answers include a correct citation to the source (no hallucinated attribution).
- Basic payment exists in some form (manual invoice/crypto is acceptable — full Stripe integration not required for v1).
