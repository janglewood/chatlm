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
    lang: "ru",
    citations: [citation({ authorDisplayName: "Anna", messageDate: new Date("2026-03-14T00:00:00Z") })],
  };

  const reply = formatReply(answer);

  assert.match(reply, /^<b>Релиз запланирован на пятницу\.<\/b>/);
  assert.match(reply, /— по сообщению от Anna, 14\.03\.2026$/);
});

test("formatReply does not bold a refusal — only a real answer is emphasized", () => {
  const answer = { text: "Не нашёл информации по этому вопросу.", refused: true, lang: "ru", citations: [] };
  const reply = formatReply(answer);
  assert.doesNotMatch(reply, /<b>/);
});

test("formatReply renders the primary citation as a hyperlink, when a link is resolvable", () => {
  const answer = {
    text: "Релиз запланирован на пятницу.",
    refused: false,
    lang: "ru",
    citations: [citation({ link: "https://t.me/c/123456/42" })],
  };

  const reply = formatReply(answer);

  assert.match(
    reply,
    /<a href="https:\/\/t\.me\/c\/123456\/42">— по сообщению от Anna, 14\.03\.2026<\/a>$/,
  );
});

test("formatReply adds a 'Также нашлось' section for additional related messages", () => {
  const answer = {
    text: "Ответ.",
    refused: false,
    lang: "ru",
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
  // Boris has no link — plain line, not wrapped.
  assert.match(reply, /\n1\. Boris, .*: "somewhat related"\n/);
  // Carl has a link — the whole line is wrapped in a single <a> hyperlink.
  assert.match(
    reply,
    /<a href="https:\/\/t\.me\/c\/123456\/789">2\. Carl, .*: "also related"<\/a>/,
  );
  // Boris and Carl are related-only, not the primary citation.
  assert.doesNotMatch(reply, /по сообщению от Boris/);
});

test("formatReply caps the 'Also found' section at 3 entries", () => {
  const answer = {
    text: "Ответ.",
    refused: false,
    lang: "ru",
    citations: [
      citation({ authorDisplayName: "Primary", textPreview: "the actual answer" }),
      citation({ authorDisplayName: "Boris", textPreview: "related one" }),
      citation({ authorDisplayName: "Carl", textPreview: "related two" }),
      citation({ authorDisplayName: "Dana", textPreview: "related three" }),
      citation({ authorDisplayName: "Elena", textPreview: "related four" }),
    ],
  };

  const reply = formatReply(answer);

  assert.match(reply, /Boris/);
  assert.match(reply, /Carl/);
  assert.match(reply, /Dana/);
  assert.doesNotMatch(reply, /Elena/);
});

test("formatReply omits the related section when there's only a primary citation", () => {
  const answer = { text: "Ответ.", refused: false, lang: "ru", citations: [citation()] };
  const reply = formatReply(answer);
  assert.doesNotMatch(reply, /Также нашлось/);
});

test("formatReply shows a bare refusal when there are no related messages", () => {
  const answer = { text: "Не нашёл информации по этому вопросу.", refused: true, lang: "ru", citations: [] };
  assert.equal(formatReply(answer), answer.text);
});

test("formatReply offers related messages alongside a refusal, when any exist", () => {
  const answer = {
    text: "Не нашёл информации по этому вопросу.",
    refused: true,
    lang: "ru",
    citations: [citation({ authorDisplayName: "Dana", textPreview: "loosely related thing" })],
  };

  const reply = formatReply(answer);

  assert.match(reply, /^Не нашёл информации по этому вопросу\./);
  assert.match(reply, /Возможно, вам поможет:/);
  assert.match(reply, /1\. Dana, .*: "loosely related thing"/);
});

test("formatReply uses English headings and citation phrasing when lang is 'en'", () => {
  const answer = {
    text: "The release is planned for Friday.",
    refused: false,
    lang: "en",
    citations: [
      citation({ authorDisplayName: "Primary", textPreview: "the actual answer" }),
      citation({ authorDisplayName: "Boris", textPreview: "somewhat related" }),
    ],
  };

  const reply = formatReply(answer);

  assert.match(reply, /— from a message by Primary, 03\/14\/2026/);
  assert.match(reply, /Also found:/);
  assert.doesNotMatch(reply, /Также нашлось/);
});

test("formatReply uses the English refusal heading when lang is 'en'", () => {
  const answer = {
    text: "Couldn't find information on that.",
    refused: true,
    lang: "en",
    citations: [citation({ authorDisplayName: "Dana", textPreview: "loosely related thing" })],
  };

  const reply = formatReply(answer);

  assert.match(reply, /This might help:/);
});

test("formatReply HTML-escapes answer text and citation content it doesn't control", () => {
  const answer = {
    text: 'Use a List<string> & check x < y.',
    refused: false,
    lang: "en",
    citations: [
      citation({ authorDisplayName: "A & B <Corp>" }),
      citation({ authorDisplayName: "Someone", textPreview: 'said "x < y" works' }),
    ],
  };

  const reply = formatReply(answer);

  assert.match(reply, /Use a List&lt;string&gt; &amp; check x &lt; y\./);
  assert.match(reply, /A &amp; B &lt;Corp&gt;/);
  // Quotes aren't escaped — this is text content, not an HTML attribute, so
  // Telegram's HTML parser doesn't require it.
  assert.match(reply, /said "x &lt; y" works/);
  // Never sends raw, unescaped angle brackets from untrusted content.
  assert.doesNotMatch(reply, /List<string>/);
  assert.doesNotMatch(reply, /<Corp>/);
});
