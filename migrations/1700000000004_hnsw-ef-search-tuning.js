/* eslint-disable camelcase */

// Matches env.js's HNSW_EF_SEARCH default — see that file for why pgvector's
// own default (40) isn't enough for this corpus. Set at the DATABASE level
// (not per-connection in pool.js) so every session gets it automatically
// from first query, with no startup-ordering race: the hnsw.ef_search GUC
// only exists in a backend once the vector extension's library has loaded
// into it, which normally only happens lazily on that session's first
// vector operation — a `SET` issued from application code right after
// connecting (e.g. in pg's pool "connect" handler) can run BEFORE that,
// and fails with "unrecognized configuration parameter" (verified live: the
// pool hands back a client and lets the caller's query start running before
// an async "connect" listener elsewhere has finished awaiting its own
// queries — the two aren't ordered against each other). ALTER DATABASE
// avoids this entirely: Postgres applies database-level config defaults as
// part of backend startup itself, before any application code runs.
const EF_SEARCH = Number(process.env.HNSW_EF_SEARCH ?? 100);

export const shorthands = undefined;

export async function up(pgm) {
  // ALTER DATABASE requires a literal database name, not an expression, so
  // current_database() can't be interpolated directly into the statement —
  // routed through EXECUTE/format() instead so this doesn't need to know
  // DATABASE_URL's database name at migration-write time.
  pgm.sql(`
    DO $$
    BEGIN
      EXECUTE format('ALTER DATABASE %I SET hnsw.ef_search = %L', current_database(), ${EF_SEARCH});
    END $$;
  `);
}

export async function down(pgm) {
  pgm.sql(`
    DO $$
    BEGIN
      EXECUTE format('ALTER DATABASE %I RESET hnsw.ef_search', current_database());
    END $$;
  `);
}
