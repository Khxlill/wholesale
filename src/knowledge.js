// Loads knowledge/*.md into one string for the system prompt.
// Files are read in name order so the prompt is byte-identical between requests (keeps the prompt cache warm).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const KNOWLEDGE_DIR = path.resolve(here, "..", "knowledge");

export function loadKnowledge(dir = KNOWLEDGE_DIR) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return files
    .map((f) => `<document name="${f}">\n${fs.readFileSync(path.join(dir, f), "utf8").trim()}\n</document>`)
    .join("\n\n");
}
