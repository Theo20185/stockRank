import { describe, it, expect } from "vitest";
import {
  CA_FED_LTCG_RATE,
  CA_FED_STCG_RATE,
  applyFrictions,
  type FrictionInput,
  type Frictions,
} from "./frictions.js";

function input(overrides: Partial<FrictionInput>): FrictionInput {
  return {
    cumulativeReturn: 0.10,
    horizonYears: 1,
    annualTurnover: 1,
    incomeShare: 0,
    ...overrides,
  };
}

describe("applyFrictions — cost overlay", () => {
  it("subtracts (2 × bps × turnover × horizonYears) from the cumulative return", () => {
    // 20 bps round-trip, 1.0 turnover/yr, 1y horizon → drag = 2 × 0.0020 × 1 × 1 = 0.0040.
    const result = applyFrictions(input({ cumulativeReturn: 0.10 }), {
      roundTripBps: 20,
      taxRegime: "tax-free",
    });
    expect(result.afterFriction).toBeCloseTo(0.10 - 0.004, 6);
  });

  it("scales the cost drag by horizon length (3y turnover stacks 3×)", () => {
    // 20 bps × 1.0 turnover × 3y → 6 × 20 bps = 1.20%.
    const result = applyFrictions(
      input({ cumulativeReturn: 0.30, horizonYears: 3, annualTurnover: 1 }),
      { roundTripBps: 20, taxRegime: "tax-free" },
    );
    expect(result.afterFriction).toBeCloseTo(0.30 - 0.012, 6);
  });

  it("scales by turnover — zero-turnover portfolio has zero cost drag", () => {
    const result = applyFrictions(
      input({ cumulativeReturn: 0.30, horizonYears: 3, annualTurnover: 0 }),
      { roundTripBps: 20, taxRegime: "tax-free" },
    );
    expect(result.afterFriction).toBeCloseTo(0.30, 6);
  });

  it("treats roundTripBps=0 as no friction", () => {
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, annualTurnover: 1 }),
      { roundTripBps: 0, taxRegime: "tax-free" },
    );
    expect(result.afterFriction).toBeCloseTo(0.10, 6);
  });
});

describe("applyFrictions — tax overlay", () => {
  it("tax-free regime leaves after-friction return unchanged", () => {
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, incomeShare: 0.5 }),
      { roundTripBps: 0, taxRegime: "tax-free" },
    );
    expect(result.afterTax).toBeCloseTo(0.10, 6);
  });

  it("ltcg-only multiplies the whole gain by (1 - LTCG)", () => {
    // 10% gain × (1 - 0.371) = 6.29%.
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, incomeShare: 0 }),
      { roundTripBps: 0, taxRegime: "ltcg-only" },
    );
    expect(result.afterTax).toBeCloseTo(0.10 * (1 - CA_FED_LTCG_RATE), 6);
  });

  it("blended-by-horizon at 1y horizon: incomeShare × STCG + (1-incomeShare) × STCG (all gains short-term)", () => {
    // 1y → all gains are STCG regardless of incomeShare.
    // 10% × (1 - 0.541) = 4.59%.
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, horizonYears: 1, incomeShare: 0.5 }),
      { roundTripBps: 0, taxRegime: "blended-by-horizon" },
    );
    expect(result.afterTax).toBeCloseTo(0.10 * (1 - CA_FED_STCG_RATE), 6);
  });

  it("blended-by-horizon at 3y: capital-appreciation portion gets LTCG, income portion stays STCG", () => {
    // 10% gain. incomeShare = 0.5 → 50% taxed STCG, 50% taxed LTCG.
    //   STCG share = 0.05 × (1 - 0.541) = 0.05 × 0.459 = 0.02295
    //   LTCG share = 0.05 × (1 - 0.371) = 0.05 × 0.629 = 0.03145
    //   total = 0.05440
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, horizonYears: 3, incomeShare: 0.5 }),
      { roundTripBps: 0, taxRegime: "blended-by-horizon" },
    );
    const expected =
      0.10 * 0.5 * (1 - CA_FED_STCG_RATE) + 0.10 * 0.5 * (1 - CA_FED_LTCG_RATE);
    expect(result.afterTax).toBeCloseTo(expected, 6);
  });

  it("does not tax losses (afterTax can preserve sign correctly on negative returns)", () => {
    // Losses pass through unchanged — tax credits / wash-sales out of scope.
    const result = applyFrictions(
      input({ cumulativeReturn: -0.05, horizonYears: 3, incomeShare: 0.5 }),
      { roundTripBps: 0, taxRegime: "blended-by-horizon" },
    );
    expect(result.afterTax).toBeCloseTo(-0.05, 6);
  });
});

describe("applyFrictions — combined", () => {
  it("applies cost drag first, then tax on the post-cost return", () => {
    // 20 bps × 1.0 turnover × 1y = 0.40% drag → 0.10 - 0.004 = 0.096 after friction.
    // Tax-free → afterTax = 0.096.
    const result = applyFrictions(
      input({ cumulativeReturn: 0.10, annualTurnover: 1 }),
      { roundTripBps: 20, taxRegime: "tax-free" },
    );
    expect(result.afterFriction).toBeCloseTo(0.096, 6);
    expect(result.afterTax).toBeCloseTo(0.096, 6);
  });

  it("matches the user's CA combined STCG rate of 54.1% (37 + 13.3 + 3.8)", () => {
    // Sanity-check the constants.
    expect(CA_FED_STCG_RATE).toBeCloseTo(0.37 + 0.133 + 0.038, 4);
    expect(CA_FED_LTCG_RATE).toBeCloseTo(0.20 + 0.133 + 0.038, 4);
  });
});
