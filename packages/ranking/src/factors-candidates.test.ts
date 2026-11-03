import { describe, expect, it } from "vitest";
import {
  CANDIDATE_FACTORS,
  chooseEbitForFactor,
  epsCagrNormalizedEndpoints,
  grossMarginTrend,
  grossProfitability,
  residualIncomeVP,
} from "./factors-candidates.js";
import { FACTORS } from "./factors.js";
import { makeCompany, makePeriod, makeTtm } from "./test-helpers.js";
import type { CompanySnapshot } from "@stockrank/core";

function withAnnualEbit(ebits: Array<number | null>): CompanySnapshot {
  return makeCompany({
    symbol: "T",
    annual: ebits.map((ebit, i) =>
      makePeriod({
        fiscalYear: String(2025 - i),
        income: { ...makePeriod().income, ebit },
      }),
    ),
  });
}

describe("adoption gate", () => {
  it("no candidate factor key appears in the production FACTORS list", () => {
    const production = new Set(FACTORS.map((f) => f.key));
    for (const c of CANDIDATE_FACTORS) {
      expect(production.has(c.key)).toBe(false);
    }
  });
});

describe("chooseEbitForFactor — EIX-class spike guard on EBIT", () => {
  it("falls back to the prior-3y mean on a 1.5×+ spike (EIX shape)", () => {
    // EIX FY2025: settlement-inflated EBIT vs ~flat priors.
    const s = withAnnualEbit([12_000_000_000, 5_000_000_000, 5_500_000_000, 6_000_000_000]);
    expect(chooseEbitForFactor(s)).toBeCloseTo((5 + 5.5 + 6) / 3 * 1e9, -6);
  });

  it("keeps a recent EBIT that is within 1.5× of priors", () => {
    const s = withAnnualEbit([7_000_000_000, 5_000_000_000, 5_500_000_000, 6_000_000_000]);
    expect(chooseEbitForFactor(s)).toBe(7_000_000_000);
  });

  it("uses the cycle average when the baseline is loss-emptied and recent spikes above it (NEM branch)", () => {
    // Priors mostly losses → positive baseline < 2 entries. Recent 9B
    // vs cycle average of all seven non-null years.
    const ebits = [9_000_000_000, -1_000_000_000, 2_000_000_000, -500_000_000, 1_000_000_000, 500_000_000, 1_500_000_000];
    const s = withAnnualEbit(ebits);
    const cycleAvg = ebits.reduce((a, b) => a + b, 0) / ebits.length;
    expect(chooseEbitForFactor(s)).toBeCloseTo(cycleAvg, -6);
  });

  it("short history accepts the recent EBIT as-is", () => {
    const s = withAnnualEbit([9_000_000_000, 2_000_000_000]);
    expect(chooseEbitForFactor(s)).toBe(9_000_000_000);
  });
});

describe("normalized factor extracts", () => {
  it("roicNormalized divides guarded EBIT by invested capital", () => {
    const s = makeCompany({
      symbol: "EIXISH",
      annual: [12e9, 5e9, 5.5e9, 6e9].map((ebit, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, ebit },
        }),
      ),
      ttm: makeTtm({ investedCapital: 40_000_000_000 }),
    });
    const def = CANDIDATE_FACTORS.find((f) => f.key === "roicNormalized")!;
    // guarded EBIT = 5.5e9 mean; NOPAT = ×0.79; / 40e9
    expect(def.extract(s)).toBeCloseTo((5.5e9 * 0.79) / 40e9, 6);
  });

  it("peRatioNormalized uses the anchor-layer spike-guarded EPS", () => {
    // TTM EPS 12 vs priors ~4 (3× spike), forward 5 → disagrees →
    // normalized EPS = prior mean 4 → P/E = 100 / 4 = 25.
    const s = makeCompany({
      symbol: "SPIKE",
      annual: [12, 4, 4, 4].map((eps, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
      ttm: makeTtm({ peRatio: 100 / 12, forwardEps: 5 }),
    });
    const def = CANDIDATE_FACTORS.find((f) => f.key === "peRatioNormalized")!;
    expect(def.extract(s)).toBeCloseTo(25, 5);
  });
});

describe("epsCagrNormalizedEndpoints", () => {
  it("averages 3-year endpoints so a spiked year moves the CAGR by a third", () => {
    // eps[0..2] = [12, 4, 4] → end 6.667; eps[4..6] = [2, 2, 2] → 2.
    const s = makeCompany({
      symbol: "G",
      annual: [12, 4, 4, 3, 2, 2, 2].map((eps, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
    });
    const end = (12 + 4 + 4) / 3;
    expect(epsCagrNormalizedEndpoints(s)).toBeCloseTo(
      Math.pow(end / 2, 1 / 4) - 1,
      6,
    );
  });

  it("returns null without enough start-window history", () => {
    const s = makeCompany({
      symbol: "SHORT",
      annual: [5, 4, 4].map((eps, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
    });
    expect(epsCagrNormalizedEndpoints(s)).toBeNull();
  });
});

describe("new academic candidates", () => {
  it("grossProfitability = grossProfit / totalAssets", () => {
    const s = makeCompany({ symbol: "GPA" }); // makePeriod: GP 40e9, TA 100e9
    expect(grossProfitability(s)).toBeCloseTo(0.4, 6);
  });

  it("grossMarginTrend = current margin minus mean of three priors", () => {
    const margins = [0.5, 0.4, 0.42, 0.38]; // rev 100e9 each
    const s = makeCompany({
      symbol: "MT",
      annual: margins.map((m, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: {
            ...makePeriod().income,
            revenue: 100_000_000_000,
            grossProfit: m * 100_000_000_000,
          },
        }),
      ),
    });
    expect(grossMarginTrend(s)).toBeCloseTo(0.5 - (0.4 + 0.42 + 0.38) / 3, 6);
  });

  it("residualIncomeVP = (B0 × ROE / r) / price with r = 0.10", () => {
    // makePeriod: equity 30e9, NI 8e9, shares 1e9; price 100.
    // ROE = 8/30 (same all years) → V/share = 30 × (8/30) / 0.1 = 80 →
    // wait: B0/share = 30; V = 30 × 0.2667 / 0.1 = 80; V/P = 0.8.
    const s = makeCompany({ symbol: "RI" });
    expect(residualIncomeVP(s)).toBeCloseTo((30 * (8 / 30) / 0.1) / 100, 4);
  });

  it("residualIncomeVP is null for negative-equity names", () => {
    const base = makePeriod();
    const s = makeCompany({
      symbol: "NEG",
      annual: [
        makePeriod({
          balance: { ...base.balance, totalEquity: -5_000_000_000 },
        }),
      ],
    });
    expect(residualIncomeVP(s)).toBeNull();
  });
});
