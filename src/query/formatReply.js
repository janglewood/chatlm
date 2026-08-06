import { t } from "./i18n.js";

// The reply is sent with parse_mode: "HTML" (see bot/index.js) so citations
// can render as real hyperlinks instead of a bare URL on its own line.
// Telegram's HTML mode only requires escaping these three characters (unlike
// MarkdownV2's much larger escape set) — but it's not optional: answer.text,
// author names, and message previews are all content we don't control (LLM
// output or raw chat text), and an unescaped "<" or "&" in there would
// either corrupt the markup or make Telegram reject the send outright.
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDate(date, dateLocale) {
  return new Date(date).toLocaleDateString(dateLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Caps how many entries the "Also found" section lists — independent of
// RELATED_MESSAGES_LIMIT (env.js), which controls how many candidates clear
// the relatedness bar in the first place; this is purely a display limit so
// a strong match doesn't get buried under a long tail of loose ones.
const ALSO_FOUND_LIMIT = 3;

function formatRelatedSection(citations, heading, dateLocale) {
  const lines = citations.map((c, i) => {
    const line = `${i + 1}. ${escapeHtml(c.authorDisplayName)}, ${formatDate(c.messageDate, dateLocale)}: "${escapeHtml(c.textPreview)}"`;
    return c.link ? `<a href="${c.link}">${line}</a>` : line;
  });
  return `${heading}\n${lines.join("\n")}`;
}

/**
 * Reply formatting contract (API_CONTRACTS.md §3, extended): the primary
 * answer gets a single citation line naming the author + date of the
 * message it actually came from, rendered as a hyperlink to that message
 * when one's resolvable (see buildMessageLink in answerQuestion.js); any
 * further loosely-related messages are listed underneath as "Also
 * found:"/"Также нашлось:", each one itself a hyperlink when it has a link.
 * When refused, there's no primary citation, but the same loosely-related
 * messages (if any) are offered under "This might help:"/"Возможно, вам
 * поможет:" instead of a bare dead-end reply. Heading/citation-phrase
 * language follows answer.lang (see i18n.js) — the language the question
 * was asked in, not a fixed one.
 *
 * @param {{ text: string, citations: Array<{ authorDisplayName: string, messageDate: Date,
 *   textPreview: string, link: string|null }>, refused: boolean, lang: string }} answer
 * @returns {string} HTML — send with parse_mode: "HTML"
 */
export function formatReply(answer) {
  const strings = t(answer.lang);
  const text = escapeHtml(answer.text);

  if (answer.refused) {
    // Not bolded — a "couldn't find it" message isn't the payload the way
    // a real answer is, and bolding it would read as oddly emphatic.
    if (answer.citations.length === 0) return text;
    return `${text}\n\n${formatRelatedSection(answer.citations, strings.mightHelp, strings.dateLocale)}`;
  }

  const [primary, ...related] = answer.citations;
  const citedPhrase = strings.citedFrom(
    escapeHtml(primary.authorDisplayName),
    formatDate(primary.messageDate, strings.dateLocale),
  );
  const citedLine = primary.link ? `<a href="${primary.link}">${citedPhrase}</a>` : citedPhrase;
  // Bold, applied by us rather than left to the model (which is deliberately
  // kept to plain text — see promptTemplate.js) so it's always exactly the
  // answer, safely, regardless of what the model does or doesn't emit.
  // Weight (bold) doesn't compete with the citation link's own styling
  // (color/underline) below it — different visual dimension entirely.
  let reply = `<b>${text}</b>\n\n${citedLine}`;

  if (related.length > 0) {
    reply += `\n\n${formatRelatedSection(related.slice(0, ALSO_FOUND_LIMIT), strings.alsoFound, strings.dateLocale)}`;
  }

  return reply;
}
