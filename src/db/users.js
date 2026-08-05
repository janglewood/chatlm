import { pool } from "./pool.js";

/** Upserts a Telegram user by telegram_user_id, refreshing display_name. */
export async function upsertUser({ telegramUserId, displayName }) {
  if (telegramUserId == null) return null;
  const { rows } = await pool.query(
    `INSERT INTO users (telegram_user_id, display_name)
     VALUES ($1, $2)
     ON CONFLICT (telegram_user_id) DO UPDATE SET display_name = EXCLUDED.display_name
     RETURNING *`,
    [telegramUserId, displayName],
  );
  return rows[0];
}
