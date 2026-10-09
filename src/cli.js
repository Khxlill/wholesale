// Terminal chat: npm run chat
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

try {
  process.loadEnvFile?.();
} catch {
  // no .env file
}

const { runChat, describeError, MODEL } = await import("./chat.js");

const rl = readline.createInterface({ input, output });
const history = [];

console.log(`Wholesale Coach (${MODEL}). Ask anything about wholesaling - Zillow FSBOs, comps, MAO, contracts.`);
console.log('Type "exit" to quit, "reset" to start over.\n');

while (true) {
  let question;
  try {
    question = (await rl.question("you > ")).trim();
  } catch {
    break; // stdin closed (Ctrl+D)
  }
  if (!question) continue;
  if (question === "exit" || question === "quit") break;
  if (question === "reset") {
    history.length = 0;
    console.log("(conversation cleared)\n");
    continue;
  }

  history.push({ role: "user", content: question });
  output.write("\ncoach > ");
  try {
    const reply = await runChat({
      history,
      onEvent: (e) => {
        if (e.type === "text") output.write(e.text);
        else if (e.type === "tool_start") output.write(`\n  [running ${e.name}...]\n`);
        else if (e.type === "notice") output.write(`\n  (${e.message})\n`);
      },
    });
    history.push({ role: "assistant", content: reply });
  } catch (err) {
    history.pop();
    output.write(`\n  Error: ${describeError(err)}`);
  }
  output.write("\n\n");
}

rl.close();
