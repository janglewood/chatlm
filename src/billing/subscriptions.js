import { pool } from "../db/pool.js";
import { setPlanTier } from "../db/chats.js";

/**
 * Manual plan upgrade/downgrade — MVP has no real payment gateway wired up
 * (MVP_SCOPE.md risk #8: cut per explicit decision). An operator runs this
 * after confirming payment out-of-band (invoice, crypto, etc.) via
 * `scripts/set-plan-tier.js`. `subscriptions` rows exist for future
 * integration with a real provider (Stripe/YooKassa/CloudPayments).
 *
 * @param {number} chatId
 * @param {'free'|'pro'|'business'} planTier
 */
export async function upgradeChatPlanManually(chatId, planTier) {
  // Only one row may be active/past_due per chat (see the partial unique
  // index in DATA_MODEL.md) — cancel any existing one first.
  await pool.query(
    `UPDATE subscriptions SET status = 'canceled', updated_at = now()
     WHERE chat_id = $1 AND status IN ('active', 'past_due')`,
    [chatId],
  );

  await pool.query(
    `INSERT INTO subscriptions (chat_id, plan_tier, status, provider)
     VALUES ($1, $2, 'active', 'manual')`,
    [chatId, planTier],
  );

  await setPlanTier(chatId, planTier);
}
