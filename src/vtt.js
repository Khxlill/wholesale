// Parses YouTube WebVTT captions (including rolling auto-captions) into timestamped text segments.

const TIME = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->/;

function seconds(match) {
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

const clean = (line) =>
  line
    .replace(/<[^>]+>/g, "") // inline word timings and <c> tags
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/** Returns [{ t: seconds, text }] with each spoken line once, in order. */
export function parseVtt(vtt) {
  const lines = [];
  let current = null;
  let last = "";
  for (const raw of vtt.replace(/\r/g, "").split("\n")) {
    const time = raw.match(TIME);
    if (time) {
      current = seconds(time);
      continue;
    }
    if (current === null) continue; // header
    const text = clean(raw);
    // Rolling auto-captions repeat the previous line at the top of each cue; emit each line once.
    if (!text || text === last) continue;
    if (/^\[(music|applause|laughter)\]$/i.test(text)) continue;
    lines.push({ t: current, text });
    last = text;
  }
  return lines;
}

/**
 * Parses text copied from YouTube's "Show transcript" panel:
 *   0:03
 *   so today we're going to talk about
 *   1:02:15
 *   ...
 * Plain text without timestamps also works (everything gets t = 0).
 */
export function parseTranscriptText(text) {
  const lines = [];
  let t = 0;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const ts = line.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (ts) {
      t = Number(ts[1] ?? 0) * 3600 + Number(ts[2]) * 60 + Number(ts[3]);
      continue;
    }
    lines.push({ t, text: line });
  }
  return lines;
}

/** Groups caption lines into passages of roughly `words` words for search. */
export function toPassages(lines, words = 120) {
  const passages = [];
  let buf = [];
  let start = 0;
  let count = 0;
  for (const line of lines) {
    if (!buf.length) start = line.t;
    buf.push(line.text);
    count += line.text.split(" ").length;
    if (count >= words) {
      passages.push({ t: Math.floor(start), text: buf.join(" ") });
      buf = [];
      count = 0;
    }
  }
  if (buf.length) passages.push({ t: Math.floor(start), text: buf.join(" ") });
  return passages;
}
