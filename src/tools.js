// Tools the chatbot can call so every dollar figure it quotes is computed, not guessed.
import { CALC_TOOLS, runCalcTool, validateCalcInput } from "./calc-tools.js";
import { searchTranscripts, transcriptCount } from "./transcripts.js";

const SEARCH_TOOL = {
  name: "search_video_transcripts",
  description:
    "Keyword search over transcripts of Flip With Rick YouTube videos (Rick and Zach Ginn). " +
    "Returns the best-matching passages with the video title and a timestamped link. " +
    "Use it to find what they actually said about a topic before answering, and cite the link.",
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords, e.g. 'zillow fsbo script price objection'" },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

let tools;
/** The tool list is fixed for the life of the process so the prompt cache stays valid. */
export function getTools() {
  tools ??= transcriptCount() > 0 ? [...CALC_TOOLS, SEARCH_TOOL] : CALC_TOOLS;
  return tools;
}

/** Runs one tool call. Inputs stream eagerly, so the API doesn't validate them: we do. Returns { content, isError }. */
export function runTool(name, input) {
  if (!getTools().some((t) => t.name === name)) return { content: `Unknown tool ${name}`, isError: true };
  try {
    if (name === SEARCH_TOOL.name) {
      if (typeof input?.query !== "string" || !input.query.trim()) return { content: "Invalid input: query must be a non-empty string", isError: true };
      const hits = searchTranscripts(input.query);
      return { content: JSON.stringify(hits.length ? hits : { results: [], note: "No matching passages. Answer from the knowledge base instead." }), isError: false };
    }
    const problem = validateCalcInput(name, input);
    if (problem) return { content: `Invalid input for ${name}: ${problem}`, isError: true };
    return { content: JSON.stringify(runCalcTool(name, input)), isError: false };
  } catch (err) {
    return { content: `${name} failed: ${err.message}`, isError: true };
  }
}
