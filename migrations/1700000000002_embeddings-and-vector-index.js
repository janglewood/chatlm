/* eslint-disable camelcase */

// Vector width comes from EMBEDDING_DIMENSIONS (default 1024, matching Voyage
// voyage-4-lite's default output_dimension — see ENV_SETUP.md / MVP_SCOPE.md
// risk #4/#5). Changing this after data exists requires a re-embed, not just
// a migration — see DATA_MODEL.md notes on pgvector indexes.
const DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS ?? 1024);

export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    CREATE TABLE embeddings (
      chunk_id   BIGINT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
      vector     VECTOR(${DIMENSIONS}) NOT NULL,
      model      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // HNSW cosine-distance index. All top-k queries must filter by chat_id via
  // the chunks join (see DATA_MODEL.md) — there is no per-tenant partitioning
  // at MVP scale.
  pgm.sql(`
    CREATE INDEX idx_embeddings_vector_cosine ON embeddings
      USING hnsw (vector vector_cosine_ops);
  `);
}

export async function down(pgm) {
  pgm.sql(`DROP TABLE IF EXISTS embeddings;`);
}
