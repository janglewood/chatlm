import pg from "pg";
import pgvector from "pgvector/pg";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

const { Pool } = pg;

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("connect", async (client) => {
  await pgvector.registerType(client);
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected Postgres pool error");
});

/**
 * Runs `SELECT 1` to confirm the pool can reach Postgres. Call once at boot
 * and fail fast (per ENV_SETUP.md / TASK_BREAKDOWN.md #1) rather than letting
 * the first request discover a bad DATABASE_URL.
 */
export async function checkDatabaseConnection() {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    logger.info("Postgres connection OK");
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` inside a BEGIN/COMMIT block on a single client, rolling back on
 * any error. Repository functions accept an optional `client` param
 * (defaulting to the pool) specifically so they can be composed inside this.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
