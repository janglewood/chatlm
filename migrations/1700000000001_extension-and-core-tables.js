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
      telegram_message_id     BIGINT NOT NULL,
      author_telegram_user_id BIGINT,
      author_display_name     TEXT NOT NULL,
      text                    TEXT NOT NULL,
      sent_at                 TIMESTAMPTZ NOT NULL,
      indexed_at              TIMESTAMPTZ,
      deleted_at              TIMESTAMPTZ,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (chat_id, telegram_message_id)
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
