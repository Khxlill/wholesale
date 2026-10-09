#!/usr/bin/env node
// Builds dist/wholesale-coach.html: the whole app in one self-contained page for publishing as a
// claude.ai Artifact. There it needs no API key or server - chat runs on the viewer's own Claude
// account (the `sample` capability) and the deal calculator runs in the page.
//
//   npm run build:artifact
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledge } from "../src/knowledge.js";
import { INSTRUCTIONS } from "../src/prompt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// One module scope: drop imports, and the `export` keyword from declarations.
const inlineModule = (src) => src.replace(/^import .*;\n/gm, "").replace(/^export (const|function|async function|let) /gm, "$1 ");
// Keep embedded text from closing the <script> element early.
const scriptSafe = (s) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

const html = read("public/index.html");
const body = html.slice(html.indexOf("<header"), html.indexOf("</main>") + "</main>".length)
  .replace("Educational only, not legal or financial advice. Wholesaling rules vary by state.", "Chat runs on your own Claude account. Educational only, not legal or financial advice. Wholesaling rules vary by state.");
const fontLink = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];

const preamble =
  "These are your standing instructions and reference material for this whole chat. The person's messages follow.\n\n" +
  INSTRUCTIONS +
  `\n\n<knowledge_base>\n${loadKnowledge()}\n</knowledge_base>`;
const embed = {
  preamble,
  noToolsNote: "\n\n(The calculator tools aren't available in this view. Show the deal math step by step using the formulas in the knowledge base, and double-check the arithmetic.)",
};

const page = `<title>Wholesale Coach</title>
<meta name="description" content="Ask questions about wholesale real estate - Zillow FSBOs, comps, ARV, repairs, MAO - based on Flip With Rick's free training.">
${fontLink}
<style>
${read("public/styles.css")}
/* artifact: the skeleton pads :root by the safe-area insets, so size the app to the padded box */
html, body { height: 100%; }
</style>
${body}
<script>window.WC_EMBED = ${scriptSafe(JSON.stringify(embed))};</script>
<script type="module">
${scriptSafe(inlineModule(read("src/deal-math.js")))}
${scriptSafe(inlineModule(read("src/calc-tools.js")))}
${scriptSafe(inlineModule(read("public/app.js")))}
</script>
`;

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "wholesale-coach.html");
fs.writeFileSync(out, page);
console.log(`Wrote ${path.relative(root, out)} (${Math.round(page.length / 1024)} KB, prompt ${Math.round(Buffer.byteLength(preamble) / 1024)} KB)`);
