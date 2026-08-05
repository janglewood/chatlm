# ENV_SETUP.md

## Node version

Node.js **20 LTS** or later. Pin in `package.json`:

```json
{
  "engines": { "node": ">=20.0.0" }
}
```

## Environment variables

| Variable | Required | Example | Notes |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | `123456:ABC-DEF...` | From @BotFather |
| `USE_POLLING` | yes (local) | `true` | `true` for local dev (no public URL needed); `false` in prod |
| `TELEGRAM_WEBHOOK_URL` | only if `USE_POLLING=false` | `https://api.example.com/telegram/webhook` | Public HTTPS URL Telegram will POST updates to |
| `PORT` | prod only | `3000` | HTTP server port for webhook mode / health checks |
| `DATABASE_URL` | yes | `postgres://user:pass@localhost:5432/tgkb` | Postgres connection string |
| `EMBEDDING_PROVIDER` | yes | `voyage` | MVP default per `MVP_SCOPE.md` risk #4 — `openai` / `cohere` remain available as swap-in alternatives behind the same `EmbeddingProvider` interface |
| `EMBEDDING_API_KEY` | yes | — | Voyage AI API key |
| `EMBEDDING_MODEL` | yes | `voyage-4-lite` | Must match the provider |
| `EMBEDDING_DIMENSIONS` | yes | `1024` | `voyage-4-lite`'s default `output_dimension`. **Must match the `vector(N)` column width in the DB migration** |
| `LLM_PROVIDER` | yes | `anthropic` \| `openai` | Selects the `LLMProvider` implementation |
| `LLM_API_KEY` | yes | — | API key for the chosen LLM provider |
| `LLM_MODEL` | yes | e.g. `claude-opus-4-8` | Any current model string for the chosen provider — kept as a plain env var so it's swappable without a code change |
| `CONFIDENCE_THRESHOLD` | yes | `0.35` | Minimum cosine similarity (0–1) required before calling the LLM at all |
| `CHUNK_MAX_TOKENS` | yes | `400` | Token budget per chunk |
| `FREE_TIER_DAILY_QUESTION_LIMIT` | yes | `20` | Per brief §6 |
| `TELEGRAM_API_ID` | yes | `12345678` | From [my.telegram.org](https://my.telegram.org) — MTProto app credentials, **not** the bot token |
| `TELEGRAM_API_HASH` | yes | `abcdef0123...` | From my.telegram.org, paired with `TELEGRAM_API_ID` |
| `MTPROTO_SESSION_STRING` | yes | — | Generated once via the interactive login script below. **High-value secret — see security note below.** |
| `MTPROTO_SYNC_CRON` | yes | `0 0,12 * * *` | Twice-daily cron expression for the backfill/reconciliation job (`node-cron` syntax) |
| `NODE_ENV` | yes | `development` \| `production` | |

Load and validate with `dotenv` + a small schema check (e.g. `zod`) at boot — fail fast with a clear message if a required var is missing, rather than failing deep inside a request handler.

### MTProto credentials — how to get them, and how to treat them

`TELEGRAM_API_ID` / `TELEGRAM_API_HASH` are free, obtained by logging into [my.telegram.org](https://my.telegram.org) with the phone number of the account that will run the sync job, under "API development tools." These identify the *application*, not the account — they're low-sensitivity, similar to an OAuth client ID.

`MTPROTO_SESSION_STRING` is different: it is the **login credential for a real Telegram user account**, generated once via a short interactive script (not part of the normal server boot):

```js
// scripts/generate-mtproto-session.js
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input"; // npm i input — for interactive CLI prompts

const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });

await client.start({
  phoneNumber: async () => await input.text("Phone number: "),
  password: async () => await input.text("2FA password (if enabled): "),
  phoneCode: async () => await input.text("Login code sent to Telegram: "),
  onError: (err) => console.error(err),
});

console.log("Save this as MTPROTO_SESSION_STRING:");
console.log(client.session.save());
```

Run this **once**, locally, using the phone number of the account that has already joined every group you intend to sync. Save the printed string as `MTPROTO_SESSION_STRING` in your secrets manager (or a local `.env` that is `.gitignore`d) — **never commit it**. Treat it exactly like a password: anyone with this string can act as that Telegram account. See `MVP_SCOPE.md` risk #1 for the account/ToS considerations that come with using MTProto at all.

## Local Postgres with pgvector

Use Docker so pgvector doesn't need a manual extension build:

```yaml
# docker-compose.yml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: tgkb
      POSTGRES_PASSWORD: tgkb
      POSTGRES_DB: tgkb
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

```bash
docker compose up -d
```

`DATABASE_URL=postgres://tgkb:tgkb@localhost:5432/tgkb`

## package.json — core dependencies

```json
{
  "dependencies": {
    "telegraf": "^4",
    "pg": "^8",
    "pgvector": "^0.2",
    "node-pg-migrate": "^7",
    "dotenv": "^16",
    "zod": "^3",
    "pino": "^9",
    "telegram": "^2",
    "node-cron": "^3"
  },
  "devDependencies": {
    "input": "^0.3"
  }
}
```

Notes:
- `pgvector` (npm package) provides the JS helper to serialize/deserialize `vector` literals for `pg` — use it rather than hand-formatting vector strings.
- `node-pg-migrate` for plain-SQL migrations (keeps full control over the `vector` column type and HNSW index, which an ORM like Prisma does not model natively).
- `telegram` is the **GramJS** package (MTProto client) — separate from `telegraf` (Bot API). Both are needed: `telegraf` for real-time messages, `telegram` for the backfill/sync job.
- `node-cron` schedules `runMtprotoSyncForAllChats` at `MTPROTO_SYNC_CRON`.
- `input` is only used by the one-time interactive session-generation script (`scripts/generate-mtproto-session.js`) — a dev dependency, not needed at runtime.
- Add exactly one embedding client (`voyageai` for the MVP default) and one LLM client (`@anthropic-ai/sdk` / `openai`), depending on `EMBEDDING_PROVIDER` / `LLM_PROVIDER` — don't install all of them speculatively.

## Running the bot locally

**Polling mode (recommended for local dev)** — no public URL or ngrok needed:

```bash
USE_POLLING=true npm start
```

**Webhook mode (for testing production-like behavior)** — requires a public HTTPS URL:

```bash
ngrok http 3000
# then set TELEGRAM_WEBHOOK_URL to the ngrok https URL + /telegram/webhook
# and USE_POLLING=false
npm start
```

## Getting a test bot token

1. Message `@BotFather` on Telegram → `/newbot` → follow prompts → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Disable "Group Privacy" via BotFather's `/setprivacy` → Disable, so the bot receives all group messages, not just commands/mentions.
3. Create a private test group, add the bot to it as a member.

## Setting up the MTProto test account

1. Use a real Telegram account (a personal test account is fine) that is already a member of the test group from step 3 above — the sync job authenticates as this account, not as the bot.
2. Get `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org) using that account's phone number.
3. Run `node scripts/generate-mtproto-session.js` once, interactively, to produce `MTPROTO_SESSION_STRING` (see above).
4. Populate the four `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `MTPROTO_SESSION_STRING` / `MTPROTO_SYNC_CRON` env vars before running the sync job locally.

## Migrations

```bash
npx node-pg-migrate up
```

Migration files live in `/migrations`, one per table/index from `DATA_MODEL.md`, run in order against `DATABASE_URL`.
