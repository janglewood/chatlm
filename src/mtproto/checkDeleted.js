import { getMtprotoClient } from "./client.js";

/**
 * Batch-checks whether specific Telegram messages still exist, grouped by
 * origin peer — a chat's history can span more than one peer after a
 * basic-group-to-supergroup migration (see sync.js), and a batch lookup is
 * per-peer. One MTProto call per distinct peer represented in `messages`,
 * not one per message.
 *
 * @param {Array<{ id: number, telegramChatId: string|number, telegramMessageId: number }>} messages
 *   `id` is OUR internal messages.id, returned as-is in the result so
 *   callers don't need to re-resolve anything.
 * @returns {Promise<Set<number>>} internal message ids confirmed deleted
 */
export async function findDeletedMessageIds(messages) {
  if (messages.length === 0) return new Set();

  const client = await getMtprotoClient();

  const byPeer = new Map();
  for (const m of messages) {
    const key = String(m.telegramChatId);
    if (!byPeer.has(key)) byPeer.set(key, []);
    byPeer.get(key).push(m);
  }

  const deletedIds = new Set();
  for (const [telegramChatId, group] of byPeer) {
    // getMessages preserves request order, one entry per id — a deleted or
    // never-existed id comes back as a hole (falsy) at that index rather
    // than an error or a shorter array, so index-aligning against `group`
    // is safe. Verified live against a real deleted/nonexistent id.
    const fetched = await client.getMessages(Number(telegramChatId), {
      ids: group.map((m) => m.telegramMessageId),
    });
    fetched.forEach((msg, i) => {
      const isGone = !msg || msg.className === "MessageEmpty";
      if (isGone) deletedIds.add(group[i].id);
    });
  }

  return deletedIds;
}
