import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVtt, toPassages } from "../src/vtt.js";
import { _buildIndex, searchTranscripts } from "../src/transcripts.js";

// Shape of a YouTube rolling auto-caption file.
const VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.350 align:start position:0%

call<00:00:00.440><c> the</c><00:00:00.560><c> fsbo</c><00:00:00.760><c> seller</c>

00:00:02.350 --> 00:00:02.360 align:start position:0%
call the fsbo seller


00:00:02.360 --> 00:00:04.550 align:start position:0%
call the fsbo seller
ask<00:00:02.560><c> about</c><00:00:02.920><c> motivation</c><00:00:03.080><c> first</c>

00:00:04.550 --> 00:00:04.560 align:start position:0%
ask about motivation first


00:00:04.560 --> 00:00:06.310 align:start position:0%
ask about motivation first
[Music]
`;

test("parseVtt removes rolling duplicates and inline timing tags", () => {
  const lines = parseVtt(VTT);
  assert.deepEqual(lines, [
    { t: 0, text: "call the fsbo seller" },
    { t: 2.36, text: "ask about motivation first" },
  ]);
});

test("toPassages groups lines by word count and keeps the start time", () => {
  const passages = toPassages(
    [
      { t: 0, text: "one two three" },
      { t: 5, text: "four five six" },
      { t: 10, text: "seven" },
    ],
    5,
  );
  assert.deepEqual(passages, [
    { t: 0, text: "one two three four five six" },
    { t: 10, text: "seven" },
  ]);
});

test("searchTranscripts ranks the relevant passage first and links the timestamp", () => {
  const idx = _buildIndex([
    { id: "aaaaaaaaaaa", url: "https://youtu.be/aaaaaaaaaaa", title: "Cold calling Zillow FSBOs", lines: [{ t: 65, text: "when you call a zillow fsbo seller ask why they are selling" }] },
    { id: "bbbbbbbbbbb", url: "https://youtu.be/bbbbbbbbbbb", title: "Title companies explained", lines: [{ t: 10, text: "the title company holds the earnest money deposit" }] },
  ]);
  const hits = searchTranscripts("zillow fsbo seller", 2, idx);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, "https://youtu.be/aaaaaaaaaaa?t=65");
  assert.equal(hits[0].at, "1:05");
  assert.deepEqual(searchTranscripts("earnest money", 2, idx).map((h) => h.title), ["Title companies explained"]);
});

test("parseTranscriptText reads YouTube's Show-transcript copy format", async () => {
  const { parseTranscriptText } = await import("../src/vtt.js");
  assert.deepEqual(parseTranscriptText("0:03\nso today we're comping\n1:02:15\nthe arv is key\n"), [
    { t: 3, text: "so today we're comping" },
    { t: 3735, text: "the arv is key" },
  ]);
});
