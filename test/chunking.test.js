import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChunks, estimateTokens } from "../src/ingestion/chunking.js";

function msg(id, author, text, sentAt) {
  return { id, author_display_name: author, text, sent_at: sentAt };
}

test("buildChunks groups messages under the token budget into one chunk", () => {
  const messages = [
    msg(1, "Anna", "let's ship the release today", new Date("2026-01-01T10:00:00Z")),
    msg(2, "Boris", "sounds good, I'll run the tests", new Date("2026-01-01T10:01:00Z")),
  ];

  const chunks = buildChunks(messages, 400);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].sourceMessageIds, [1, 2]);
  assert.equal(chunks[0].firstMessageAt, messages[0].sent_at);
  assert.match(chunks[0].text, /Anna:/);
  assert.match(chunks[0].text, /Boris:/);
});

test("buildChunks starts a new chunk once the token budget is exceeded", () => {
  const longText = "x".repeat(300); // ~75 estimated tokens
  const messages = [
    msg(1, "Anna", longText, new Date("2026-01-01T10:00:00Z")),
    msg(2, "Boris", longText, new Date("2026-01-01T10:01:00Z")),
    msg(3, "Carl", longText, new Date("2026-01-01T10:02:00Z")),
  ];

  // Each line is ~77 estimated tokens; budget fits 2 lines (154) but not 3 (231).
  const chunks = buildChunks(messages, 160);

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].sourceMessageIds, [1, 2]);
  assert.deepEqual(chunks[1].sourceMessageIds, [3]);
});

test("buildChunks never splits a single oversized message across chunks", () => {
  const huge = "y".repeat(4000); // ~1000 estimated tokens, way over budget
  const messages = [msg(1, "Anna", huge, new Date("2026-01-01T10:00:00Z"))];

  const chunks = buildChunks(messages, 100);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].sourceMessageIds, [1]);
  assert.ok(chunks[0].tokenCount > 100);
});

test("buildChunks starts a new chunk after a large time gap, even under the token budget", () => {
  const messages = [
    msg(1, "Anna", "how do I flash the head unit?", new Date("2026-01-01T09:00:00Z")),
    msg(2, "Boris", "does anyone know?", new Date("2026-01-01T09:01:00Z")),
    // 3 hours later — unrelated topic, should not merge with the above
    // even though both easily fit under a 400-token budget.
    msg(3, "Carl", "battery drain overnight is brutal", new Date("2026-01-01T12:05:00Z")),
  ];

  const chunks = buildChunks(messages, 400, 20);

  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0].sourceMessageIds, [1, 2]);
  assert.deepEqual(chunks[1].sourceMessageIds, [3]);
});

test("buildChunks does not split on small gaps within the threshold", () => {
  const messages = [
    msg(1, "Anna", "morning", new Date("2026-01-01T09:00:00Z")),
    msg(2, "Boris", "morning, still on for later?", new Date("2026-01-01T09:15:00Z")),
  ];

  const chunks = buildChunks(messages, 400, 20);

  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0].sourceMessageIds, [1, 2]);
});

test("buildChunks returns nothing for an empty message list", () => {
  assert.deepEqual(buildChunks([], 400), []);
});

test("estimateTokens is a stable, deterministic heuristic", () => {
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(400)), 100);
});
