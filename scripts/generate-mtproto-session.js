import input from "input";
import { TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions/index.js";
import { env, requireEnv } from "../src/config/env.js";

requireEnv(["TELEGRAM_API_ID", "TELEGRAM_API_HASH"]);

// One-time interactive login for the MTProto backfill/sync account — see
// ENV_SETUP.md § MTProto credentials. Run once, save the printed string as
// MTPROTO_SESSION_STRING. This is a login credential for a real Telegram
// user account — never commit it, treat it like a password.
async function main() {
  const client = new TelegramClient(new StringSession(""), env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => input.text("Phone number (with country code): "),
    password: async () => input.text("2FA password (if enabled, else press enter): "),
    phoneCode: async () => input.text("Login code sent to Telegram: "),
    onError: (err) => console.error(err),
  });

  console.log("\nLogin successful. Save this as MTPROTO_SESSION_STRING in your .env:\n");
  console.log(client.session.save());

  await client.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
