# Telegram KB Bot

Turns a Telegram group's message history into a searchable knowledge base. See `specs/` for the full architecture, data model, API contracts, scope, and task breakdown this was built from.

## Prerequisites

- Node.js 20 LTS or 22+ (Node 21 does not work — see `package.json`'s `engines`)
- Docker (for local Postgres + pgvector)
- A Telegram bot token, Voyage AI API key, Anthropic API key, and MTProto (`my.telegram.org`) credentials — see `specs/ENV_SETUP.md` for how to get each one

## First-time setup

```bash
cp .env.example .env    # fill in the keys as you get them — see specs/ENV_SETUP.md
docker compose up -d    # starts Postgres+pgvector on localhost:5432
yarn install
yarn migrate:up
```

## Running locally

```bash
yarn dev     # polling mode (USE_POLLING=true in .env), auto-restarts on file changes
```

## One-time MTProto login

Before the backfill/sync job can run, generate a session string once (needs `TELEGRAM_API_ID`/`TELEGRAM_API_HASH` already set in `.env`):

```bash
yarn mtproto:session
```

Paste the printed string into `.env` as `MTPROTO_SESSION_STRING`. To trigger a sync manually instead of waiting for the twice-daily cron:

```bash
yarn mtproto:sync
```

## Manually upgrading a chat's plan

No payment gateway is wired up for MVP (see `specs/MVP_SCOPE.md` risk #8) — flip a chat's tier after confirming payment out-of-band:

```bash
yarn plan:set <telegram_chat_id> pro
```

## Tests

```bash
yarn test
```

Covers the pure logic (chunking, reply formatting) that doesn't need live credentials. The rest of the pipeline (embeddings, LLM answers, MTProto sync) needs real API keys to exercise end-to-end.

## Deploying to Railway

The app is a single always-on process (bot + `node-cron` MTProto scheduler sharing one Postgres pool — see `specs/ARCHITECTURE.md` §5), so it needs a persistent service, not a serverless function. `railway.json` in the repo root configures the build/start/healthcheck for this.

**1. Postgres with pgvector.** Railway's default Postgres plugin does not ship the `vector` extension that `migrations/1700000000001_extension-and-core-tables.js` requires. Add a service from a **Docker Image** using `pgvector/pgvector:pg16` (the same image `docker-compose.yml` uses locally) instead of the default Postgres plugin:
   - Environment: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (match whatever you'll put in `DATABASE_URL` below)
   - Attach a volume at `/var/lib/postgresql/data` so data survives redeploys

**2. App service.** "Deploy from GitHub repo" → this repo. Railway auto-detects Node/Yarn via Nixpacks; `railway.json` overrides the start command to run migrations before boot (`yarn migrate:up && yarn start`) and points Railway's health check at the existing `/health` endpoint ([src/index.js](src/index.js#L14-L27)).

**3. Environment variables** — set on the app service (see `.env.example` / `specs/ENV_SETUP.md` for what each does):
   - `DATABASE_URL` — `postgres://<user>:<pass>@<postgres-service-name>.railway.internal:5432/<db>` (Railway's private network hostname for the pgvector service from step 1)
   - `TELEGRAM_BOT_TOKEN`, `USE_POLLING=true` — polling avoids needing a public domain/webhook/TLS entirely
   - `EMBEDDING_PROVIDER`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`
   - `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`
   - `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `MTPROTO_SESSION_STRING` (generate locally first — see below), `MTPROTO_SYNC_CRON`
   - `NODE_ENV=production`

**4. MTProto session.** Generate it locally, not on Railway (`yarn mtproto:session` is interactive):
   ```bash
   yarn mtproto:session
   ```
   Paste the printed string into Railway's `MTPROTO_SESSION_STRING` variable as a secret — never commit it (see `specs/MVP_SCOPE.md` risk #1).

**5. Keep it at one instance.** Both the Bot API long-polling loop and the `node-cron` sync job assume a single running process — a second replica polling the same bot token causes Telegram to return `409 Conflict`, and would also double-run the twice-daily MTProto sync. Don't enable autoscaling/multiple replicas for this service.

**6. Deploy**, then check the deploy logs for `"Postgres connection OK"` / `"Bot launched in polling mode"`, and confirm `/health` returns `{"status":"ok"}` from Railway's service metrics tab.
