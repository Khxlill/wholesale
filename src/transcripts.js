// Keyword (BM25) search over downloaded Flip With Rick transcripts in knowledge/transcripts/*.json.
import fs from "node:fs";
import path from "node:path";
import { KNOWLEDGE_DIR } from "./knowledge.js";
import { toPassages } from "./vtt.js";

export const TRANSCRIPTS_DIR = path.join(KNOWLEDGE_DIR, "transcripts");

const STOP = new Set(
  "a an and are as at be but by do for from get go got have he her his how i if in into is it its just like me my no not of on or our so that the their them then there they this to up us was we what when which who will with you your yeah okay um uh gonna wanna really right know".split(" "),
);
const tokenize = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$%\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));

let index;

export function loadTranscripts(dir = TRANSCRIPTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

function buildIndex(videos) {
  const docs = [];
  for (const v of videos) {
    for (const p of toPassages(v.lines ?? [])) {
      const tokens = tokenize(`${v.title} ${p.text}`);
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      docs.push({ video: v, t: p.t, text: p.text, tf, len: tokens.length });
    }
  }
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / (docs.length || 1);
  return { docs, df, avgLen, videoCount: videos.length };
}

function getIndex() {
  index ??= buildIndex(loadTranscripts());
  return index;
}

export const transcriptCount = () => getIndex().videoCount;

const stamp = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Top passages for a query: [{ title, url, at, text }] */
export function searchTranscripts(query, k = 6, idx = getIndex()) {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !idx.docs.length) return [];
  const N = idx.docs.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = idx.docs.map((d) => {
    let score = 0;
    for (const term of q) {
      const f = d.tf.get(term);
      if (!f) continue;
      const n = idx.df.get(term);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.avgLen));
    }
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k)
    .map(({ d }) => ({
      title: d.video.title,
      url: d.video.url ? `https://youtu.be/${d.video.id}?t=${d.t}` : null,
      at: stamp(d.t),
      text: d.text,
    }));
}

export { buildIndex as _buildIndex };
