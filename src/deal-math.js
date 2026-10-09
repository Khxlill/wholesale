// Deal math shared by the chatbot's tools (Node) and the browser calculator.
// Pure functions only - no Node or DOM APIs - so public/ can import this file as-is.

/** Default investor-profit band and assignment-fee band used by the "investor method". */
export const DEFAULTS = Object.freeze({
  investorProfitLow: 0.27,
  investorProfitHigh: 0.3,
  assignmentFeeLow: 5000,
  assignmentFeeHigh: 10000,
  laoFactor: 0.7,
});

/**
 * Flip With Rick's sliding-scale MAO tiers, keyed on ARV.
 * "calculator" = the multipliers in the MAO calculator script on home.flipwithrick.com.
 * "posted" = the "2024 FORMULA FOR MAO" text on the ARV training page (83% / 85% top tiers).
 */
export const RICK_TIERS = Object.freeze({
  calculator: [
    { maxArv: 124999.99, multiplier: 0.7, label: "ARV under $125k" },
    { maxArv: 220000, multiplier: 0.8, label: "ARV $125k-$220k" },
    { maxArv: 300000, multiplier: 0.85, label: "ARV $220k-$300k" },
    { maxArv: Infinity, multiplier: 0.9, label: "ARV over $300k" },
  ],
  posted: [
    { maxArv: 124999.99, multiplier: 0.7, label: "ARV under $125k" },
    { maxArv: 220000, multiplier: 0.8, label: "ARV $125k-$220k" },
    { maxArv: 300000, multiplier: 0.83, label: "ARV $220k-$300k" },
    { maxArv: Infinity, multiplier: 0.85, label: "ARV $300k+" },
  ],
});

function num(value, name, { min = 0, allowZero = true } = {}) {
  const n = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`${name} must be a number`);
  if (n < min || (!allowZero && n === 0)) throw new RangeError(`${name} must be ${allowZero ? ">=" : ">"} ${min}`);
  return n;
}

/** Accepts 0.27, 27, or "27%" and returns a fraction (0.27). */
export function toFraction(value, name = "percent") {
  const raw = typeof value === "string" ? value.replace("%", "").trim() : value;
  let n = num(raw, name);
  if (n > 1) n = n / 100;
  if (n >= 1) throw new RangeError(`${name} must be below 100%`);
  return n;
}

const round = (n) => Math.round(n);

/**
 * Investor method: work backwards from what a cash buyer (flipper) needs.
 *   Buyer's max price = ARV - repairs - (ARV x investor profit %)
 *   MAO (your max offer to the seller) = buyer's max price - your assignment fee
 */
export function investorMethod({ arv, repairs, investorProfitPct = DEFAULTS.investorProfitLow, assignmentFee = DEFAULTS.assignmentFeeHigh }) {
  const ARV = num(arv, "arv", { allowZero: false });
  const R = num(repairs, "repairs");
  const pct = toFraction(investorProfitPct, "investorProfitPct");
  const fee = num(assignmentFee, "assignmentFee");
  const investorProfit = ARV * pct;
  const buyerMaxPrice = ARV - R - investorProfit;
  const mao = buyerMaxPrice - fee;
  return {
    method: "investor",
    arv: round(ARV),
    repairs: round(R),
    investorProfitPct: pct,
    investorProfit: round(investorProfit),
    assignmentFee: round(fee),
    buyerMaxPrice: round(buyerMaxPrice),
    mao: round(mao),
    lao: round(mao * DEFAULTS.laoFactor),
    viable: mao > 0,
  };
}

/** Runs the investor method across the 27-30% profit band and $5k-$10k fee band. */
export function investorRange({ arv, repairs, profitLow = DEFAULTS.investorProfitLow, profitHigh = DEFAULTS.investorProfitHigh, feeLow = DEFAULTS.assignmentFeeLow, feeHigh = DEFAULTS.assignmentFeeHigh }) {
  // Most conservative = highest investor profit + highest fee; most aggressive = lowest of both.
  const conservative = investorMethod({ arv, repairs, investorProfitPct: profitHigh, assignmentFee: feeHigh });
  const aggressive = investorMethod({ arv, repairs, investorProfitPct: profitLow, assignmentFee: feeLow });
  return { conservative, aggressive, maoLow: conservative.mao, maoHigh: aggressive.mao };
}

/** Flip With Rick's sliding scale: MAO = (ARV - repairs) x tier multiplier; LAO = MAO x 70%. */
export function rickSlidingScale({ arv, repairs, version = "calculator" }) {
  const ARV = num(arv, "arv", { allowZero: false });
  const R = num(repairs, "repairs");
  const tiers = RICK_TIERS[version];
  if (!tiers) throw new RangeError(`version must be one of: ${Object.keys(RICK_TIERS).join(", ")}`);
  const tier = tiers.find((t) => ARV <= t.maxArv);
  const spread = ARV - R;
  const mao = spread * tier.multiplier;
  return {
    method: `rick-${version}`,
    arv: round(ARV),
    repairs: round(R),
    tier: tier.label,
    multiplier: tier.multiplier,
    mao: round(mao),
    lao: round(mao * DEFAULTS.laoFactor),
    viable: mao > 0,
  };
}

/** Classic 70% rule, for comparison: ARV x 70% - repairs. */
export function seventyPercentRule({ arv, repairs }) {
  const ARV = num(arv, "arv", { allowZero: false });
  const R = num(repairs, "repairs");
  const mao = ARV * 0.7 - R;
  return { method: "70-percent-rule", arv: round(ARV), repairs: round(R), mao: round(mao), lao: round(mao * DEFAULTS.laoFactor), viable: mao > 0 };
}

/** Everything at once - what the chatbot's deal_calculator tool returns. */
export function analyzeDeal({ arv, repairs, investorProfitPct, assignmentFee, askingPrice }) {
  const result = {
    investor: investorMethod({
      arv,
      repairs,
      investorProfitPct: investorProfitPct ?? DEFAULTS.investorProfitLow,
      assignmentFee: assignmentFee ?? DEFAULTS.assignmentFeeHigh,
    }),
    investorRange: investorRange({ arv, repairs }),
    rickCalculator: rickSlidingScale({ arv, repairs, version: "calculator" }),
    rickPosted: rickSlidingScale({ arv, repairs, version: "posted" }),
    seventyPercentRule: seventyPercentRule({ arv, repairs }),
  };
  if (askingPrice !== undefined && askingPrice !== null && askingPrice !== "") {
    const ask = num(askingPrice, "askingPrice");
    result.askingPrice = round(ask);
    result.askVsMao = round(ask - result.investor.mao);
    result.askIsUnderMao = ask <= result.investor.mao;
  }
  return result;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * ARV from sold comps, using price per square foot.
 * comps: [{ price, sqft, beds?, baths?, distanceMiles?, monthsAgo?, renovated?, address? }]
 * Flags comps that break the usual rules (too far, too old, size off by >20%, not renovated).
 */
export function arvFromComps({ subjectSqft, comps, maxDistanceMiles = 0.5, maxMonthsAgo = 6, sqftTolerance = 0.2 }) {
  const sqft = num(subjectSqft, "subjectSqft", { allowZero: false });
  if (!Array.isArray(comps) || comps.length === 0) throw new TypeError("comps must be a non-empty array");
  const rows = comps.map((c, i) => {
    const price = num(c.price, `comps[${i}].price`, { allowZero: false });
    const csq = num(c.sqft, `comps[${i}].sqft`, { allowZero: false });
    const flags = [];
    if (c.distanceMiles != null && Number(c.distanceMiles) > maxDistanceMiles) flags.push(`over ${maxDistanceMiles} mi away`);
    if (c.monthsAgo != null && Number(c.monthsAgo) > maxMonthsAgo) flags.push(`sold over ${maxMonthsAgo} months ago`);
    if (Math.abs(csq - sqft) / sqft > sqftTolerance) flags.push(`size differs by more than ${Math.round(sqftTolerance * 100)}%`);
    if (c.renovated === false) flags.push("not renovated (pulls ARV down)");
    return { address: c.address ?? `Comp ${i + 1}`, price: round(price), sqft: round(csq), pricePerSqft: price / csq, flags, usable: flags.length === 0 };
  });
  const usable = rows.filter((r) => r.usable);
  const basis = usable.length >= 1 ? usable : rows;
  const ppsf = basis.map((r) => r.pricePerSqft);
  const medianPpsf = median(ppsf);
  const avgPpsf = ppsf.reduce((a, b) => a + b, 0) / ppsf.length;
  return {
    subjectSqft: round(sqft),
    compsUsed: basis.length,
    usedOnlyCleanComps: usable.length >= 1,
    medianPricePerSqft: Math.round(medianPpsf * 100) / 100,
    averagePricePerSqft: Math.round(avgPpsf * 100) / 100,
    arvMedian: round(medianPpsf * sqft),
    arvAverage: round(avgPpsf * sqft),
    arvLow: round(Math.min(...ppsf) * sqft),
    arvHigh: round(Math.max(...ppsf) * sqft),
    comps: rows.map((r) => ({ ...r, pricePerSqft: Math.round(r.pricePerSqft * 100) / 100 })),
  };
}

/**
 * Ballpark repair estimate from the same checklist as Rick's "AI Repair Cost" form
 * (roof, kitchen, vinyl plank flooring, baths, bedrooms, foundation) plus HVAC/paint.
 * Unit costs are rough national ballparks - always override with local contractor pricing.
 */
export const REPAIR_COSTS = Object.freeze({
  roofPerSqft: 6, // new shingle roof, per sq ft of living area
  kitchen: 15000, // mid-grade kitchen update
  lvpPerSqft: 4.5, // vinyl plank installed
  bathroom: 10000, // full bathroom renovation
  bedroom: 2500, // paint, trim, doors, fixtures
  foundation: 15000, // foundation repair allowance
  hvac: 8000, // HVAC replacement
  interiorPaintPerSqft: 2.5,
  contingencyPct: 0.1,
});

export function estimateRepairs({ sqft, roof = false, kitchen = false, flooring = false, bathrooms = 0, bedrooms = 0, foundation = false, hvac = false, paint = false, costs = {} }) {
  const SQ = num(sqft, "sqft", { allowZero: false });
  const c = { ...REPAIR_COSTS, ...costs };
  const items = [];
  if (roof) items.push({ item: "New roof", cost: SQ * c.roofPerSqft });
  if (kitchen) items.push({ item: "Kitchen update", cost: c.kitchen });
  if (flooring) items.push({ item: "Vinyl plank flooring", cost: SQ * c.lvpPerSqft });
  const baths = num(bathrooms, "bathrooms");
  if (baths) items.push({ item: `${baths} bathroom renovation(s)`, cost: baths * c.bathroom });
  const beds = num(bedrooms, "bedrooms");
  if (beds) items.push({ item: `${beds} bedroom refresh(es)`, cost: beds * c.bedroom });
  if (foundation) items.push({ item: "Foundation repair allowance", cost: c.foundation });
  if (hvac) items.push({ item: "HVAC replacement", cost: c.hvac });
  if (paint) items.push({ item: "Interior paint", cost: SQ * c.interiorPaintPerSqft });
  const subtotal = items.reduce((a, b) => a + b.cost, 0);
  const contingency = subtotal * c.contingencyPct;
  return {
    sqft: round(SQ),
    items: items.map((i) => ({ ...i, cost: round(i.cost) })),
    subtotal: round(subtotal),
    contingency: round(contingency),
    total: round(subtotal + contingency),
    perSqft: Math.round(((subtotal + contingency) / SQ) * 100) / 100,
    note: "Ballpark national averages. Replace with local contractor bids before you make a firm offer.",
  };
}

export const money = (n) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
