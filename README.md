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
