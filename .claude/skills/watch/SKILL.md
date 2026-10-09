---
name: watch
description: Watch (ingest) YouTube videos - especially Flip With Rick wholesaling videos - into the Wholesale Coach chatbot's knowledge base. Use when the user says "watch this video", pastes YouTube links to learn from, or wants the bot to know what Rick or Zach Ginn said in a video.
---

# Watch a video into the knowledge base

Goal: get the video's transcript into `knowledge/transcripts/<id>.json` (searchable by the bot with timestamped links), then distill the useful lessons into the right `knowledge/*.md` file.

## 1. Get the transcript

Try, in order:

1. **yt-dlp** (needs `yt-dlp` on PATH; install with `pip install -U yt-dlp`):
   ```bash
   npm run ingest -- <url-or-id> [<url-or-id> ...]
   npm run ingest -- --channel @FlipWithRick --match "zillow|fsbo" --limit 20
   ```
   Already-ingested videos are skipped (`--force` to redo).
2. If it fails with **"Sign in to confirm you're not a bot"** or **HTTP 429**, YouTube is blocking this machine's IP (it blocks almost all cloud servers, including Claude Code cloud sessions). Don't loop on retries. Tell the user plainly and offer:
   - run `npm run ingest` on their own computer and push the JSON files, or
   - add `--cookies-from-browser chrome` (local machine only), or
   - **paste route** (works anywhere): on YouTube, click "...more" -> **Show transcript**, select all of it, paste into a text file, then
     ```bash
     npm run ingest -- --from-file transcript.txt --id <url-or-id> --title "<exact video title>"
     ```
     `.vtt` / `.srt` caption files work with `--from-file` too.

Never invent transcript content. If nothing could be fetched, say so.

## 2. Distill the lessons

Read the transcript JSON (`lines[].text`, `lines[].t` in seconds). Then update the matching knowledge file:

| Topic | File |
|---|---|
| Who Rick/Zach are, programs | `knowledge/00-about-flip-with-rick.md` |
| Process, lingo, beginner path | `knowledge/01-wholesaling-process.md` |
| ARV, comps, repairs, MAO, fees | `knowledge/02-deal-math-arv-repairs-mao.md` |
| Zillow FSBO method | `knowledge/03-zillow-fsbo-method.md` |
| Agents / MLS / lowball offers | `knowledge/04-zillow-agents-mls-offers.md` |
| Scripts, objections, negotiation | `knowledge/05-scripts-and-negotiation.md` |
| Contracts, title, closing | `knowledge/06-contracts-title-closing.md` |
| Cash buyers, dispo | `knowledge/07-cash-buyers-dispositions.md` |
| Lists, markets, tools, schedule | `knowledge/08-lead-sources-markets-tools.md` |
| Laws, TCPA, compliance | `knowledge/09-legal-compliance.md` |

Rules:
- Tag what you add as `[FWR video: "<title>" https://youtu.be/<id>?t=<seconds>]` so the bot can cite it. Keep the existing `[FWR site]` / `[General]` tags intact.
- Write tight bullet points in your own words: the specific numbers, scripts, steps, and opinions. Don't paste raw transcript; the search tool already covers that.
- Auto-captions garble numbers and names ("arv" -> "RV", "fsbo" -> "fizbo"). Fix obvious ones; flag anything unsure instead of guessing.
- When a video changes or contradicts what a file says (e.g. a new MAO percentage), update the file and note which video says what. Don't silently overwrite.
- If the deal math changed, update `src/deal-math.js` and its tests (`npm test`) too.

## 3. Finish

Run `npm test`, then summarize for the user: which videos were ingested (or which failed and why), and the main new lessons added. Commit only if the user asked you to.
