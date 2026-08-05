import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { env, requireEnv } from "../config/env.js";
import { logger } from "../logger.js";

let client = null;

/**
 * Lazily connects and reuses a single long-lived MTProto client for the
 * process lifetime — authenticated as a real Telegram user account (not the
 * bot), per ARCHITECTURE.md §2a / MVP_SCOPE.md risk #1. That account must
 * already be a member of every chat the sync job is asked to fetch history
 * for; teleproto resolves our stored `telegram_chat_id` (the same
 * Bot-API-style "marked ID" Telegraf gives us) directly, so no ID
 * conversion is needed between the two APIs.
 */
export async function getMtprotoClient() {
  if (client?.connected) return client;

  requireEnv(["TELEGRAM_API_ID", "TELEGRAM_API_HASH", "MTPROTO_SESSION_STRING"]);

  client = new TelegramClient(
    new StringSession(env.MTPROTO_SESSION_STRING),
    env.TELEGRAM_API_ID,
    env.TELEGRAM_API_HASH,
    { connectionRetries: 5 },
  );

  await client.connect();
  logger.info("MTProto client connected");
  return client;
}

export async function disconnectMtprotoClient() {
  if (client?.connected) {
    await client.disconnect();
    logger.info("MTProto client disconnected");
  }
}
