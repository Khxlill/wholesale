import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeDeal,
  arvFromComps,
  estimateRepairs,
  investorMethod,
  investorRange,
  rickSlidingScale,
  seventyPercentRule,
  toFraction,
} from "../src/deal-math.js";

test("investor method: ARV - repairs - 27% profit - $10k fee", () => {
  const r = investorMethod({ arv: 200000, repairs: 40000, investorProfitPct: 0.27, assignmentFee: 10000 });
  assert.equal(r.investorProfit, 54000);
  assert.equal(r.buyerMaxPrice, 106000);
  assert.equal(r.mao, 96000);
  assert.equal(r.lao, 67200);
  assert.equal(r.viable, true);
});

test("investor method accepts 30, '30%', and 0.3 the same way", () => {
  const a = investorMethod({ arv: 300000, repairs: 50000, investorProfitPct: 30, assignmentFee: 5000 });
  const b = investorMethod({ arv: "$300,000", repairs: "50,000", investorProfitPct: "30%", assignmentFee: 5000 });
  const c = investorMethod({ arv: 300000, repairs: 50000, investorProfitPct: 0.3, assignmentFee: 5000 });
  assert.equal(a.mao, 155000);
  assert.equal(b.mao, a.mao);
  assert.equal(c.mao, a.mao);
});

test("investor range spans conservative (30%, $10k) to aggressive (27%, $5k)", () => {
  const r = investorRange({ arv: 200000, repairs: 40000 });
  assert.equal(r.maoLow, 200000 - 40000 - 60000 - 10000);
  assert.equal(r.maoHigh, 200000 - 40000 - 54000 - 5000);
});

test("Rick sliding scale tiers (calculator version)", () => {
  assert.equal(rickSlidingScale({ arv: 100000, repairs: 20000 }).mao, 56000); // 80k x 0.70
  assert.equal(rickSlidingScale({ arv: 125000, repairs: 25000 }).multiplier, 0.8);
  assert.equal(rickSlidingScale({ arv: 200000, repairs: 40000 }).mao, 128000); // 160k x 0.80
  assert.equal(rickSlidingScale({ arv: 250000, repairs: 50000 }).mao, 170000); // 200k x 0.85
  assert.equal(rickSlidingScale({ arv: 400000, repairs: 50000 }).mao, 315000); // 350k x 0.90
  assert.equal(rickSlidingScale({ arv: 200000, repairs: 40000 }).lao, 89600); // MAO x 0.70
});

test("Rick sliding scale (posted page version) uses 83% / 85% top tiers", () => {
  assert.equal(rickSlidingScale({ arv: 250000, repairs: 50000, version: "posted" }).multiplier, 0.83);
  assert.equal(rickSlidingScale({ arv: 400000, repairs: 50000, version: "posted" }).multiplier, 0.85);
});

test("70% rule", () => {
  assert.equal(seventyPercentRule({ arv: 200000, repairs: 40000 }).mao, 100000);
});

test("analyzeDeal compares the asking price to MAO", () => {
  const r = analyzeDeal({ arv: 200000, repairs: 40000, askingPrice: 90000 });
  assert.equal(r.investor.mao, 96000);
  assert.equal(r.askIsUnderMao, true);
  assert.equal(r.askVsMao, -6000);
});

test("negative MAO is reported as not viable", () => {
  const r = investorMethod({ arv: 100000, repairs: 80000 });
  assert.equal(r.viable, false);
});

test("bad inputs throw", () => {
  assert.throws(() => investorMethod({ arv: "abc", repairs: 1 }), TypeError);
  assert.throws(() => investorMethod({ arv: 0, repairs: 1 }), RangeError);
  assert.throws(() => toFraction(100), RangeError);
});

test("ARV from comps uses clean comps and flags bad ones", () => {
  const r = arvFromComps({
    subjectSqft: 1500,
    comps: [
      { address: "A", price: 300000, sqft: 1500, distanceMiles: 0.3, monthsAgo: 2, renovated: true },
      { address: "B", price: 315000, sqft: 1400, distanceMiles: 0.4, monthsAgo: 4, renovated: true },
      { address: "C", price: 250000, sqft: 1600, distanceMiles: 2, monthsAgo: 3 },
    ],
  });
  assert.equal(r.compsUsed, 2);
  assert.equal(r.usedOnlyCleanComps, true);
  assert.deepEqual(r.comps[2].flags, ["over 0.5 mi away"]);
  // median of 200 and 225 $/sqft = 212.5 -> 318,750
  assert.equal(r.arvMedian, 318750);
});

test("repair estimate adds line items plus 10% contingency", () => {
  const r = estimateRepairs({ sqft: 1000, roof: true, kitchen: true, bathrooms: 1 });
  assert.equal(r.subtotal, 6000 + 15000 + 10000);
  assert.equal(r.total, 34100);
});
