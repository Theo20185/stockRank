import { describe, it, expect } from "vitest";
import type { Portfolio } from "@stockrank/core";
import type { RankedRow, RankedSnapshot } from "../types.js";
import { evaluatePortfolio } from "./evaluator.js";
import type { FairValue } from "../fair-value/types.js";

function fv(median: number): FairValue {
  return {
    current: 50,
    range: { p25: median * 0.8, median, p75: median * 1.2 },
    upsideToP25Pct: 0,
    confidence: "medium",
    confidenceReason: "test",
    anchors: {} as FairValue["anchors"],
    peers: { count: 0, symbols: [], cohortKey: "test" },
    skipped: false,
    skipReason: null,
    methodology: "peer-cohort-median",
  } as FairValue;
}

function makeRow(overrides: Partial<RankedRow> & { symbol: string; composite: number; price: number }): RankedRow {
  return {
    name: overrides.symbol,
    sector: "Industrials",
    industry: "Test",
    marketCap: 1e10,
    industryRank: 1,
    universeRank: 1,
    pctOffYearHigh: 5,
    pctAboveYearLow: 5,
    categoryScores: {
      valuation: 0.5, health: 0.5, quality: 0.5,
      shareholderReturn: 0.5, growth: 0.5, momentum: 0,
    },
    factorDetails: [],
    missingFactors: [],
    fairValue: null,
    negativeEquity: false,
    optionsLiquid: true,
    annualDividend: 0,
    fvTrend: "insufficient_data",
    fundamentalsDirection: "insufficient_data",
    ...overrides,
  } as RankedRow;
}

function snapshot(rows: RankedRow[]): RankedSnapshot {
  return {
    snapshotDate: "2026-04-26",
    weights: {
      valuation: 0.5, health: 0.2, quality: 0.1,
      shareholderReturn: 0.1, growth: 0.1, momentum: 0,
    },
    universeSize: rows.length,
    excludedCount: 0,
    rows,
    ineligibleRows: [],
    turnaroundWatchlist: [],
  };
}

describe("evaluatePortfolio", () => {
  it("computes per-position P&L and pct vs entry", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "ABC", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 50 },
      ],
    };
    const snap = snapshot([
      makeRow({ symbol: "ABC", composite: 80, price: 130 }),
    ]);
    const result = evaluatePortfolio(portfolio, snap);
    expect(result.positions[0]?.pnlPerShare).toBe(30);
    expect(result.positions[0]?.pnlPct).toBe(30);
    expect(result.positions[0]?.pnlDollars).toBe(1500); // 30 * 50
    expect(result.summary.aggregatePnlDollars).toBe(1500);
  });

  it("flags in-avoid-bucket sell signal when position drops to bottom decile", () => {
    // 11 rows so 10% of eligible = 2 → bottom 2 by composite go to avoid.
    // Set up so ABC (held position) is one of the bottom 2.
    const rows = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeRow({
          symbol: `T${i}`,
          composite: 90 - i * 2,
          price: 100,
          fairValue: fv(150),
        }),
      ),
      makeRow({ symbol: "ABC", composite: 10, price: 120, fairValue: fv(150) }),
      makeRow({ symbol: "BOTTOM", composite: 5, price: 100, fairValue: fv(150) }),
    ];
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "ABC", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    const result = evaluatePortfolio(portfolio, snapshot(rows));
    expect(result.positions[0]?.currentBucket).toBe("avoid");
    expect(result.positions[0]?.sellSignals).toContain("in-avoid-bucket");
    expect(result.summary.positionsInAvoid).toBe(1);
  });

  it("flags price-at-or-above-fv-median when current price hits FV median", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "ABC", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    // FV median = 150; current price = 155 → above median, below p75 (180)
    const snap = snapshot([
      makeRow({ symbol: "ABC", composite: 60, price: 155, fairValue: fv(150) }),
    ]);
    const result = evaluatePortfolio(portfolio, snap);
    expect(result.positions[0]?.sellSignals).toContain("price-at-or-above-fv-median");
    expect(result.positions[0]?.sellSignals).not.toContain("price-at-or-above-fv-p75");
  });

  it("flags price-at-or-above-fv-p75 (and not median) when fully priced", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "ABC", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    // FV median = 150, p75 = 180; current price = 200 → above p75
    const snap = snapshot([
      makeRow({ symbol: "ABC", composite: 60, price: 200, fairValue: fv(150) }),
    ]);
    const result = evaluatePortfolio(portfolio, snap);
    expect(result.positions[0]?.sellSignals).toContain("price-at-or-above-fv-p75");
    expect(result.positions[0]?.sellSignals).not.toContain("price-at-or-above-fv-median");
  });

  it("flags composite-below-universe-median when composite < median (and not in avoid)", () => {
    // 5 rows; median composite = 50. Held ABC at 30 → below median.
    // Each row needs a fair value (price < p25) so it doesn't fall
    // into diagnostic-avoid (no-FV) — that path was merged into Avoid
    // 2026-04-26 and would crowd out the bottom-decile-only signal
    // we're testing here.
    const rows = [
      makeRow({ symbol: "T1", composite: 90, price: 100, fairValue: fv(150) }),
      makeRow({ symbol: "T2", composite: 70, price: 100, fairValue: fv(150) }),
      makeRow({ symbol: "T3", composite: 50, price: 100, fairValue: fv(150) }),
      makeRow({ symbol: "ABC", composite: 30, price: 100, fairValue: fv(150) }),
      makeRow({ symbol: "T4", composite: 20, price: 100, fairValue: fv(150) }),
    ];
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "ABC", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    const result = evaluatePortfolio(portfolio, snapshot(rows));
    // ABC's composite (30) < median (50), and ABC is NOT in avoid
    // bucket (with avoidPercentile=0.1 of 5 = 1 → only T4 at 20 is
    // in avoid). So composite-below-universe-median fires.
    expect(result.positions[0]?.currentBucket).not.toBe("avoid");
    expect(result.positions[0]?.sellSignals).toContain("composite-below-universe-median");
  });

  it("handles missing position gracefully (symbol not in snapshot)", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "MISSING", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    const result = evaluatePortfolio(portfolio, snapshot([]));
    expect(result.positions[0]?.inSnapshot).toBe(false);
    expect(result.positions[0]?.currentPrice).toBeNull();
    expect(result.positions[0]?.pnlDollars).toBeNull();
    expect(result.positions[0]?.sellSignals).toEqual([]);
  });

  it("computes summary stats correctly across multiple positions", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "WIN", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
        { symbol: "LOSE", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
        { symbol: "GONE", entryDate: "2025-01-01", entryPrice: 100, sharesOwned: 10 },
      ],
    };
    const rows = [
      makeRow({ symbol: "WIN", composite: 80, price: 130 }),
      makeRow({ symbol: "LOSE", composite: 60, price: 80 }),
      // GONE not in snapshot
    ];
    const result = evaluatePortfolio(portfolio, snapshot(rows));
    expect(result.summary.totalPositions).toBe(3);
    expect(result.summary.positionsInSnapshot).toBe(2);
    expect(result.summary.aggregatePnlDollars).toBe(300 + -200); // 30*10 + (-20)*10
  });
});
