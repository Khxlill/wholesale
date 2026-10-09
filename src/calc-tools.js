// The deal-math tools Claude can call. Browser-safe (no Node APIs): the server uses these
// for the Claude API, and the published artifact build reuses them as page tools.
import { analyzeDeal, arvFromComps, estimateRepairs } from "./deal-math.js";

/** @type {import("@anthropic-ai/sdk").default.Beta.BetaTool[]} */
export const CALC_TOOLS = [
  {
    name: "deal_calculator",
    description:
      "Calculate the Maximum Allowable Offer (MAO) and opening offer (LAO) for a wholesale deal. " +
      "Returns the investor method (ARV - repairs - investor profit % of ARV - assignment fee), the 27-30% / $5k-$10k range, " +
      "Flip With Rick's sliding-scale MAO (calculator and posted versions), and the classic 70% rule. " +
      "Call this whenever the user gives (or you have estimated) an ARV and repair cost and wants an offer number.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        arv: { type: "number", description: "After repair value in dollars" },
        repairs: { type: "number", description: "Estimated repair cost in dollars" },
        investor_profit_pct: { type: "number", description: "Investor profit as a percent of ARV, e.g. 27 or 30. Default 27." },
        assignment_fee: { type: "number", description: "Wholesaler's assignment fee in dollars. Default 10000." },
        asking_price: { type: "number", description: "Seller's asking price, if known, to compare against MAO" },
      },
      required: ["arv", "repairs"],
      additionalProperties: false,
    },
  },
  {
    name: "arv_from_comps",
    description:
      "Estimate after repair value (ARV) from sold comparable sales using price per square foot. " +
      "Flags comps that are too far away, too old, too different in size, or not renovated.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        subject_sqft: { type: "number", description: "Living area of the subject property in square feet" },
        comps: {
          type: "array",
          description: "Sold comps",
          items: {
            type: "object",
            properties: {
              address: { type: "string" },
              price: { type: "number", description: "Sold price in dollars" },
              sqft: { type: "number" },
              distance_miles: { type: "number" },
              months_ago: { type: "number", description: "How many months ago it sold" },
              renovated: { type: "boolean", description: "Was the comp renovated/updated when it sold" },
            },
            required: ["price", "sqft"],
            additionalProperties: false,
          },
        },
      },
      required: ["subject_sqft", "comps"],
      additionalProperties: false,
    },
  },
  {
    name: "estimate_repairs",
    description:
      "Ballpark repair estimate from a condition checklist (roof, kitchen, vinyl plank flooring, bathrooms, bedrooms, foundation, HVAC, paint). " +
      "Uses rough national averages plus 10% contingency - tell the user to confirm with local contractor bids.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        sqft: { type: "number" },
        roof: { type: "boolean", description: "Needs a new roof" },
        kitchen: { type: "boolean", description: "Kitchen needs updating" },
        flooring: { type: "boolean", description: "Needs new vinyl plank flooring throughout" },
        bathrooms: { type: "number", description: "Number of bathrooms needing full renovation" },
        bedrooms: { type: "number", description: "Number of bedrooms needing a refresh" },
        foundation: { type: "boolean", description: "Has foundation issues" },
        hvac: { type: "boolean", description: "Needs HVAC replacement" },
        paint: { type: "boolean", description: "Needs full interior paint" },
      },
      required: ["sqft"],
      additionalProperties: false,
    },
  },
];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isOptNum = (v) => v === undefined || v === null || isNum(v);
const isOptBool = (v) => v === undefined || v === null || typeof v === "boolean";

/** Returns a problem description, or null when the input is usable. */
export function validateCalcInput(name, input) {
  const tool = CALC_TOOLS.find((t) => t.name === name);
  if (!tool) return `unknown tool ${name}`;
  if (!input || typeof input !== "object" || Array.isArray(input)) return "input must be an object";
  const allowed = new Set(Object.keys(tool.input_schema.properties));
  const extra = Object.keys(input).filter((k) => !allowed.has(k));
  if (extra.length) return `unexpected field(s): ${extra.join(", ")}`;
  switch (name) {
    case "deal_calculator":
      if (!isNum(input.arv) || !isNum(input.repairs)) return "arv and repairs are required numbers";
      if (![input.investor_profit_pct, input.assignment_fee, input.asking_price].every(isOptNum)) return "optional fields must be numbers";
      return null;
    case "arv_from_comps":
      if (!isNum(input.subject_sqft)) return "subject_sqft is a required number";
      if (!Array.isArray(input.comps) || input.comps.length === 0) return "comps must be a non-empty array";
      for (const c of input.comps) {
        if (!c || !isNum(c.price) || !isNum(c.sqft)) return "each comp needs numeric price and sqft";
        if (!isOptNum(c.distance_miles) || !isOptNum(c.months_ago) || !isOptBool(c.renovated)) return "comp fields have the wrong type";
      }
      return null;
    default: // estimate_repairs
      if (!isNum(input.sqft)) return "sqft is a required number";
      if (![input.bathrooms, input.bedrooms].every(isOptNum)) return "bathrooms/bedrooms must be numbers";
      if (![input.roof, input.kitchen, input.flooring, input.foundation, input.hvac, input.paint].every(isOptBool)) return "checklist fields must be booleans";
      return null;
  }
}

/** Runs a validated calculator tool and returns its plain-data result (throws on bad numbers). */
export function runCalcTool(name, input) {
  if (name === "deal_calculator") {
    return analyzeDeal({
      arv: input.arv,
      repairs: input.repairs,
      investorProfitPct: input.investor_profit_pct ?? undefined,
      assignmentFee: input.assignment_fee ?? undefined,
      askingPrice: input.asking_price ?? undefined,
    });
  }
  if (name === "arv_from_comps") {
    return arvFromComps({
      subjectSqft: input.subject_sqft,
      comps: input.comps.map((c) => ({
        address: c.address,
        price: c.price,
        sqft: c.sqft,
        distanceMiles: c.distance_miles,
        monthsAgo: c.months_ago,
        renovated: c.renovated,
      })),
    });
  }
  return estimateRepairs(input);
}
