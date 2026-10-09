// Tiny zero-dependency web server: serves the chat UI and streams replies over Server-Sent Events.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile?.(); // reads .env when present (Node 20.12+)
} catch {
  // no .env file - fine
}

const { runChat, describeError, MODEL } = await import("./chat.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, "..", "public");
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || "";
const MAX_MESSAGES = 40;
const MAX_CHARS = 20000;

const STATIC = {
  "/": { file: path.join(PUBLIC_DIR, "index.html"), type: "text/html; charset=utf-8" },
  "/app.js": { file: path.join(PUBLIC_DIR, "app.js"), type: "text/javascript; charset=utf-8" },
  "/styles.css": { file: path.join(PUBLIC_DIR, "styles.css"), type: "text/css; charset=utf-8" },
  // The browser calculator imports the exact same math module the chatbot's tools use.
  "/deal-math.js": { file: path.join(here, "deal-math.js"), type: "text/javascript; charset=utf-8" },
  "/calc-tools.js": { file: path.join(here, "calc-tools.js"), type: "text/javascript; charset=utf-8" },
};

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 512 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new RangeError("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Accepts [{role, content}] alternating user/assistant, ending with a user message. */
function cleanHistory(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const history = raw.slice(-MAX_MESSAGES).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: typeof m?.content === "string" ? m.content.slice(0, MAX_CHARS) : "",
  }));
  while (history.length && history[0].role !== "user") history.shift();
  // Merge accidental same-role neighbours and drop empties so the API always sees a clean alternation.
  const merged = [];
  for (const m of history) {
    if (!m.content.trim()) continue;
    const last = merged.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else merged.push(m);
  }
  if (!merged.length || merged.at(-1).role !== "user") return null;
  return merged;
}

async function handleChat(req, res) {
  if (ACCESS_CODE && req.headers["x-access-code"] !== ACCESS_CODE) {
    return sendJson(res, 401, { error: "Access code required." });
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "Send JSON: { messages: [{ role, content }] }" });
  }
  const history = cleanHistory(body?.messages);
  if (!history) return sendJson(res, 400, { error: "messages must end with a non-empty user message." });

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  try {
    await runChat({ history, onEvent: send, signal: abort.signal });
    send({ type: "done" });
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error("[chat]", err);
      send({ type: "error", message: describeError(err) });
    }
  } finally {
    res.end();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/chat") return handleChat(req, res);
  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, model: MODEL, accessCodeRequired: Boolean(ACCESS_CODE) });
  }
  const asset = req.method === "GET" && STATIC[url.pathname];
  if (asset) {
    res.writeHead(200, { "content-type": asset.type, "cache-control": "no-cache" });
    return fs.createReadStream(asset.file).pipe(res);
  }
  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Wholesale Coach running at http://localhost:${PORT}  (model: ${MODEL})`);
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.");
  }
});
