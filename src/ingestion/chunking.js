/**
 * Rough token estimate (chars / 4) used only to bound chunk size — this is a
 * heuristic, not an exact tokenizer. It doesn't need to match any provider's
 * real tokenization; it just needs to be a consistent knob for keeping
 * chunks roughly CHUNK_MAX_TOKENS-sized. See API_CONTRACTS.md §2.
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function formatMessageLine(message) {
  return `${message.author_display_name}: ${message.text}`;
}

const DEFAULT_MAX_GAP_MINUTES = 20;

/**
 * Greedily groups an ordered list of raw message rows into token-bounded
 * chunks, also starting a new chunk whenever there's a large time gap since
 * the previous message. The time-gap boundary matters as much as the token
 * budget in practice: a busy group chat jumps between unrelated topics
 * constantly, and without it, a token budget alone will happily merge
 * "how do I flash the head unit", "the door lock is acting up", and
 * "battery drain in security mode" into one chunk just because they fit —
 * which averages their embedding into something that matches none of them
 * well. Never splits a single message across two chunks — a message longer
 * than maxTokens becomes its own (oversized) chunk on its own.
 *
 * @param {Array<{ id: number, author_display_name: string, text: string, sent_at: Date }>} messages
 * @param {number} maxTokens
 * @param {number} [maxGapMinutes]
 * @returns {Array<{ sourceMessageIds: number[], text: string, tokenCount: number, firstMessageAt: Date }>}
 */
export function buildChunks(messages, maxTokens, maxGapMinutes = DEFAULT_MAX_GAP_MINUTES) {
  const chunks = [];
  let current = null;
  let lastMessageAt = null;

  for (const message of messages) {
    const line = formatMessageLine(message);
    const lineTokens = estimateTokens(line);

    const gapMinutes = lastMessageAt
      ? (new Date(message.sent_at) - new Date(lastMessageAt)) / 60000
      : 0;

    if (current && (current.tokenCount + lineTokens > maxTokens || gapMinutes > maxGapMinutes)) {
      chunks.push(finalizeChunk(current));
      current = null;
    }

    if (!current) {
      current = {
        sourceMessageIds: [],
        lines: [],
        tokenCount: 0,
        firstMessageAt: message.sent_at,
      };
    }

    current.sourceMessageIds.push(message.id);
    current.lines.push(line);
    current.tokenCount += lineTokens;
    lastMessageAt = message.sent_at;
  }

  if (current) chunks.push(finalizeChunk(current));

  return chunks;
}

function finalizeChunk(current) {
  return {
    sourceMessageIds: current.sourceMessageIds,
    text: current.lines.join("\n"),
    tokenCount: current.tokenCount,
    firstMessageAt: current.firstMessageAt,
  };
}
