// One chatbot turn: stream Claude's answer, run deal-math tools when it asks, loop until it's done.
import Anthropic from "@anthropic-ai/sdk";
import { buildSystem } from "./prompt.js";
import { getTools, runTool } from "./tools.js";

export const MODEL = process.env.CHAT_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CHAT_EFFORT || "medium";
const MAX_ROUNDS = 8;

let client;
const getClient = () => (client ??= new Anthropic());

// After a mid-output model fallback, only the text the declining model produced may be echoed back.
function echoable(content) {
  const boundary = content.findLastIndex((b) => b.type === "fallback");
  if (boundary === -1) return content;
  return content.filter((b, i) => (i < boundary ? b.type === "text" : i > boundary));
}

/**
 * @param {{ history: {role: "user"|"assistant", content: string}[], onEvent?: (e: object) => void, signal?: AbortSignal }} opts
 *   history must end with the new user message.
 * @returns {Promise<string>} the assistant's full reply text
 */
export async function runChat({ history, onEvent = () => {}, signal }) {
  /** @type {import("@anthropic-ai/sdk").default.Beta.BetaMessageParam[]} */
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  let reply = "";
  let jsonRetries = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: EFFORT },
        system: buildSystem(),
        tools: getTools(),
        messages,
      },
      { signal },
    );

    if (round > 0 && reply && !reply.endsWith("\n")) {
      reply += "\n\n";
      onEvent({ type: "text", text: "\n\n" });
    }
    stream.on("text", (delta) => {
      reply += delta;
      onEvent({ type: "text", text: delta });
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Only an unparseable streamed tool input is retried; API errors (incl. aborts) propagate.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      onEvent({ type: "notice", message: "Retrying a garbled calculator call..." });
      continue;
    }

    if (message.stop_reason === "refusal") {
      const note = "I can't help with that one. Try rephrasing, or ask about a different part of the deal.";
      onEvent({ type: "notice", message: note });
      return reply || note;
    }

    const content = echoable(message.content);
    const toolUses = content.filter((b) => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (message.stop_reason === "max_tokens") onEvent({ type: "notice", message: "Reply was cut off at the length limit." });
      return reply;
    }

    messages.push({ role: "assistant", content });
    const results = toolUses.map((t) => {
      onEvent({ type: "tool_start", name: t.name, input: t.input });
      const { content: output, isError } = runTool(t.name, t.input);
      onEvent({ type: "tool_result", name: t.name, input: t.input, output, isError });
      return { type: "tool_result", tool_use_id: t.id, content: output, ...(isError ? { is_error: true } : {}) };
    });
    messages.push({ role: "user", content: results });
  }

  onEvent({ type: "notice", message: "Stopped after too many calculator rounds." });
  return reply;
}

/** Turns an SDK error into a message that's safe and useful to show a user. */
export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "The server's ANTHROPIC_API_KEY is missing or invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Claude API - wait a moment and try again.";
  if (err instanceof Anthropic.APIUserAbortError) return "Request cancelled.";
  if (err instanceof Anthropic.BadRequestError) return `The Claude API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check the server's internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ""}: ${err.message}`;
  // Client-side SDK errors, e.g. no credentials configured.
  if (err instanceof Anthropic.AnthropicError) return `Claude client error: ${err.message}`;
  return "Something went wrong generating a reply.";
}
