import { describe, it, expect } from "vitest";
import type {
  CashPosition,
  OptionPosition,
  Portfolio,
  StockPosition,
} from "@stockrank/core";
import type { RankedRow, RankedSnapshot } from "../types.js";
import { evaluatePortfolio } from "./evaluator.js";
import type { FairValue } from "../fair-value/types.js";

function fv(median: number): FairValue {
  return {
    peerSet: "cohort",
    peerCount: 8,
    anchors: {
      peerMedianPE: median, peerMedianEVEBITDA: median, peerMedianPFCF: median,
      ownHistoricalPE: median, ownHistoricalEVEBITDA: median, ownHistoricalPFCF: median,
      normalizedPE: median, normalizedEVEBITDA: median, normalizedPFCF: median,
    },
    range: { p25: median * 0.8, median, p75: median * 1.2 },
    current: 50,
    upsideToP25Pct: 0,
    upsideToMedianPct: 50,
    confidence: "high",
    ttmTreatment: "ttm",
    ebitdaTreatment: "ttm",
    peerCohortDivergent: false,
  };
}

function makeRow(overrides: Partial<RankedRow> & {
  symbol: string;
  composite: number;
  price: number;
}): RankedRow {
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

function snapshot(rows: RankedRow[], snapshotDate = "2026-04-26"): RankedSnapshot {
  return {
    snapshotDate,
    weights: {
      valuation: 0.5, health: 0.2, quality: 0.1,
      shareholderReturn: 0.1, growth: 0.1, momentum: 0,
    },
    universeSize: rows.length,
    excludedCount: 0,
    rows,
    ineligibleRows: [],
  };
}

function stock(o: Partial<StockPosition> & { symbol: string; shares: number; costBasis: number }): StockPosition {
  return {
    kind: "stock",
    id: o.id ?? `stk_${o.symbol}`,
    entryDate: o.entryDate ?? "2025-01-01",
    notes: o.notes,
    symbol: o.symbol,
    shares: o.shares,
    costBasis: o.costBasis,
  };
}

function option(o: Partial<OptionPosition> & {
  symbol: string;
  optionType: "call" | "put";
  contracts: number;
  strike: number;
  expiration: string;
  premium: number;
}): OptionPosition {
  return {
    kind: "option",
    id: o.id ?? `opt_${o.symbol}_${o.optionType}_${o.strike}`,
    entryDate: o.entryDate ?? "2026-01-15",
    notes: o.notes,
    symbol: o.symbol,
    optionType: o.optionType,
    contracts: o.contracts,
    strike: o.strike,
    expiration: o.expiration,
    premium: o.premium,
    pairedStockId: o.pairedStockId,
  };
}

function cash(o: Partial<CashPosition> & { symbol: string; amount: number; yieldPct: number }): CashPosition {
  return {
    kind: "cash",
    id: o.id ?? `cash_${o.symbol}`,
    entryDate: o.entryDate ?? "2026-01-01",
    notes: o.notes,
    symbol: o.symbol,
    amount: o.amount,
    yieldPct: o.yieldPct,
  };
}

describe("evaluatePortfolio — stock positions", () => {
  it("computes mark-to-market P&L from costBasis (not entryPrice)", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [stock({ symbol: "ABC", shares: 50, costBasis: 5000 })], // $100/share basis
    };
    const snap = snapshot([makeRow({ symbol: "ABC", composite: 80, price: 130 })]);
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    expect(e.kind).toBe("stock");
    if (e.kind !== "stock") return;
    expect(e.marketValue).toBe(6500); // 130 * 50
    expect(e.unrealizedPnlDollars).toBe(1500); // 6500 - 5000
    expect(e.unrealizedPnlPct).toBe(30);
  });

  it("flags in-avoid-bucket sell signal when held stock falls into bottom decile", () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeRow({ symbol: `T${i}`, composite: 90 - i * 2, price: 100, fairValue: fv(150) }),
      ),
      makeRow({ symbol: "ABC", composite: 10, price: 120, fairValue: fv(150) }),
      makeRow({ symbol: "BOTTOM", composite: 5, price: 100, fairValue: fv(150) }),
    ];
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [stock({ symbol: "ABC", shares: 10, costBasis: 1000 })],
    };
    const result = evaluatePortfolio(portfolio, snapshot(rows));
    const e = result.positions[0]!;
    if (e.kind !== "stock") throw new Error("expected stock");
    expect(e.currentBucket).toBe("avoid");
    expect(e.sellSignals).toContain("in-avoid-bucket");
  });

  it("handles missing position gracefully (symbol not in snapshot)", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [stock({ symbol: "MISSING", shares: 10, costBasis: 1000 })],
    };
    const result = evaluatePortfolio(portfolio, snapshot([]));
    const e = result.positions[0]!;
    if (e.kind !== "stock") throw new Error("expected stock");
    expect(e.inSnapshot).toBe(false);
    expect(e.currentPrice).toBeNull();
    expect(e.marketValue).toBeNull();
    expect(e.unrealizedPnlDollars).toBeNull();
    expect(e.sellSignals).toEqual([]);
  });
});

describe("evaluatePortfolio — option positions", () => {
  const expiration = "2026-06-19";
  const snapshotDate = "2026-04-26"; // 54 days before expiry

  it("long call: cashAtEntry is negative (paid premium); intrinsic at current spot is computed", () => {
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: 1,
      strike: 200,
      expiration,
      premium: 350,
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [opt] };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 220 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "option") throw new Error("expected option");
    expect(e.cashAtEntry).toBe(-350);
    expect(e.intrinsicPerShare).toBe(20); // 220 - 200
    expect(e.intrinsicDollars).toBe(2000); // 20 × 100 × 1
    expect(e.daysToExpiration).toBe(54);
    expect(e.isExpired).toBe(false);
    expect(e.annualizedPremiumYield).toBeNull(); // long has no collateral
  });

  it("short call (covered) annualizes premium yield against paired stock cost basis", () => {
    const stk = stock({ symbol: "AAPL", shares: 100, costBasis: 18000 });
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: -1,
      strike: 200,
      expiration,
      premium: 600,
      pairedStockId: stk.id,
    });
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [stk, opt],
    };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 195 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const optEval = result.positions[1]!;
    if (optEval.kind !== "option") throw new Error("expected option");
    expect(optEval.cashAtEntry).toBe(600); // received premium
    expect(optEval.paired).toBe(true);
    expect(optEval.pairedStock?.id).toBe(stk.id);
    // Yield: 600 / 18000 × 365 / 54 × 100 ≈ 22.53%
    expect(optEval.annualizedPremiumYield).toBeCloseTo(22.53, 1);
  });

  it("cash-secured short put annualizes premium yield against strike × 100 × |contracts|", () => {
    const opt = option({
      symbol: "AAPL",
      optionType: "put",
      contracts: -2,
      strike: 180,
      expiration,
      premium: 400,
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [opt] };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 195 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "option") throw new Error("expected option");
    // Collateral: 180 × 100 × 2 = 36000
    // Yield: 400 / 36000 × 365 / 54 × 100 ≈ 7.51%
    expect(e.annualizedPremiumYield).toBeCloseTo(7.51, 1);
  });

  it("expired option flagged with isExpired=true and null yield", () => {
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: -1,
      strike: 200,
      expiration: "2026-04-01", // before snapshotDate
      premium: 300,
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [opt] };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 195 })],
      "2026-04-26",
    );
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "option") throw new Error("expected option");
    expect(e.isExpired).toBe(true);
    expect(e.daysToExpiration).toBeLessThan(0);
    expect(e.annualizedPremiumYield).toBeNull();
  });

  it("milestones: long call OTM at expiry → loses full premium", () => {
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: 1,
      strike: 250,
      expiration,
      premium: 200,
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [opt] };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 220 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "option") throw new Error("expected option");
    const otm = e.milestones.find((m) => m.scenario === "expires-otm");
    expect(otm?.optionPnl).toBe(-200);
  });

  it("milestones: short call called-away scenario shows premium minus assignment intrinsic", () => {
    // Short call strike $200, premium $600. At-strike scenario:
    // intrinsic = 0, so option leg = +600 (full premium kept).
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: -1,
      strike: 200,
      expiration,
      premium: 600,
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [opt] };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 195 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "option") throw new Error("expected option");
    const called = e.milestones.find((m) => m.scenario === "called-away");
    expect(called?.optionPnl).toBe(600);
  });

  it("milestones: covered call combinedPnl includes stock leg at strike", () => {
    const stk = stock({ symbol: "AAPL", shares: 100, costBasis: 18000 }); // $180/share basis
    const opt = option({
      symbol: "AAPL",
      optionType: "call",
      contracts: -1,
      strike: 200,
      expiration,
      premium: 600,
      pairedStockId: stk.id,
    });
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [stk, opt],
    };
    const snap = snapshot(
      [makeRow({ symbol: "AAPL", composite: 70, price: 195 })],
      snapshotDate,
    );
    const result = evaluatePortfolio(portfolio, snap);
    const optEval = result.positions[1]!;
    if (optEval.kind !== "option") throw new Error("expected option");
    const called = optEval.milestones.find((m) => m.scenario === "called-away")!;
    // At strike $200: stock realized = (200-180)*100 = 2000.
    // Option = +600. Combined = 2600.
    expect(called.combinedPnl).toBe(2600);
  });
});

describe("evaluatePortfolio — cash positions", () => {
  it("accrues simple interest from entryDate to snapshot date", () => {
    const c = cash({
      symbol: "SPAXX",
      amount: 10000,
      yieldPct: 4.85,
      entryDate: "2026-01-01",
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [c] };
    const snap = snapshot([], "2026-04-26"); // 115 days later
    const result = evaluatePortfolio(portfolio, snap);
    const e = result.positions[0]!;
    if (e.kind !== "cash") throw new Error("expected cash");
    expect(e.daysHeld).toBe(115);
    // 10000 × 0.0485 × 115/365 ≈ 152.81
    expect(e.accruedInterest).toBeCloseTo(152.81, 1);
    expect(e.currentValue).toBeCloseTo(10152.81, 1);
  });

  it("rolls cash into totalMarketValue and aggregateAccruedInterest summary", () => {
    const c = cash({
      symbol: "BIL",
      amount: 5000,
      yieldPct: 4.5,
      entryDate: "2026-01-01",
    });
    const portfolio: Portfolio = { updatedAt: "2026-04-26T00:00:00Z", positions: [c] };
    const result = evaluatePortfolio(portfolio, snapshot([], "2026-04-26"));
    expect(result.summary.cashPositions).toBe(1);
    expect(result.summary.aggregateAccruedInterest).toBeCloseTo(70.89, 1); // 5000 × 0.045 × 115/365
    expect(result.summary.totalMarketValue).toBeCloseTo(5070.89, 1);
  });
});

describe("evaluatePortfolio — summary aggregation", () => {
  it("counts each position type and sums market value across types", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        stock({ symbol: "AAPL", shares: 10, costBasis: 1500 }),
        stock({ symbol: "MSFT", shares: 5, costBasis: 2000 }),
        option({
          symbol: "AAPL",
          optionType: "call",
          contracts: -1,
          strike: 200,
          expiration: "2026-06-19",
          premium: 300,
        }),
        cash({ symbol: "SPAXX", amount: 5000, yieldPct: 4.85, entryDate: "2026-01-01" }),
      ],
    };
    const snap = snapshot(
      [
        makeRow({ symbol: "AAPL", composite: 70, price: 180 }), // intrinsic = 0
        makeRow({ symbol: "MSFT", composite: 70, price: 440 }),
      ],
      "2026-04-26",
    );
    const result = evaluatePortfolio(portfolio, snap);
    expect(result.summary.stockPositions).toBe(2);
    expect(result.summary.optionPositions).toBe(1);
    expect(result.summary.cashPositions).toBe(1);
    expect(result.summary.stocksInSnapshot).toBe(2);
  });
});
