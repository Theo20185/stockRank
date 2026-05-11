import { describe, it, expect } from "vitest";
import {
  buildCapitalPlan,
  type CapitalPlanCandidate,
} from "./capital-plan.js";

function cand(
  symbol: string,
  strike: number,
  premium = 1.5,
  composite = 70,
  daysToExpiry = 30,
  annualizedReturn = 0.18,
): CapitalPlanCandidate {
  return { symbol, strike, premiumPerShare: premium, composite, daysToExpiry, annualizedReturn };
}

describe("buildCapitalPlan — basic allocation", () => {
  it("equal-weights across N candidates and rounds to whole contracts", () => {
    // capital $30k, 3 candidates with $50/$100/$25 strikes → $20k/$10k/$2.5k per contract.
    // Equal budget = $10k per name.
    // pass-1: $50 → floor(10000/5000) = 2 contracts ($10k)
    //         $100 → floor(10000/10000) = 1 contract ($10k)
    //         $25 → floor(10000/2500) = 4 contracts ($10k)
    // remaining = $0. No top-up.
    const plan = buildCapitalPlan({
      capital: 30000,
      candidates: [cand("AAA", 50), cand("BBB", 100), cand("CCC", 25)],
    });
    expect(plan.items.map((i) => [i.symbol, i.contracts])).toEqual([
      ["AAA", 2],
      ["BBB", 1],
      ["CCC", 4],
    ]);
    expect(plan.allocated).toBe(30000);
    expect(plan.remaining).toBe(0);
  });

  it("tops up leftover capital starting from highest-ranked candidate", () => {
    // capital $25k, 2 candidates: $50 strike (5k/contract), $40 strike (4k/contract).
    // Equal budget = $12,500/name.
    // pass-1: AAA $50 → 2 contracts ($10k); BBB $40 → 3 contracts ($12k).
    // allocated $22k, remaining $3k. No candidate fits → no top-up.
    let plan = buildCapitalPlan({
      capital: 25000,
      candidates: [cand("AAA", 50), cand("BBB", 40)],
    });
    expect(plan.items.map((i) => [i.symbol, i.contracts])).toEqual([
      ["AAA", 2],
      ["BBB", 3],
    ]);
    expect(plan.remaining).toBe(3000);

    // capital $30k, same shapes. Equal budget $15k.
    // pass-1: AAA → 3 ($15k); BBB → 3 ($12k). remaining $3k.
    // pass-2: AAA needs $5k (>3k, no). BBB needs $4k (>3k, no). Stop.
    plan = buildCapitalPlan({
      capital: 30000,
      candidates: [cand("AAA", 50), cand("BBB", 40)],
    });
    expect(plan.items.map((i) => [i.symbol, i.contracts])).toEqual([
      ["AAA", 3],
      ["BBB", 3],
    ]);
    expect(plan.remaining).toBe(3000);

    // capital $35k, same shapes. Equal budget $17.5k.
    // pass-1: AAA → 3 ($15k); BBB → 4 ($16k). remaining $4k.
    // pass-2: AAA needs $5k > $4k → no. BBB needs $4k <= $4k → +1 (total 5, $20k). remaining $0.
    plan = buildCapitalPlan({
      capital: 35000,
      candidates: [cand("AAA", 50), cand("BBB", 40)],
    });
    expect(plan.items.map((i) => [i.symbol, i.contracts])).toEqual([
      ["AAA", 3],
      ["BBB", 5],
    ]);
    expect(plan.remaining).toBe(0);
  });

  it("respects topN and ignores candidates beyond the cap", () => {
    // 4 candidates but topN=2: only AAA and BBB get any allocation.
    const plan = buildCapitalPlan({
      capital: 20000,
      candidates: [cand("AAA", 50), cand("BBB", 100), cand("CCC", 25), cand("DDD", 75)],
      topN: 2,
    });
    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((i) => i.symbol)).toEqual(["AAA", "BBB"]);
    // Equal budget $10k. AAA → 2 ($10k). BBB → 1 ($10k). remaining $0.
    expect(plan.items.map((i) => i.contracts)).toEqual([2, 1]);
    expect(plan.remaining).toBe(0);
  });
});

describe("buildCapitalPlan — edge cases", () => {
  it("returns zero-contract items when capital is below the cheapest single contract", () => {
    // capital $1000, candidates need $5000/$10000/$2500 per contract.
    // None fit. All zeros, all capital remains.
    const plan = buildCapitalPlan({
      capital: 1000,
      candidates: [cand("AAA", 50), cand("BBB", 100), cand("CCC", 25)],
    });
    expect(plan.items.map((i) => i.contracts)).toEqual([0, 0, 0]);
    expect(plan.allocated).toBe(0);
    expect(plan.remaining).toBe(1000);
  });

  it("allocates a single contract to an expensive name when one contract fits", () => {
    // capital $10k, single $100 strike. Equal budget = $10k → 1 contract → allocated $10k.
    const plan = buildCapitalPlan({
      capital: 10000,
      candidates: [cand("BBB", 100)],
    });
    expect(plan.items[0]?.contracts).toBe(1);
    expect(plan.allocated).toBe(10000);
    expect(plan.remaining).toBe(0);
  });

  it("returns empty allocation when candidates list is empty", () => {
    const plan = buildCapitalPlan({ capital: 50000, candidates: [] });
    expect(plan.items).toEqual([]);
    expect(plan.allocated).toBe(0);
    expect(plan.remaining).toBe(50000);
  });

  it("treats capital <= 0 as no allocation", () => {
    let plan = buildCapitalPlan({ capital: 0, candidates: [cand("AAA", 50)] });
    expect(plan.items[0]?.contracts).toBe(0);
    expect(plan.remaining).toBe(0);

    plan = buildCapitalPlan({ capital: -100, candidates: [cand("AAA", 50)] });
    expect(plan.items[0]?.contracts).toBe(0);
    expect(plan.remaining).toBe(0);
  });

  it("treats topN <= 0 as no allocation", () => {
    const plan = buildCapitalPlan({
      capital: 50000,
      candidates: [cand("AAA", 50), cand("BBB", 40)],
      topN: 0,
    });
    expect(plan.items).toEqual([]);
    expect(plan.allocated).toBe(0);
  });

  it("uses all candidates when topN exceeds the list length", () => {
    const plan = buildCapitalPlan({
      capital: 30000,
      candidates: [cand("AAA", 50), cand("BBB", 25)],
      topN: 10,
    });
    expect(plan.items).toHaveLength(2);
  });
});

describe("buildCapitalPlan — premium + totals", () => {
  it("computes totalPremium per item and across the plan", () => {
    const plan = buildCapitalPlan({
      capital: 20000,
      // $50 strike, $2/share bid → $200 per contract premium
      // $25 strike, $0.50/share bid → $50 per contract premium
      candidates: [cand("AAA", 50, 2), cand("BBB", 25, 0.5)],
    });
    // Equal budget $10k. AAA → 2 contracts (collateral $10k, premium $400).
    //                     BBB → 4 contracts (collateral $10k, premium $200).
    expect(plan.items[0]).toMatchObject({ contracts: 2, totalPremium: 400 });
    expect(plan.items[1]).toMatchObject({ contracts: 4, totalPremium: 200 });
    expect(plan.totalPremium).toBe(600);
  });

  it("populates collateralPerContract on every item even when contracts=0", () => {
    const plan = buildCapitalPlan({
      capital: 100,
      candidates: [cand("AAA", 50)],
    });
    expect(plan.items[0]).toMatchObject({
      contracts: 0,
      collateralPerContract: 5000,
      totalCollateral: 0,
      totalPremium: 0,
    });
  });
});
