import { describe, it, expect } from "vitest";
import type { ContractQuote } from "@stockrank/core";
import { computeCallReturns, computePutReturns } from "./returns.js";

function call(strike: number, bid: number, daysToExpiry: number): ContractQuote {
  return {
    contractSymbol: `T${strike}C`,
    expiration: "2027-01-15",
    daysToExpiry,
    strike,
    bid,
    ask: bid + 0.1,
    lastPrice: bid,
    volume: 10,
    openInterest: 100,
    impliedVolatility: 0.4,
    inTheMoney: false,
  };
}

function put(strike: number, bid: number, daysToExpiry: number): ContractQuote {
  return {
    contractSymbol: `T${strike}P`,
    expiration: "2027-01-15",
    daysToExpiry,
    strike,
    bid,
    ask: bid + 0.1,
    lastPrice: bid,
    volume: 10,
    openInterest: 100,
    impliedVolatility: 0.4,
    inTheMoney: false,
  };
}

describe("computeCallReturns", () => {
  it("computes static return = (premium + dividends) / current price", () => {
    // P=100, K=110, bid=5, T=180, divPerShare=2/yr
    // expectedDividends = 2 * 180/365 = 0.9863
    // staticReturn$ = 5 + 0.9863 = 5.9863
    // staticReturn% = 5.9863 / 100 = 5.9863%
    const r = computeCallReturns({
      contract: call(110, 5, 180),
      currentPrice: 100,
      annualDividendPerShare: 2,
    });
    expect(r.staticReturnPct).toBeCloseTo(0.059863, 5);
    // annualized = 5.9863% × (365/180) = ~12.14%
    expect(r.staticAnnualizedPct).toBeCloseTo(0.121389, 5);
  });

  it("computes assigned return adding (K - P)", () => {
    // assignedReturn$ = 5 + 0.9863 + (110 - 100) = 15.9863
    // assignedReturn% = 15.9863 / 100 = 15.9863%
    const r = computeCallReturns({
      contract: call(110, 5, 180),
      currentPrice: 100,
      annualDividendPerShare: 2,
    });
    expect(r.assignedReturnPct).toBeCloseTo(0.159863, 5);
    expect(r.assignedAnnualizedPct).toBeCloseTo(0.324167, 5);
  });

  it("computes effective cost basis = currentPrice - bid", () => {
    const r = computeCallReturns({
      contract: call(110, 5, 180),
      currentPrice: 100,
      annualDividendPerShare: 2,
    });
    expect(r.effectiveCostBasis).toBe(95);
    expect(r.effectiveDiscountPct).toBeCloseTo(0.05, 5);
  });

  it("treats null bid as zero premium", () => {
    const c = call(110, 0, 180);
    c.bid = null;
    const r = computeCallReturns({
      contract: c,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(r.staticReturnPct).toBe(0);
    expect(r.assignedReturnPct).toBeCloseTo(0.10, 5);  // just (K-P)/P
    expect(r.effectiveCostBasis).toBe(100);
  });

  it("flags shortDated when daysToExpiry < 30", () => {
    const r = computeCallReturns({
      contract: call(110, 5, 14),
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(r.shortDated).toBe(true);
  });

  it("does NOT flag shortDated at exactly 30 days", () => {
    const r = computeCallReturns({
      contract: call(110, 5, 30),
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(r.shortDated).toBe(false);
  });

  it("zeros dividend term when annualDividendPerShare is 0", () => {
    const r = computeCallReturns({
      contract: call(110, 5, 180),
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    // staticReturn$ = 5 + 0 = 5, /100 = 5%
    expect(r.staticReturnPct).toBeCloseTo(0.05, 5);
    expect(r.assignedReturnPct).toBeCloseTo(0.15, 5);  // 5 + 10 = 15
  });
});

describe("computePutReturns", () => {
  it("computes premium / strike collateral when not assigned", () => {
    // K=90, bid=4, T=180
    // notAssignedReturn% = 4 / 90 = 4.44%
    const r = computePutReturns({
      contract: put(90, 4, 180),
      currentPrice: 100,
    });
    expect(r.notAssignedReturnPct).toBeCloseTo(4 / 90, 5);
    // annualized = 4.44% × (365/180) = ~9.01%
    expect(r.notAssignedAnnualizedPct).toBeCloseTo((4 / 90) * (365 / 180), 5);
  });

  it("computes effective cost basis = strike - bid; discount vs current price", () => {
    // K=90, bid=4, current=100
    // effectiveCostBasis = 86
    // effectiveDiscountPct = (100 - 86) / 100 = 14%
    const r = computePutReturns({
      contract: put(90, 4, 180),
      currentPrice: 100,
    });
    expect(r.effectiveCostBasis).toBe(86);
    expect(r.effectiveDiscountPct).toBeCloseTo(0.14, 5);
  });

  it("propagates inTheMoney flag from contract", () => {
    const c = put(105, 8, 180);   // strike above current=100 → ITM
    c.inTheMoney = true;
    const r = computePutReturns({ contract: c, currentPrice: 100 });
    expect(r.inTheMoney).toBe(true);
    // ITM put: effectiveCostBasis = 105 - 8 = 97; discount = 3% from 100
    expect(r.effectiveCostBasis).toBe(97);
    expect(r.effectiveDiscountPct).toBeCloseTo(0.03, 5);
  });

  it("treats null bid as zero premium", () => {
    const c = put(90, 0, 180);
    c.bid = null;
    const r = computePutReturns({ contract: c, currentPrice: 100 });
    expect(r.notAssignedReturnPct).toBe(0);
    expect(r.effectiveCostBasis).toBe(90);
  });

  it("flags shortDated when daysToExpiry < 30", () => {
    const r = computePutReturns({
      contract: put(90, 4, 21),
      currentPrice: 100,
    });
    expect(r.shortDated).toBe(true);
  });
});
