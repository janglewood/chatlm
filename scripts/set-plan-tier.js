import "../src/config/env.js";
import { getChatByTelegramId } from "../src/db/chats.js";
import { upgradeChatPlanManually } from "../src/billing/subscriptions.js";
import { pool } from "../src/db/pool.js";

// Manual, operator-run upgrade/downgrade — see src/billing/subscriptions.js.
// Usage: node scripts/set-plan-tier.js <telegram_chat_id> <free|pro|business>
async function main() {
  const [telegramChatIdArg, planTier] = process.argv.slice(2);

  if (!telegramChatIdArg || !["free", "pro", "business"].includes(planTier)) {
    console.error("Usage: node scripts/set-plan-tier.js <telegram_chat_id> <free|pro|business>");
    process.exitCode = 1;
    return;
  }

  const chat = await getChatByTelegramId(Number(telegramChatIdArg));
  if (!chat) {
    console.error(`No chat found for telegram_chat_id=${telegramChatIdArg}`);
    process.exitCode = 1;
    return;
  }

  await upgradeChatPlanManually(chat.id, planTier);
  console.log(`Chat ${chat.id} (telegram_chat_id=${telegramChatIdArg}) is now on plan "${planTier}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
