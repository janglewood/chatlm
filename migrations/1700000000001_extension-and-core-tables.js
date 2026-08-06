/* eslint-disable camelcase */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS vector;`);

  pgm.sql(`
    CREATE TABLE chats (
      id                     BIGSERIAL PRIMARY KEY,
      telegram_chat_id       BIGINT NOT NULL UNIQUE,
      title                  TEXT,
      owner_telegram_user_id BIGINT,
      plan_tier              TEXT NOT NULL DEFAULT 'free'
                               CHECK (plan_tier IN ('free', 'pro', 'business')),
      last_backfill_at       TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at             TIMESTAMPTZ
    );
  `);

  pgm.sql(`
    CREATE TABLE users (
      id               BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      display_name     TEXT NOT NULL,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE TABLE messages (
      id                      BIGSERIAL PRIMARY KEY,
      chat_id                 BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      -- The Telegram peer this message actually came from — usually equal to
      -- the parent chat's current telegram_chat_id, but NOT always: a basic
      -- group upgraded to a supergroup gets a brand new peer ID, and any
      -- history from before the upgrade is only fetchable via MTProto under
      -- the OLD peer ID (Telegram does not renumber old messages into the
      -- new supergroup's ID space). Storing the message's own origin peer
      -- here — rather than always trusting the parent chat's current ID —
      -- is what lets link-building (t.me/c/<peer>/<message>) stay correct
      -- per-message instead of producing a broken link for pre-upgrade
      -- history. See mtproto/sync.js's migration-chain backfill.
      telegram_chat_id        BIGINT NOT NULL,
      telegram_message_id     BIGINT NOT NULL,
      author_telegram_user_id BIGINT,
      author_display_name     TEXT NOT NULL,
      text                    TEXT NOT NULL,
      sent_at                 TIMESTAMPTZ NOT NULL,
      indexed_at              TIMESTAMPTZ,
      deleted_at              TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      -- Scoped by telegram_chat_id, not just chat_id: a message's
      -- telegram_message_id is only unique within the peer it came from, and
      -- a chat with pre-upgrade history spans two distinct peers.
      UNIQUE (chat_id, telegram_chat_id, telegram_message_id)
    );
  `);

  pgm.sql(`CREATE INDEX idx_messages_chat_sent_at ON messages (chat_id, sent_at);`);
  pgm.sql(`CREATE INDEX idx_messages_unindexed ON messages (chat_id) WHERE indexed_at IS NULL;`);

  pgm.sql(`
    CREATE TABLE chunks (
      id                 BIGSERIAL PRIMARY KEY,
      chat_id            BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      source_message_ids BIGINT[] NOT NULL,
      text               TEXT NOT NULL,
      token_count        INT NOT NULL,
      first_message_at   TIMESTAMPTZ NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_chunks_chat_id ON chunks (chat_id);`);
}

export async function down(pgm) {
  pgm.sql(`DROP TABLE IF EXISTS chunks;`);
  pgm.sql(`DROP TABLE IF EXISTS messages;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
  pgm.sql(`DROP TABLE IF EXISTS chats;`);
}
