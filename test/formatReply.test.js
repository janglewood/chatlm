import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReply } from "../src/query/formatReply.js";

function citation(overrides) {
  return {
    authorDisplayName: "Anna",
    messageDate: new Date("2026-03-14T00:00:00Z"),
    telegramMessageId: 123,
    textPreview: "some message text",
    link: null,
    ...overrides,
  };
}

test("formatReply appends a single primary citation line for a confident answer", () => {
  const answer = {
    text: "Релиз запланирован на пятницу.",
    refused: false,
    citations: [citation({ authorDisplayName: "Anna", messageDate: new Date("2026-03-14T00:00:00Z") })],
  };

  const reply = formatReply(answer);

  assert.match(reply, /^Релиз запланирован на пятницу\./);
  assert.match(reply, /— по сообщению от Anna, 14\.03\.2026$/);
});

test("formatReply adds a 'Также нашлось' section for additional related messages", () => {
  const answer = {
    text: "Ответ.",
    refused: false,
    citations: [
      citation({ authorDisplayName: "Primary", textPreview: "the actual answer" }),
      citation({ authorDisplayName: "Boris", textPreview: "somewhat related", link: null }),
      citation({
        authorDisplayName: "Carl",
        textPreview: "also related",
        link: "https://t.me/c/123456/789",
      }),
    ],
  };

  const reply = formatReply(answer);

  assert.match(reply, /— по сообщению от Primary,/);
  assert.match(reply, /Также нашлось:/);
  assert.match(reply, /1\. Boris, .*: "somewhat related"/);
  assert.match(reply, /2\. Carl, .*: "also related"\nhttps:\/\/t\.me\/c\/123456\/789/);
  // Boris and Carl are related-only, not the primary citation.
  assert.doesNotMatch(reply, /по сообщению от Boris/);
});

test("formatReply omits the related section when there's only a primary citation", () => {
  const answer = { text: "Ответ.", refused: false, citations: [citation()] };
  const reply = formatReply(answer);
  assert.doesNotMatch(reply, /Также нашлось/);
});

test("formatReply shows a bare refusal when there are no related messages", () => {
  const answer = { text: "Не нашёл информации по этому вопросу.", refused: true, citations: [] };
  assert.equal(formatReply(answer), answer.text);
});

test("formatReply offers related messages alongside a refusal, when any exist", () => {
  const answer = {
    text: "Не нашёл информации по этому вопросу.",
    refused: true,
    citations: [citation({ authorDisplayName: "Dana", textPreview: "loosely related thing" })],
  };

  const reply = formatReply(answer);

  assert.match(reply, /^Не нашёл информации по этому вопросу\./);
  assert.match(reply, /Возможно, вам поможет:/);
  assert.match(reply, /1\. Dana, .*: "loosely related thing"/);
});
