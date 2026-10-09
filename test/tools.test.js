import { test } from "node:test";
import assert from "node:assert/strict";
import { getTools, runTool } from "../src/tools.js";
import { buildSystem } from "../src/prompt.js";

test("tool schemas are well-formed", () => {
  for (const t of getTools()) {
    assert.equal(t.input_schema.type, "object");
    assert.equal(t.input_schema.additionalProperties, false);
    assert.ok(t.description.length > 40, `${t.name} needs a real description`);
  }
});

test("deal_calculator returns the investor-method MAO", () => {
  const r = runTool("deal_calculator", { arv: 200000, repairs: 40000, investor_profit_pct: 27, assignment_fee: 10000 });
  assert.equal(r.isError, false);
  assert.equal(JSON.parse(r.content).investor.mao, 96000);
});

test("tool input is validated before running", () => {
  assert.equal(runTool("deal_calculator", { arv: "200k", repairs: 1 }).isError, true);
  assert.equal(runTool("deal_calculator", { arv: 1, repairs: 1, extra: 1 }).isError, true);
  assert.equal(runTool("arv_from_comps", { subject_sqft: 1500, comps: [] }).isError, true);
  assert.equal(runTool("nope", {}).isError, true);
});

test("arv_from_comps and estimate_repairs run", () => {
  const arv = JSON.parse(runTool("arv_from_comps", { subject_sqft: 1000, comps: [{ price: 200000, sqft: 1000 }] }).content);
  assert.equal(arv.arvMedian, 200000);
  const rep = JSON.parse(runTool("estimate_repairs", { sqft: 1000, kitchen: true }).content);
  assert.equal(rep.total, 16500);
});

test("system prompt includes the knowledge base and is cacheable", () => {
  const system = buildSystem();
  const kb = system.at(-1);
  assert.deepEqual(kb.cache_control, { type: "ephemeral" });
  assert.match(kb.text, /02-deal-math-arv-repairs-mao\.md/);
  assert.match(kb.text, /Zach Ginn/);
  assert.equal(buildSystem(), system, "memoized so every request sends identical bytes");
});
