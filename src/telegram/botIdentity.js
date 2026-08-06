import { env, requireEnv } from "../config/env.js";

let cached = null;

/**
 * The bot's own Telegram identity (id + username) — needed by mtproto/sync.js
 * to filter the bot's own replies and "@bot, question" messages out of what
 * gets treated as real chat content (see botMention.js). The Bot API's live
 * update stream doesn't deliver a bot its own outgoing messages, so this
 * problem is specific to MTProto sync, which sees the full chat history
 * exactly as a human member would, bot replies included.
 *
 * The id needs no network round trip — Telegram bot tokens are literally
 * "<bot_id>:<secret>" — but the username does, so this is async and cached
 * after the first call.
 */
export async function getBotIdentity() {
  if (cached) return cached;
  requireEnv(["TELEGRAM_BOT_TOKEN"]);

  const id = env.TELEGRAM_BOT_TOKEN.split(":")[0];
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  const body = await response.json();
  if (!body.ok) {
    throw new Error(`Telegram getMe failed: ${JSON.stringify(body)}`);
  }

  cached = { id, username: body.result.username };
  return cached;
}
