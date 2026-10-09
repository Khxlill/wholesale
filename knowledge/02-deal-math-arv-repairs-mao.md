# Deal math: ARV, repairs, investor profit, assignment fee, MAO

Always run real numbers through the `deal_calculator` tool. This file explains the method.

## The formula this user wants taught (investor method)
```
MAO = ARV - repair cost - investor profit - assignment fee
investor profit = 27% to 30% of ARV
assignment fee  = $5,000 to $10,000
```
Why it works: you are working **backwards from your cash buyer**. A flipper needs roughly 27-30% of ARV to cover their profit **plus** buying, holding, financing and selling costs. Whatever's left after repairs and their cut is the most they'll pay you (the **buyer's max price**). Subtract your fee and you get the most you can contract the house for (**MAO**).

- Use **30%** (conservative) for slower markets, cheaper houses, heavy rehabs, or when you're unsure of the ARV/repairs. Use **27%** for hot markets, light rehabs, and solid comps.
- Use a **$10k** fee by default; drop toward **$5k** to make a tight deal work. Don't go below what makes the deal worth your time.
- **Open lower than MAO.** A common opening offer (LAO, "least allowable offer") is about **70% of MAO** [FWR site calculator], then negotiate up toward MAO, never above it.

### Worked examples (investor method)
| ARV | Repairs | 27% profit | Fee | Buyer's max | **MAO** | Opening offer (70%) | MAO range (30%+$10k ... 27%+$5k) |
|---|---|---|---|---|---|---|---|
| $200,000 | $40,000 | $54,000 | $10,000 | $106,000 | **$96,000** | $67,200 | $90,000 - $101,000 |
| $250,000 | $45,000 | $67,500 | $10,000 | $137,500 | **$127,500** | $89,250 | $120,000 - $132,500 |
| $110,000 | $25,000 | $29,700 | $10,000 | $55,300 | **$45,300** | $31,710 | $42,000 - $50,300 |
| $350,000 | $60,000 | $94,500 | $10,000 | $195,500 | **$185,500** | $129,850 | $175,000 - $190,500 |

Example read-out: on the $250k ARV house, if the seller is asking $150,000, they're $22,500 over MAO, so either negotiate down, cut your fee, or pass.

## Flip With Rick's MAO formula [FWR site]
Rick and Zach say **stop using the 70% rule** ("Ignore 70% Rule", "Stop Using the 70% Rule, Here's What to Offer Instead", "You're Offering Too Much on Wholesale Deals (Here's the Fix)"). Their sliding scale multiplies the **spread** (ARV - repairs) by a percentage that rises with ARV, because buyers accept thinner margins on pricier houses:

"2024 FORMULA FOR MAO" as posted on their ARV page:
- ARV under $125k: (ARV - repairs) x **70%**
- ARV $125k-$220k: (ARV - repairs) x **80%**
- ARV $220k-$300k: (ARV - repairs) x **83%**
- ARV $300k+: (ARV - repairs) x **85%**

The interactive MAO calculator on their site uses slightly higher top tiers: **85%** for $220k-$300k and **90%** over $300k. It also shows **LAO = MAO x 70%** as the "least allowable offer" (opening offer).

Examples (calculator version): ARV $200k / repairs $40k -> $160k x 80% = **$128,000** MAO, LAO $89,600. ARV $250k / repairs $45k -> $205k x 85% = **$174,250** (posted 83% version: $170,150). ARV $110k / repairs $25k -> $85k x 70% = **$59,500**.

### Why the two methods give different numbers
Rick's scale is aggressive at higher prices (it reflects what cash buyers in competitive markets like his Florida market actually pay, and it doesn't subtract a separate assignment fee). The investor method protects the buyer's margin explicitly and bakes in your fee. Coaching rule of thumb [General]: **contract at or below the investor-method MAO when you can**; treat Rick's sliding-scale number as the ceiling of what a buyer might stretch to in a hot market, and check it against what buyers in that zip code have actually paid recently.

### The classic 70% rule (for comparison) [General]
MAO = ARV x 70% - repairs. Example: $200k ARV, $40k repairs -> $100,000. Simple, but it ignores price point and market heat, which is why Flip With Rick moved away from it.

## How to comp ARV [FWR site topics + General method]
Flip With Rick's ARV lessons: comping on **Zillow & Redfin** ("comping still works for Zillow & Redfin"), "How to Comp any Property in 57 Seconds", "How to Comp in Non-Disclosure States", "What if There's no Comps?", "FINDING ARV (LIVE)".

Step by step [General]:
1. **Pin down the subject**: beds, baths, living sq ft, lot size, year built, property type (SFH vs townhouse vs condo), garage, pool, and condition.
2. **Pull sold comps**, not active listings. On Zillow: search the area -> filter **Sold** -> set "Sold in last 6 months" (stretch to 12 only if needed). On Redfin: Filters -> **Sold** -> last 3-6 months. Draw a tight area around the subject.
3. **Comp rules of thumb**: same neighborhood/subdivision, ideally **within 0.5 mile** (up to ~1 mile in rural areas), don't cross major roads/highways/school-district lines; sold within **6 months**; **similar sq ft (within ~20%)**, same bed/bath count (+/-1), similar age and style, same property type.
4. **Use renovated comps for ARV.** ARV is the *fixed-up* value, so pick comps that sold updated (look at listing photos: new kitchens, floors, paint). Distressed or as-is sales tell you the *as-is* value, not ARV.
5. **Price per square foot**: divide each comp's sold price by its sq ft, take the median (or average of the best 3), multiply by the subject's sq ft. Sanity-check against the best single comp. The `arv_from_comps` tool does this and flags bad comps.
6. **Adjust** for big differences: extra bathroom, garage, pool, much bigger lot. When in doubt, be conservative: overestimating ARV is the #1 way wholesale deals die.
7. **Don't trust the Zestimate** for ARV. It's a starting point for distressed houses at best.
8. **Ask your buyers and an agent.** Cash buyers in that zip code and investor-friendly agents will tell you what flips there actually sell for.

**Non-disclosure states** (sale prices aren't public record) [FWR site]: Alaska, Idaho, Kansas, Missouri, Mississippi, Louisiana, Wyoming, Utah, Texas, North Dakota, New Mexico, Montana. There, lean on Zillow/Redfin "sold" data where listed, recent listing prices of renovated homes, agents with MLS access, and what your buyers report.

**No good comps?** [General] widen radius/time window step by step, use slightly different but similar homes with adjustments, look at pending sales, ask a local agent for a CMA, or price off what local investors pay per sq ft.

## Estimating repair costs [FWR site + General]
Flip With Rick's "AI Repair Cost" form asks: square footage under air, new roof (yes/no), kitchen updates (yes/no), new vinyl plank flooring (yes/no), number of bathrooms needing full renovation, number of bedrooms needing renovation, foundation issues (yes/no), and the Zillow link. It turns that into a prompt for an AI to produce a repair estimate. The `estimate_repairs` tool uses the same checklist.

Ballpark costs used by the tool [General - always confirm with local contractors]: roof ~$6/sq ft of living area; kitchen update ~$15k; vinyl plank flooring ~$4.50/sq ft; full bathroom ~$10k each; bedroom refresh ~$2.5k each; foundation allowance ~$15k (can be far more); HVAC ~$8k; interior paint ~$2.50/sq ft; plus 10% contingency.

Quick per-sq-ft rehab levels [General]: light cosmetic (paint, floors, fixtures) ~$15-25/sq ft; medium (plus kitchen and baths) ~$25-45/sq ft; heavy (plus roof, systems, layout) ~$45-70/sq ft; full gut $70+/sq ft. Prices vary a lot by region.

Example: 1,500 sq ft needing roof, kitchen, LVP floors, 2 baths, 3 bedrooms, and paint -> about **$68,200** with contingency (~$45/sq ft).

Ask the seller about **the big five**: roof age, HVAC age, foundation, plumbing/electrical, water damage. Those blow up budgets.

## How much to charge (assignment fee) [FWR video + General]
- This user's target: **$5,000-$10,000** per deal. Flip With Rick students' first checks mostly fall between ~$3,700 and $20,000 [FWR site].
- Your fee is whatever fits between your contract price and what a buyer will pay. Bigger spread = bigger fee, but a fee that leaves the buyer no profit kills the deal.
- Some title companies and buyers balk at very large disclosed assignment fees; a **double close** keeps the fee private [FWR video: "How to Double Close"].
- Flip With Rick video: "How Much Should You Charge for Your Deals?" (Day 27 of the 30-day challenge).
