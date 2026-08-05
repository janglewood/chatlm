function formatDateRu(date) {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatRelatedSection(citations, heading) {
  const lines = citations.map((c, i) => {
    const base = `${i + 1}. ${c.authorDisplayName}, ${formatDateRu(c.messageDate)}: "${c.textPreview}"`;
    return c.link ? `${base}\n${c.link}` : base;
  });
  return `${heading}\n${lines.join("\n")}`;
}

/**
 * Reply formatting contract (API_CONTRACTS.md §3, extended): the primary
 * answer gets a single citation line naming the author + date of the
 * message it actually came from; any further loosely-related messages are
 * listed underneath as "Также нашлось:". When refused, there's no primary
 * citation, but the same loosely-related messages (if any) are offered
 * under "Возможно, вам поможет:" instead of a bare dead-end reply.
 *
 * @param {{ text: string, citations: Array<{ authorDisplayName: string, messageDate: Date,
 *   textPreview: string, link: string|null }>, refused: boolean }} answer
 */
export function formatReply(answer) {
  if (answer.refused) {
    if (answer.citations.length === 0) return answer.text;
    return `${answer.text}\n\n${formatRelatedSection(answer.citations, "Возможно, вам поможет:")}`;
  }

  const [primary, ...related] = answer.citations;
  let reply = `${answer.text}\n\n— по сообщению от ${primary.authorDisplayName}, ${formatDateRu(primary.messageDate)}`;

  if (related.length > 0) {
    reply += `\n\n${formatRelatedSection(related, "Также нашлось:")}`;
  }

  return reply;
}
