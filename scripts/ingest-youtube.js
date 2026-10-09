#!/usr/bin/env node
// Downloads YouTube captions for Flip With Rick videos into knowledge/transcripts/<id>.json
// so the chatbot can search and quote them. Needs yt-dlp (https://github.com/yt-dlp/yt-dlp).
//
//   npm run ingest                                   # the curated list in scripts/flip-with-rick-videos.txt
//   npm run ingest -- https://youtu.be/ID ID2 ...    # specific videos
//   npm run ingest -- --channel @FlipWithRick --match "zillow|fsbo" --limit 30
//   npm run ingest -- --cookies-from-browser chrome  # if YouTube says "confirm you're not a bot"
//   npm run ingest -- --from-file notes.txt --id VIDEO_ID --title "Video title"
//       (a .vtt/.srt caption file, or text copied from YouTube's "Show transcript" panel - no yt-dlp needed)
//
// YouTube blocks most cloud/datacenter IPs. Run this on your own computer, then commit the JSON files.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTranscriptText, parseVtt } from "../src/vtt.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, "..", "knowledge", "transcripts");
const LIST = path.join(here, "flip-with-rick-videos.txt");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const channel = opt("--channel");
const match = opt("--match");
const limit = Number(opt("--limit") ?? 50);
const delay = Number(opt("--delay") ?? 4) * 1000;
const browser = opt("--cookies-from-browser");
const cookies = opt("--cookies") ?? process.env.YTDLP_COOKIES;
const force = flag("--force");
const fromFile = opt("--from-file");
const fileId = opt("--id");
const fileTitle = opt("--title");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idOf = (s) => {
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/) ?? s.match(/^([\w-]{11})$/);
  return m?.[1];
};

function ytdlpBase() {
  let version;
  try {
    version = execFileSync("yt-dlp", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    console.error("yt-dlp is not installed. Install it first:\n  pip install -U yt-dlp   (or: brew install yt-dlp)\nNode.js must also be on PATH (yt-dlp uses it to solve YouTube's JS challenge).");
    process.exit(1);
  }
  const base = ["--no-warnings"];
  // yt-dlp 2025.11+ needs an external JS runtime for YouTube; Node is guaranteed to exist here.
  if (version >= "2025.11") base.push("--js-runtimes", "node");
  if (browser) base.push("--cookies-from-browser", browser);
  if (cookies) base.push("--cookies", cookies);
  return base;
}

function listChannel(base) {
  const url = channel.startsWith("http") ? channel : `https://www.youtube.com/${channel}/videos`;
  const out = execFileSync("yt-dlp", [...base, "--flat-playlist", "--print", "%(id)s\t%(title)s", url], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const re = match ? new RegExp(match, "i") : null;
  return out
    .split("\n")
    .map((l) => l.split("\t"))
    .filter(([id, title]) => id && (!re || re.test(title ?? "")))
    .map(([id]) => id);
}

function fetchOne(base, id, tmp) {
  const r = spawnSync(
    "yt-dlp",
    [...base, "--skip-download", "--write-auto-subs", "--write-subs", "--sub-langs", "en,en-US,en-orig", "--sub-format", "vtt", "--write-info-json", "-o", path.join(tmp, "%(id)s.%(ext)s"), `https://www.youtube.com/watch?v=${id}`],
    { encoding: "utf8" },
  );
  const files = fs.readdirSync(tmp);
  const vtt = ["en", "en-US", "en-orig"].map((l) => `${id}.${l}.vtt`).find((f) => files.includes(f));
  const infoFile = files.find((f) => f === `${id}.info.json`);
  if (!vtt) {
    const err = (r.stderr || r.stdout || "").split("\n").find((l) => l.includes("ERROR")) ?? "no English captions";
    return { error: err.slice(0, 200), rateLimited: /429|not a bot/i.test(err) };
  }
  const info = infoFile ? JSON.parse(fs.readFileSync(path.join(tmp, infoFile), "utf8")) : {};
  const lines = parseVtt(fs.readFileSync(path.join(tmp, vtt), "utf8"));
  return {
    video: {
      id,
      title: info.title ?? id,
      url: `https://youtu.be/${id}`,
      channel: info.channel ?? null,
      uploadDate: info.upload_date ?? null,
      durationSec: info.duration ?? null,
      description: (info.description ?? "").slice(0, 2000),
      lines,
    },
  };
}

if (fromFile) {
  // Offline path: no YouTube access needed.
  const raw = fs.readFileSync(fromFile, "utf8");
  const lines = /^WEBVTT|-->/m.test(raw) ? parseVtt(raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")) : parseTranscriptText(raw);
  const id = idOf(fileId ?? "") ?? path.basename(fromFile).replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_");
  fs.mkdirSync(OUT, { recursive: true });
  const dest = path.join(OUT, `${id}.json`);
  const video = { id, title: fileTitle ?? id, url: idOf(fileId ?? "") ? `https://youtu.be/${id}` : null, channel: null, uploadDate: null, durationSec: null, description: "", lines };
  fs.writeFileSync(dest, JSON.stringify(video, null, 1));
  console.log(`Saved ${lines.length} lines to ${path.relative(process.cwd(), dest)}`);
  process.exit(0);
}

const base = ytdlpBase();
let ids = args.map(idOf).filter(Boolean);
if (channel) ids = listChannel(base);
if (!ids.length) {
  ids = fs
    .readFileSync(LIST, "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .map(idOf)
    .filter(Boolean);
}
ids = [...new Set(ids)].slice(0, limit);

fs.mkdirSync(OUT, { recursive: true });
let ok = 0;
let skipped = 0;
let failed = 0;
let backoff = 60_000;
for (const [i, id] of ids.entries()) {
  const dest = path.join(OUT, `${id}.json`);
  if (!force && fs.existsSync(dest)) {
    skipped++;
    continue;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));
  let result = fetchOne(base, id, tmp);
  if (result.rateLimited) {
    console.log(`  rate-limited by YouTube; waiting ${backoff / 1000}s and retrying once...`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 600_000);
    result = fetchOne(base, id, tmp);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (result.video) {
    fs.writeFileSync(dest, JSON.stringify(result.video, null, 1));
    ok++;
    console.log(`[${i + 1}/${ids.length}] saved ${id}  ${result.video.title}  (${result.video.lines.length} lines)`);
  } else {
    failed++;
    console.log(`[${i + 1}/${ids.length}] FAILED ${id}: ${result.error}`);
    if (result.rateLimited && !browser && !cookies) {
      console.log('  Tip: YouTube is blocking this IP. Re-run on a home connection, or add --cookies-from-browser chrome');
    }
  }
  if (i < ids.length - 1) await sleep(delay);
}
console.log(`\nDone: ${ok} saved, ${skipped} already had, ${failed} failed. Transcripts are in knowledge/transcripts/.`);
console.log("Restart the chatbot to load them. Commit the JSON files so they ship with the bot.");
