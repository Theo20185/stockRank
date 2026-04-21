import { describe, it, expect } from "vitest";
import { computeTradeComparison, SPAXX_RATE } from "./index.js";

const BASE = {
  symbol: "TEST",
  expiration: "2027-01-15",
  daysToExpiry: 270,
  currentPrice: 100,
  annualDividendPerShare: 2,    // 2% on a $100 stock
  fairValue: { p25: 95, median: 120, p75: 150 },
  call: { strike: 110, bid: 8 },
  put: { strike: 95, bid: 5 },
} as const;

describe("computeTradeComparison — buy outright", () => {
  it("computes stock + dividend P&L at the projected end price (median scenario)", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median" });
    const t = result.trades.buyOutright;
    // FV = 120, P = 100 → stock = 20
    // Dividend = 2 × 270/365 = 1.4795
    expect(t.stockPnl).toBe(20);
    expect(t.dividendPnl).toBeCloseTo(1.4795, 3);
    expect(t.totalPnl).toBeCloseTo(21.4795, 3);
    expect(t.initialCapital).toBe(100);
    expect(t.roi).toBeCloseTo(0.21479, 4);
    expect(t.roiAnnualized).toBeCloseTo(0.29036, 4);
  });

  it("flat scenario produces only the dividend yield", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "flat" });
    const t = result.trades.buyOutright;
    expect(t.stockPnl).toBe(0);
    expect(t.dividendPnl).toBeCloseTo(1.4795, 3);
    expect(t.totalPnl).toBeCloseTo(1.4795, 3);
  });
});

describe("computeTradeComparison — covered call", () => {
  it("median scenario — call assigns at strike, capital is P minus bid", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median" });
    const t = result.trades.coveredCall!;
    // FV 120 ≥ K 110 → assigned at K=110
    // stock = 110 - 100 = 10 (capped at K)
    // dividend = 1.4795
    // premium = 8
    // SPAXX on premium = 8 × SPAXX_RATE × 270/365
    const spaxx = 8 * SPAXX_RATE * (270 / 365);
    const expectedTotal = 10 + 1.4795 + 8 + spaxx;
    expect(t.assigned).toBe(true);
    expect(t.stockPnl).toBe(10);
    expect(t.dividendPnl).toBeCloseTo(1.4795, 3);
    expect(t.premiumPnl).toBe(8);
    expect(t.spaxxPnl).toBeCloseTo(spaxx, 3);
    expect(t.totalPnl).toBeCloseTo(expectedTotal, 3);
    expect(t.initialCapital).toBe(92);
  });

  it("premium received earns SPAXX while it sits in cash", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median", spaxxRate: 0.10 });
    const t = result.trades.coveredCall!;
    // bid 8 × 0.10 × 270/365 ≈ 0.5918
    expect(t.spaxxPnl).toBeCloseTo(8 * 0.10 * (270 / 365), 4);
  });

  it("flat scenario — call expires worthless, keep stock + premium + dividend", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "flat" });
    const t = result.trades.coveredCall!;
    // FV=100=P → not assigned (FV < K=110)
    const spaxx = 8 * SPAXX_RATE * (270 / 365);
    expect(t.assigned).toBe(false);
    expect(t.stockPnl).toBe(0);
    expect(t.premiumPnl).toBe(8);
    expect(t.totalPnl).toBeCloseTo(0 + 1.4795 + 8 + spaxx, 3);
  });

  it("returns null when no call is supplied", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median", call: null });
    expect(result.trades.coveredCall).toBeNull();
  });
});

describe("computeTradeComparison — cash-secured put", () => {
  it("median scenario — put expires worthless, premium + SPAXX on collateral AND premium", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median" });
    const t = result.trades.cashSecuredPut!;
    // FV 120 ≥ Kp 95 → not assigned. stockPnl = 0.
    // SPAXX accrues on K + bid = 95 + 5 = 100 for the period.
    const spaxx = (95 + 5) * SPAXX_RATE * (270 / 365);
    expect(t.assigned).toBe(false);
    expect(t.stockPnl).toBe(0);
    expect(t.premiumPnl).toBe(5);
    expect(t.spaxxPnl).toBeCloseTo(spaxx, 3);
    expect(t.totalPnl).toBeCloseTo(5 + spaxx, 3);
    expect(t.initialCapital).toBe(95);
  });

  it("p25 scenario — put assigns at strike, stock leg captures FV minus K", () => {
    // Use a fair value where p25 < put strike to force assignment.
    const result = computeTradeComparison({
      ...BASE,
      scenario: "p25",
      fairValue: { p25: 80, median: 100, p75: 120 },
    });
    const t = result.trades.cashSecuredPut!;
    // FV 80 < Kp 95 → assigned. stockPnl = 80 - 95 = -15.
    // SPAXX still on K + bid (assignment is at expiration).
    const spaxx = (95 + 5) * SPAXX_RATE * (270 / 365);
    expect(t.assigned).toBe(true);
    expect(t.stockPnl).toBe(-15);
    expect(t.premiumPnl).toBe(5);
    expect(t.spaxxPnl).toBeCloseTo(spaxx, 3);
  });

  it("returns null when no put is supplied", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median", put: null });
    expect(result.trades.cashSecuredPut).toBeNull();
  });
});

describe("computeTradeComparison — hold cash (SPAXX)", () => {
  it("computes interest on the equivalent stock notional", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median" });
    const t = result.trades.holdCashSpaxx;
    // SPAXX = 100 × 0.045 × 270/365 = 3.3287
    expect(t.spaxxPnl).toBeCloseTo(100 * SPAXX_RATE * (270 / 365), 3);
    expect(t.totalPnl).toBeCloseTo(t.spaxxPnl, 3);
    expect(t.initialCapital).toBe(100);
    expect(t.roiAnnualized).toBeCloseTo(SPAXX_RATE, 4);
  });
});

describe("computeTradeComparison — full output", () => {
  it("populates the projected end case + price + spaxx rate", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median" });
    expect(result.projectedEndCase).toBe("median");
    expect(result.projectedEndPrice).toBe(120);
    expect(result.spaxxRate).toBe(SPAXX_RATE);
    expect(result.symbol).toBe("TEST");
  });

  it("respects an injected spaxxRate", () => {
    const result = computeTradeComparison({ ...BASE, scenario: "median", spaxxRate: 0.06 });
    expect(result.spaxxRate).toBe(0.06);
    // SPAXX = 100 × 0.06 × 270/365
    expect(result.trades.holdCashSpaxx.spaxxPnl).toBeCloseTo(100 * 0.06 * (270 / 365), 3);
  });
});
