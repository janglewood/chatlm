/* eslint-disable camelcase */

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE usage_counters (
      chat_id               BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      day                   DATE NOT NULL,
      question_count        INT NOT NULL DEFAULT 0,
      llm_tokens_used       BIGINT NOT NULL DEFAULT 0,
      embedding_tokens_used BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, day)
    );
  `);

  pgm.sql(`
    CREATE TABLE subscriptions (
      id                       BIGSERIAL PRIMARY KEY,
      chat_id                  BIGINT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      plan_tier                TEXT NOT NULL CHECK (plan_tier IN ('free', 'pro', 'business')),
      status                   TEXT NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'past_due', 'canceled', 'manual')),
      provider                 TEXT CHECK (provider IN ('stripe', 'yookassa', 'cloudpayments', 'manual')),
      external_customer_id     TEXT,
      external_subscription_id TEXT,
      current_period_end       TIMESTAMPTZ,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`
    CREATE UNIQUE INDEX idx_subscriptions_chat_active ON subscriptions (chat_id)
      WHERE status IN ('active', 'past_due');
  `);

  pgm.sql(`
    CREATE TABLE deletion_requests (
      id                             BIGSERIAL PRIMARY KEY,
      chat_id                        BIGINT NOT NULL,
      requested_by_telegram_user_id  BIGINT NOT NULL,
      requested_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at                   TIMESTAMPTZ,
      status                         TEXT NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending', 'completed', 'failed'))
    );
  `);
}

export async function down(pgm) {
  pgm.sql(`DROP TABLE IF EXISTS deletion_requests;`);
  pgm.sql(`DROP TABLE IF EXISTS subscriptions;`);
  pgm.sql(`DROP TABLE IF EXISTS usage_counters;`);
}
