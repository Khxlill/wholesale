import { analyzeDeal, arvFromComps, estimateRepairs, money } from "/deal-math.js";
import { CALC_TOOLS, runCalcTool, validateCalcInput } from "/calc-tools.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
};

// ---------- tiny, safe markdown renderer (escape first, then format) ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
function renderMarkdown(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  let html = "";
  let list = null; // "ul" | "ol"
  let para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flushPara(); closeList();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      flushPara(); closeList();
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      html += `<table><thead><tr>${cells(line).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
      i++;
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) html += `<tr>${cells(lines[++i]).map((c) => `<td>${c}</td>`).join("")}</tr>`;
      html += "</tbody></table>";
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const bq = line.match(/^>\s?(.*)$/);
    if (h) { flushPara(); closeList(); html += `<h${h[1].length < 3 ? 3 : 4}>${inline(h[2])}</h${h[1].length < 3 ? 3 : 4}>`; }
    else if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { closeList(); html += `<${kind}>`; list = kind; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else if (bq) { flushPara(); closeList(); html += `<blockquote>${inline(bq[1])}</blockquote>`; }
    else if (!line.trim()) { flushPara(); closeList(); }
    else if (/^---+$/.test(line.trim())) { flushPara(); closeList(); html += "<hr>"; }
    else { closeList(); para.push(line); }
  }
  flushPara(); closeList();
  return html;
}

// ---------- chat ----------
const log = $("log");
const input = $("input");
const sendBtn = $("send");
const history = [];
let busy = false;

function addMessage(role, html) {
  $("welcome")?.remove();
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") bubble.textContent = html;
  else bubble.innerHTML = html;
  wrap.append(bubble);
  log.append(wrap);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

// ---------- transports ----------
// Normally the page talks to the Node server (/api/chat). The published artifact build sets
// window.WC_EMBED and talks to Claude through the viewer's own account (claude.use("sample")).
const EMBED = window.WC_EMBED;
let samplePromise;
const getSample = () => (samplePromise ??= window.claude?.use ? window.claude.use("sample") : Promise.resolve(null));
const cancelled = () => Object.assign(new Error("Stopped."), { cancelled: true });

async function accessCodeHeader() {
  try {
    const health = await (await fetch("/api/health")).json();
    if (!health.accessCodeRequired) return {};
  } catch { return {}; }
  let code = store.get("wc-access-code");
  if (!code) {
    code = prompt("This coach is private. Enter the access code:") || "";
    store.set("wc-access-code", code);
  }
  return { "x-access-code": code };
}

async function serverReply(turns, { onEvent, signal }) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await accessCodeHeader()) },
      body: JSON.stringify({ messages: turns }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) store.set("wc-access-code", "");
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!chunk.startsWith("data: ")) continue;
        const e = JSON.parse(chunk.slice(6));
        if (e.type === "error") throw new Error(e.message);
        onEvent(e);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") throw cancelled();
    throw err;
  }
}

const SAMPLE_COPY = {
  not_granted: "Chat needs your permission to use Claude. Reload the page and choose Allow to try again.",
  sampling_disabled: "Claude isn't available on this account, so chat is off. The deal calculator still works.",
  rate_limited: "You've hit a usage limit. Wait a bit, then send again.",
  session_expired: "Your Claude session expired. Sign in again, then reload this page.",
  refused: "Claude declined that one. Try rephrasing the question.",
  prompt_too_large: "This conversation got too long. Reload the page to start a new one.",
};

async function sampleReply(turns, { onEvent, signal }) {
  const sample = await getSample();
  if (!sample) throw new Error("Chat works when this page is opened in Claude. The deal calculator works anywhere.");
  const limits = await sample.limits().catch(() => null);
  const useTools = Boolean(limits?.tools);
  // Keep the instructions turn; drop the oldest exchanges if the conversation outgrows the input cap.
  let recent = turns.slice();
  const room = (limits?.maxPromptBytes ?? 262144) - new TextEncoder().encode(EMBED.preamble).length - 8000;
  while (recent.length > 1 && new TextEncoder().encode(JSON.stringify(recent)).length > room) recent = recent.slice(2);
  const tools = useTools
    ? CALC_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
        execute(inputArgs) {
          onEvent({ type: "tool_start", name: t.name });
          try {
            const problem = validateCalcInput(t.name, inputArgs);
            if (problem) throw new Error(problem);
            return runCalcTool(t.name, inputArgs);
          } finally {
            onEvent({ type: "tool_result", name: t.name });
          }
        },
      }))
    : undefined;
  try {
    const { truncated } = await sample([{ role: "user", content: EMBED.preamble + (useTools ? "" : EMBED.noToolsNote) }, ...recent], {
      signal,
      ...(useTools ? { tools } : { cache: false }),
      onText: ({ text }) => onEvent({ type: "set_text", text }),
    });
    if (truncated) onEvent({ type: "notice", message: "Reply was cut off at the length limit." });
  } catch (e) {
    if (e?.code === "refused") onEvent({ type: "set_text", text: "" });
    else if (e?.text) onEvent({ type: "set_text", text: e.text });
    if (e?.code === "cancelled") throw cancelled();
    throw new Error(SAMPLE_COPY[e?.code] ?? "Claude couldn't answer just now. Try again in a moment.");
  }
}

// ---------- chat turn ----------
let controller = null;
function setBusy(on) {
  busy = on;
  sendBtn.textContent = on ? "Stop" : "Send";
  sendBtn.setAttribute("aria-label", on ? "Stop the reply" : "Send");
  sendBtn.classList.toggle("stop", on);
}

async function ask(question) {
  if (busy || !question.trim()) return;
  controller = new AbortController();
  setBusy(true);
  history.push({ role: "user", content: question });
  addMessage("user", question);
  const bubble = addMessage("bot", '<span class="status">Thinking...</span>');
  let text = "";
  let errorMsg = "";
  const toolChips = [];
  let frame = 0;
  const paint = () => {
    const tools = toolChips.map((c) => `<span class="tool${c.done ? " done" : ""}">${c.done ? "Used" : "Running"} ${esc(c.name.replace(/_/g, " "))}${c.done ? "" : "..."}</span> `).join("");
    bubble.innerHTML = tools + (text ? renderMarkdown(text) : busy ? '<span class="status">Thinking...</span>' : "") + (errorMsg ? `<p class="error">${esc(errorMsg)}</p>` : "");
    log.scrollTop = log.scrollHeight;
  };
  const onEvent = (e) => {
    if (e.type === "text") text += e.text;
    else if (e.type === "set_text") text = e.text;
    else if (e.type === "tool_start") toolChips.push({ name: e.name, done: false });
    else if (e.type === "tool_result") { const c = toolChips.findLast((x) => x.name === e.name && !x.done); if (c) c.done = true; }
    else if (e.type === "notice") text += `\n\n_${e.message}_`;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paint(); });
  };

  let failed = false;
  try {
    await (EMBED ? sampleReply : serverReply)(history.slice(), { onEvent, signal: controller.signal });
  } catch (err) {
    failed = true;
    if (!err.cancelled) errorMsg = err.message;
  }
  setBusy(false);
  if (frame) cancelAnimationFrame(frame);
  paint();
  // A failed or stopped turn is dropped from what Claude sees next time.
  if (failed || !text.trim()) history.pop();
  else history.push({ role: "assistant", content: text });
  input.focus();
}

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (busy) { controller?.abort(); return; }
  const q = input.value;
  input.value = "";
  input.style.height = "";
  ask(q);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); }
});
input.addEventListener("input", () => { input.style.height = ""; input.style.height = `${input.scrollHeight}px`; });
$("chips").addEventListener("click", (e) => { if (e.target.tagName === "BUTTON") ask(e.target.textContent); });

// ---------- tabs (mobile) ----------
function showView(view) {
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === view)));
  $("view-chat").classList.toggle("active", view === "chat");
  $("view-calc").classList.toggle("active", view === "calc");
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

// ---------- calculator ----------
const parse = (v) => {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
};
const fmtInput = (el) => {
  const n = parse(el.value);
  if (n !== null) el.value = n.toLocaleString("en-US");
};

function updateDeal() {
  const arv = parse($("arv").value);
  const repairs = parse($("repairs").value);
  const pct = Number($("profit").value);
  const fee = Number($("fee").value);
  const ask = parse($("ask").value);
  $("profitOut").textContent = `${pct}%`;
  $("feeOut").textContent = money(fee);
  if (!arv || repairs === null) { $("results").hidden = true; return; }
  const d = analyzeDeal({ arv, repairs, investorProfitPct: pct, assignmentFee: fee, askingPrice: ask ?? undefined });
  $("results").hidden = false;
  $("maoBig").textContent = money(d.investor.mao);
  $("maoFormula").textContent = `${money(arv)} ARV - ${money(repairs)} repairs - ${money(d.investor.investorProfit)} investor profit (${pct}%) - ${money(fee)} fee`;
  $("lao").textContent = money(d.investor.lao);
  $("range").textContent = `${money(d.investorRange.maoLow)} - ${money(d.investorRange.maoHigh)}`;
  $("buyer").textContent = money(d.investor.buyerMaxPrice);
  $("rick").textContent = money(d.rickCalculator.mao);
  $("rickTier").textContent = `(${Math.round(d.rickCalculator.multiplier * 100)}% of ARV - repairs)`;
  $("seventy").textContent = money(d.seventyPercentRule.mao);
  const v = $("verdict");
  if (d.investor.mao <= 0) {
    v.hidden = false; v.className = "verdict bad";
    v.textContent = "No deal at these numbers: repairs plus investor profit eat the whole ARV.";
  } else if (ask !== null) {
    v.hidden = false;
    v.className = `verdict ${d.askIsUnderMao ? "good" : "bad"}`;
    v.textContent = d.askIsUnderMao
      ? `Asking price is ${money(-d.askVsMao)} under your MAO. Room for your full fee.`
      : `Asking price is ${money(d.askVsMao)} over your MAO. Negotiate down or shrink your fee.`;
  } else v.hidden = true;
  store.set("wc-deal", JSON.stringify({ arv: $("arv").value, repairs: $("repairs").value, pct, fee, ask: $("ask").value }));
}
["arv", "repairs", "ask"].forEach((id) => {
  $(id).addEventListener("input", updateDeal);
  $(id).addEventListener("blur", () => fmtInput($(id)));
});
["profit", "fee"].forEach((id) => $(id).addEventListener("input", updateDeal));

$("askCoach").addEventListener("click", () => {
  const asking = $("ask").value ? `, seller is asking $${$("ask").value}` : "";
  showView("chat");
  ask(`Analyze this deal: ARV $${$("arv").value}, repairs $${$("repairs").value}, investor profit ${$("profit").value}%, my assignment fee $${Number($("fee").value).toLocaleString("en-US")}${asking}. What should I offer, and how should I negotiate?`);
});

// comps
function addCompRow(c = {}) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input class="cPrice" inputmode="numeric" placeholder="310,000" value="${esc(c.price ?? "")}"></td>
    <td><input class="cSqft" inputmode="numeric" placeholder="1,450" value="${esc(c.sqft ?? "")}"></td>
    <td><input class="cMiles" inputmode="decimal" placeholder="0.3" value="${esc(c.miles ?? "")}"></td>
    <td><input class="cMonths" inputmode="numeric" placeholder="2" value="${esc(c.months ?? "")}"></td>
    <td><button class="del" type="button" aria-label="Remove comp">&times;</button></td>`;
  tr.querySelector(".del").addEventListener("click", () => { tr.remove(); updateComps(); });
  tr.querySelectorAll("input").forEach((i) => i.addEventListener("input", updateComps));
  $("compRows").append(tr);
}
let lastArv = null;
function updateComps() {
  const subjectSqft = parse($("subjectSqft").value);
  const comps = [...$("compRows").rows]
    .map((r) => ({
      price: parse(r.querySelector(".cPrice").value),
      sqft: parse(r.querySelector(".cSqft").value),
      distanceMiles: parse(r.querySelector(".cMiles").value) ?? undefined,
      monthsAgo: parse(r.querySelector(".cMonths").value) ?? undefined,
    }))
    .filter((c) => c.price && c.sqft);
  lastArv = null;
  $("useArv").disabled = true;
  if (!subjectSqft || !comps.length) { $("arvOut").textContent = ""; return; }
  const r = arvFromComps({ subjectSqft, comps });
  lastArv = r.arvMedian;
  $("useArv").disabled = false;
  const flagged = r.comps.filter((c) => c.flags.length).map((c) => `${c.address}: ${c.flags.join(", ")}`);
  $("arvOut").innerHTML = `<strong>ARV ~ ${money(r.arvMedian)}</strong> (median ${money(r.medianPricePerSqft)}/sq ft, range ${money(r.arvLow)}-${money(r.arvHigh)}, ${r.compsUsed} comp${r.compsUsed === 1 ? "" : "s"} used)` +
    (flagged.length ? `<br><span class="hint">Set aside: ${esc(flagged.join("; "))}</span>` : "");
}
$("addComp").addEventListener("click", () => addCompRow());
$("subjectSqft").addEventListener("input", () => { updateComps(); if (!$("rSqft").value) $("rSqft").value = $("subjectSqft").value; });
$("useArv").addEventListener("click", () => { if (lastArv) { $("arv").value = lastArv.toLocaleString("en-US"); updateDeal(); } });
for (let i = 0; i < 3; i++) addCompRow();

// repairs
let lastRepairs = null;
function updateRepairs() {
  const sqft = parse($("rSqft").value);
  lastRepairs = null;
  $("useRepairs").disabled = true;
  if (!sqft) { $("repairOut").textContent = ""; return; }
  const r = estimateRepairs({
    sqft,
    roof: $("rRoof").checked,
    kitchen: $("rKitchen").checked,
    flooring: $("rFloor").checked,
    foundation: $("rFoundation").checked,
    hvac: $("rHvac").checked,
    paint: $("rPaint").checked,
    bathrooms: Number($("rBaths").value) || 0,
    bedrooms: Number($("rBeds").value) || 0,
  });
  if (!r.items.length) { $("repairOut").textContent = "Tick what the house needs."; return; }
  lastRepairs = r.total;
  $("useRepairs").disabled = false;
  $("repairOut").innerHTML = `<strong>~ ${money(r.total)}</strong> (${money(r.perSqft)}/sq ft incl. 10% contingency)<br><span class="hint">${r.items.map((i) => `${esc(i.item)} ${money(i.cost)}`).join(" · ")}</span>`;
}
document.querySelectorAll("#view-calc details:last-of-type input").forEach((i) => i.addEventListener("input", updateRepairs));
$("useRepairs").addEventListener("click", () => { if (lastRepairs) { $("repairs").value = lastRepairs.toLocaleString("en-US"); updateDeal(); } });

// restore last deal
try {
  const saved = JSON.parse(store.get("wc-deal") || "null");
  if (saved) {
    $("arv").value = saved.arv || "";
    $("repairs").value = saved.repairs || "";
    $("profit").value = saved.pct ?? 27;
    $("fee").value = saved.fee ?? 10000;
    $("ask").value = saved.ask || "";
  }
} catch { /* ignore bad saved state */ }
updateDeal();
