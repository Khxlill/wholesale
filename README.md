# Wholesale Coach

A chatbot you can ask anything about **wholesale real estate**: finding deals on **Zillow** (FSBO sellers and agent listings), talking to sellers, **comping ARV**, estimating **repairs**, and working out your **maximum allowable offer (MAO)**. Its knowledge comes from **Flip With Rick**'s free training (Rick Ginn and his son Zach Ginn, [@FlipWithRick](https://www.youtube.com/@FlipWithRick)), and it uses Claude to answer.

It comes with a built-in **deal calculator** (web page + chatbot tool), so every dollar figure is computed, not guessed:

```
MAO = ARV − repair cost − investor profit (27–30% of ARV) − assignment fee ($5k–$10k)
Opening offer (LAO) ≈ 70% of MAO
```

It also shows Flip With Rick's own sliding-scale MAO and the classic 70% rule side by side.

## Quick start

You need [Node.js 20+](https://nodejs.org) and a Claude API key from [console.anthropic.com](https://console.anthropic.com/).

```bash
git clone https://github.com/Khxlill/wholesale.git
cd wholesale
npm install
cp .env.example .env        # then paste your key into .env
npm start                   # open http://localhost:3000
```

Prefer the terminal? `npm run chat`.

## What's inside

| Path | What it does |
|---|---|
| `knowledge/*.md` | The knowledge base the bot reads on every question: Flip With Rick's process, Zillow FSBO and agent/MLS methods, deal math, scripts and objections, contracts/title, cash buyers, lead sources, laws, and a topic index of ~470 of their videos. Edit these files to change what the bot knows. |
| `knowledge/transcripts/` | Optional video transcripts (see below). The bot searches them and cites timestamped links. |
| `src/deal-math.js` | ARV-from-comps, repair estimate, and MAO math. Shared by the chatbot tools and the browser calculator. |
| `src/tools.js` | Tools Claude can call: `deal_calculator`, `arv_from_comps`, `estimate_repairs`, `search_video_transcripts`. |
| `src/chat.js` | The Claude call: streaming, tool loop, prompt caching, refusal fallback. |
| `src/server.js` | Small web server + streaming chat API. `public/` is the web UI. |
| `scripts/ingest-youtube.js` | Downloads Flip With Rick video captions into `knowledge/transcripts/`. |
| `.claude/skills/watch/` | A Claude Code skill: say "watch <YouTube link>" and Claude adds that video to the knowledge base. |

## Teach it from the actual videos (transcripts)

The knowledge base was built from Flip With Rick's website and course pages. YouTube blocks cloud servers from downloading captions, so the video transcripts need to be pulled **from your own computer**, once:

```bash
pip install -U yt-dlp            # or: brew install yt-dlp
npm run ingest                   # ~70 key videos listed in scripts/flip-with-rick-videos.txt
npm run ingest -- https://youtu.be/VIDEO_ID           # any specific video
npm run ingest -- --channel @FlipWithRick --match "zillow|fsbo|lowball" --limit 40
```

Then commit `knowledge/transcripts/` and restart. The bot automatically gains a `search_video_transcripts` tool and will quote and link the exact moment in each video. If YouTube still says "confirm you're not a bot", add `--cookies-from-browser chrome`.

## Settings (`.env`)

- `ANTHROPIC_API_KEY`: required.
- `CHAT_MODEL`: defaults to `claude-opus-5-5`.
- `CHAT_EFFORT`: `low`, `medium` (default), or `high`. Higher is more thorough but slower and costs more.
- `ACCESS_CODE`: set this before putting the bot on the internet, so strangers can't spend your API credits.
- `PORT`: defaults to 3000.

**Cost:** the knowledge base is about 25k tokens and is prompt-cached, so after the first question each answer typically costs a few cents.

## Deploy

Any Node host works (Render, Railway, Fly.io, a VPS). Use start command `npm start`, set `ANTHROPIC_API_KEY` and `ACCESS_CODE` as environment variables, and the host's `PORT` is picked up automatically.

## Tests

```bash
npm test
```

## Notes

- Flip With Rick is taught by **Rick Ginn** and his son **Zach Ginn**.
- The knowledge files tag each point as `[FWR site]` (from Flip With Rick's own pages), `[FWR video]` (a topic they have a video on), or `[General]` (standard industry practice), so the bot doesn't put words in their mouths.
- Educational only, not legal or financial advice. Wholesaling laws vary by state and keep changing; check with a local real estate attorney or title company.
