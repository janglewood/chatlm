/**
 * A message that @mentions the bot is a question directed AT it, not chat
 * content — it carries no fact worth indexing, and including it in the
 * corpus just adds noise (it'll often surface as a "related" citation to a
 * later, similar question, which is unhelpful). Shared between the live Bot
 * API ingestion path (bot/index.js) and the MTProto backfill path
 * (mtproto/sync.js) so both apply the exact same rule.
 */
export function isAddressedToBot(text, botUsername) {
  if (!botUsername || !text) return false;
  return text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
}
