import { utils, Api } from "teleproto";
import { getMtprotoClient, disconnectMtprotoClient } from "../src/mtproto/client.js";
import { getOrCreateChat } from "../src/db/chats.js";
import { insertMessage } from "../src/db/messages.js";
import { upsertUser } from "../src/db/users.js";
import { chunkAndEmbed } from "../src/embeddings/pipeline.js";
import { pool } from "../src/db/pool.js";

// One-off test-data utility (NOT part of the product) — copies text messages
// from a source chat the operator is a member of into a target chat's row in
// OUR database only (nothing is reposted on Telegram itself). Original
// author + date are preserved for realistic citation testing.
//
// Usage: node scripts/seed-test-chat.js <targetInviteLinkOrUsername> <sourceUsername> [limit]

// Large fixed offset applied to every seeded message's id so it can never
// collide with the real, small, sequentially-assigned message ids Telegram
// will hand out once real messages start flowing into the target chat.
// Trade-off: this means the twice-daily MTProto *reconciliation* pass for
// this specific chat will look for ids above the offset and find nothing —
// real-time Bot API ingestion is unaffected (it doesn't use this resume
// point), so live testing still works; this only matters for a disposable
// test chat like this one.
const ID_OFFSET = 500_000_000;

/**
 * `client.getEntity()`'s string-parsing path doesn't recognize the newer
 * `t.me/+HASH` invite link format (only the legacy `joinchat/HASH` one), so
 * we resolve it ourselves via the invite-check API. Requires the account to
 * already be a participant (returns `ChatInviteAlready`).
 */
async function resolveTargetChat(client, ref) {
  const hash = utils.resolveInviteLink(ref);
  if (!hash) {
    return client.getEntity(ref); // plain username/id — normal path is fine
  }

  const invite = await client.invoke(new Api.messages.CheckChatInvite({ hash }));

  if (invite.className === "ChatInviteAlready" || invite.className === "ChatInvitePeek") {
    return invite.chat;
  }

  throw new Error(
    "Not a member of the target chat yet — join it first (this script only works for chats you're already in).",
  );
}

function displayNameFromSender(sender, senderId) {
  if (sender) {
    const name = [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (sender.username) return sender.username;
  }
  return senderId ?? "Unknown";
}

async function main() {
  const [targetRef, sourceRef, limitArg] = process.argv.slice(2);
  const limit = limitArg ? Number(limitArg) : 3000;

  if (!targetRef || !sourceRef) {
    console.error(
      "Usage: node scripts/seed-test-chat.js <targetInviteLinkOrUsername> <sourceUsername> [limit]",
    );
    process.exitCode = 1;
    return;
  }

  const client = await getMtprotoClient();

  const targetEntity = await resolveTargetChat(client, targetRef);
  const targetTelegramChatId = Number(utils.getPeerId(targetEntity, true));
  const chat = await getOrCreateChat({
    telegramChatId: targetTelegramChatId,
    title: targetEntity.title ?? targetRef,
  });
  console.log(`Target chat: "${targetEntity.title}" -> chat.id=${chat.id} (telegram_chat_id=${targetTelegramChatId})`);

  const sourceEntity = await client.getEntity(sourceRef);
  console.log(`Seeding up to ${limit} text messages from "${sourceEntity.title ?? sourceRef}"...`);

  let fetched = 0;
  let seeded = 0;

  for await (const message of client.iterMessages(sourceEntity, { limit, reverse: true })) {
    fetched++;
    if (!message.message) continue; // text only, matching the product's scope

    const senderId = message.senderId ? message.senderId.toString() : null;
    const displayName = displayNameFromSender(message.sender, senderId);

    if (senderId) {
      await upsertUser({ telegramUserId: senderId, displayName });
    }

    const inserted = await insertMessage({
      chatId: chat.id,
      telegramChatId: targetTelegramChatId,
      telegramMessageId: message.id + ID_OFFSET,
      authorTelegramUserId: senderId,
      authorDisplayName: displayName,
      text: message.message,
      sentAt: new Date(message.date * 1000),
    });

    if (inserted) seeded++;
  }

  console.log(`Fetched ${fetched} messages from source, seeded ${seeded} new text messages.`);
  console.log("Chunking + embedding...");

  const result = await chunkAndEmbed(chat.id);
  console.log(`Done: ${result.chunksCreated} chunks created for chat.id=${chat.id}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectMtprotoClient();
    await pool.end();
  });
