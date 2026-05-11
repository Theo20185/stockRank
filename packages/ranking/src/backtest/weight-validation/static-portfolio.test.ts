import { describe, it, expect } from "vitest";
import {
  cumulativeYieldOver,
  computeStaticPortfolioPerHorizon,
  vooBarbell50_50,
  vooBuyAndHold,
  vooCspFull,
} from "./static-portfolio.js";

describe("cumulativeYieldOver", () => {
  it("compounds an annualized yield over the horizon", () => {
    // 6% per year, compounded over 3y → (1.06)^3 - 1 = 0.191016
    expect(cumulativeYieldOver(0.06, 3)).toBeCloseTo(0.191016, 5);
  });

  it("handles 1y as a trivial pass-through", () => {
    expect(cumulativeYieldOver(0.045, 1)).toBeCloseTo(0.045, 6);
  });

  it("returns 0 at zero yield regardless of horizon", () => {
    expect(cumulativeYieldOver(0, 5)).toBe(0);
  });
});

describe("vooBuyAndHold", () => {
  it("returns the SPY cumulative return verbatim (excess = 0 by definition)", () => {
    const candidate = vooBuyAndHold();
    expect(candidate.perSnapshotReturn(0.10, 1)).toBe(0.10);
    expect(candidate.perSnapshotReturn(-0.05, 3)).toBe(-0.05);
    expect(candidate.perSnapshotReturn(0.30, 3)).toBe(0.30);
  });

  it("turnover is zero — no rebalance, hold forever", () => {
    expect(vooBuyAndHold().annualTurnover).toBe(0);
  });

  it("classifies all gains as long-term holding (capital appreciation)", () => {
    expect(vooBuyAndHold().incomeShare).toBe(0);
  });
});

describe("vooCspFull (100% CSP collateral)", () => {
  it("yields collateral + put premium compounded over horizon, independent of SPY", () => {
    // 4.5% collateral + 6% put premium = 10.5% combined annualized.
    // Over 3y: (1.105)^3 - 1 = 0.349233.
    const candidate = vooCspFull({ collateralYield: 0.045, putPremiumYield: 0.06 });
    expect(candidate.perSnapshotReturn(0.10, 3)).toBeCloseTo(0.349233, 5);
    expect(candidate.perSnapshotReturn(-0.20, 3)).toBeCloseTo(0.349233, 5);
    expect(candidate.perSnapshotReturn(0.10, 1)).toBeCloseTo(0.105, 5);
  });

  it("turnover ≈ 1.0/yr — the CSP rolls monthly, so the full premium leg recycles", () => {
    expect(vooCspFull({ collateralYield: 0.045, putPremiumYield: 0.06 }).annualTurnover).toBe(1);
  });

  it("classifies premium as income (ordinary/STCG); only collateral interest is also income", () => {
    // For a 100% CSP portfolio, ALL the return is income-taxed: collateral
    // interest is ordinary income, put premium is short-term gains.
    // incomeShare = 1.0 → entire return taxed at STCG rate.
    expect(vooCspFull({ collateralYield: 0.045, putPremiumYield: 0.06 }).incomeShare).toBe(1);
  });
});

describe("vooBarbell50_50", () => {
  it("blends 50% SPY + 50% CSP yield per the spec formula", () => {
    // SPY 3y +30%; CSP yields 4.5% + 6% → 34.9233% over 3y.
    // Total: 0.5 × 30% + 0.5 × 34.9233% = 32.4616%.
    const c = vooBarbell50_50({ collateralYield: 0.045, putPremiumYield: 0.06 });
    expect(c.perSnapshotReturn(0.30, 3)).toBeCloseTo(0.324616, 5);
    // SPY flat 3y +0%; CSP 34.9233% → barbell 17.4616%.
    expect(c.perSnapshotReturn(0, 3)).toBeCloseTo(0.174616, 5);
    // SPY 3y -20%; CSP 34.9233% → 0.5×-20% + 0.5×34.9233% = +7.4616%.
    expect(c.perSnapshotReturn(-0.20, 3)).toBeCloseTo(0.074616, 5);
  });

  it("turnover ≈ 0.5/yr — the CSP half rolls, the VOO half doesn't", () => {
    expect(vooBarbell50_50({ collateralYield: 0.045, putPremiumYield: 0.06 }).annualTurnover).toBe(0.5);
  });

  it("incomeShare = ~0.5 — half the return comes from put premium + interest", () => {
    // The CSP half (50% allocation) is fully income-taxed; the VOO half is
    // capital appreciation. So roughly half the realized return gets the
    // STCG haircut. We approximate by allocation share, not by realized
    // return components (which vary per snapshot) — close enough for the
    // first-pass after-tax calculation, and the value falls out of the
    // closed-form composition.
    expect(vooBarbell50_50({ collateralYield: 0.045, putPremiumYield: 0.06 }).incomeShare).toBe(0.5);
  });
});

describe("computeStaticPortfolioPerHorizon", () => {
  const spyReturns = new Map<string, Map<string, number>>([
    ["2018-01-31", new Map([["1", 0.05], ["3", 0.20]])],
    ["2018-04-30", new Map([["1", 0.10], ["3", 0.25]])],
    ["2018-07-31", new Map([["1", -0.05], ["3", 0.15]])],
    ["2018-10-31", new Map([["1", 0.08], ["3", 0.30]])],
  ]);

  it("computes mean realized return across snapshots in the test window", () => {
    const candidate = vooBuyAndHold();
    const result = computeStaticPortfolioPerHorizon({
      candidate,
      spyReturnsByDate: spyReturns,
      horizon: 1,
      testPeriodStart: "2018-01-01",
      seed: 1,
      bootstrapResamples: 200,
    });
    // Mean SPY 1y across the 4 snapshots = (0.05 + 0.10 + -0.05 + 0.08) / 4 = 0.045
    expect(result.meanRealized).toBeCloseTo(0.045, 6);
    // VOO buy-and-hold IS SPY → excess always = 0 → mean excess = 0.
    expect(result.meanExcess).toBeCloseTo(0, 6);
    expect(result.nSnapshots).toBe(4);
  });

  it("computes excess vs SPY for the barbell as 0.5 × (cspYield - spyReturn) per snapshot", () => {
    const candidate = vooBarbell50_50({ collateralYield: 0.045, putPremiumYield: 0.06 });
    const result = computeStaticPortfolioPerHorizon({
      candidate,
      spyReturnsByDate: spyReturns,
      horizon: 3,
      testPeriodStart: "2018-01-01",
      seed: 1,
      bootstrapResamples: 200,
    });
    // CSP yield cumulative over 3y = (1.105)^3 - 1 = 0.349233.
    // Per-snapshot excess = barbell - spy = 0.5×spy + 0.5×0.349233 - spy = 0.5×(0.349233 - spy)
    //   2018-01: 0.5 × (0.349233 - 0.20) = 0.074617
    //   2018-04: 0.5 × (0.349233 - 0.25) = 0.049617
    //   2018-07: 0.5 × (0.349233 - 0.15) = 0.099617
    //   2018-10: 0.5 × (0.349233 - 0.30) = 0.024617
    // mean = 0.062117
    expect(result.meanExcess).toBeCloseTo(0.062117, 4);
  });

  it("drops snapshots outside the test window", () => {
    const candidate = vooBuyAndHold();
    const result = computeStaticPortfolioPerHorizon({
      candidate,
      spyReturnsByDate: spyReturns,
      horizon: 1,
      testPeriodStart: "2018-06-01",   // drops the first two snapshots
      seed: 1,
      bootstrapResamples: 200,
    });
    // Only 2018-07-31 and 2018-10-31 qualify.
    expect(result.nSnapshots).toBe(2);
    expect(result.meanRealized).toBeCloseTo((-0.05 + 0.08) / 2, 6);
  });

  it("returns null metrics when no snapshots in window", () => {
    const candidate = vooBuyAndHold();
    const result = computeStaticPortfolioPerHorizon({
      candidate,
      spyReturnsByDate: spyReturns,
      horizon: 1,
      testPeriodStart: "2099-01-01",
      seed: 1,
      bootstrapResamples: 200,
    });
    expect(result.nSnapshots).toBe(0);
    expect(result.meanRealized).toBeNull();
    expect(result.meanExcess).toBeNull();
    expect(result.excessCi95).toBeNull();
  });
});
