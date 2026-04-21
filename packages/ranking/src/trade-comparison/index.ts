/**
 * Pure P&L projection across the four trade types per
 * docs/specs/trade-comparison.md. No I/O, no clock.
 */

import type {
  ProjectedEndCase,
  TradeComparison,
  TradeLeg,
} from "./types.js";

export type { ProjectedEndCase, TradeComparison, TradeLeg, TradeKey } from "./types.js";

/**
 * Fidelity SPAXX (government money market) annualized yield. Drifts
 * with the short end of the curve — bump this when it moves enough to
 * matter. Spec §4 lays out alternatives if/when this becomes
 * inadequate.
 */
export const SPAXX_RATE = 0.045;   // 4.5% as of 2026-04

export type ComputeInput = {
  symbol: string;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  /** Annual $ dividend per share (= ttm.dividendYield × P). */
  annualDividendPerShare: number;
  fairValue: { p25: number; median: number; p75: number };
  scenario: ProjectedEndCase;
  /** Override SPAXX rate. Useful for tests + UI sliders. */
  spaxxRate?: number;
  call?: { strike: number; bid: number } | null;
  put?: { strike: number; bid: number } | null;
};

function projectedEndPriceFor(
  case_: ProjectedEndCase,
  fv: { p25: number; median: number; p75: number },
  current: number,
): number {
  if (case_ === "p25") return fv.p25;
  if (case_ === "flat") return current;
  return fv.median;
}

function annualize(returnFrac: number, days: number): number {
  if (days <= 0) return 0;
  return returnFrac * (365 / days);
}

/**
 * Projected total return for buying and holding the stock through the
 * options expiration date.
 */
function buyOutrightLeg(input: ComputeInput, fv: number): TradeLeg {
  const { currentPrice: P, daysToExpiry: T, annualDividendPerShare: D } = input;
  const stockPnl = fv - P;
  const dividendPnl = D * (T / 365);
  const totalPnl = stockPnl + dividendPnl;
  const roi = P > 0 ? totalPnl / P : 0;
  return {
    initialCapital: P,
    stockPnl,
    dividendPnl,
    premiumPnl: 0,
    spaxxPnl: 0,
    totalPnl,
    roi,
    roiAnnualized: annualize(roi, T),
  };
}

function coveredCallLeg(input: ComputeInput, fv: number): TradeLeg | null {
  if (!input.call) return null;
  const { currentPrice: P, daysToExpiry: T, annualDividendPerShare: D } = input;
  const { strike: K, bid } = input.call;
  const assigned = fv >= K;
  const stockPnl = assigned ? K - P : fv - P;
  const dividendPnl = D * (T / 365);
  const totalPnl = stockPnl + dividendPnl + bid;
  // Effective cost basis after collecting the premium up-front.
  const initialCapital = P - bid;
  const roi = initialCapital > 0 ? totalPnl / initialCapital : 0;
  return {
    initialCapital,
    stockPnl,
    dividendPnl,
    premiumPnl: bid,
    spaxxPnl: 0,
    totalPnl,
    roi,
    roiAnnualized: annualize(roi, T),
    assigned,
    strike: K,
    bid,
  };
}

function cashSecuredPutLeg(input: ComputeInput, fv: number): TradeLeg | null {
  if (!input.put) return null;
  const { daysToExpiry: T } = input;
  const { strike: K, bid } = input.put;
  const r = input.spaxxRate ?? SPAXX_RATE;
  const assigned = fv < K;
  // No stock during the period; if assigned, we now own at K and the
  // stock is worth fv (the projected end price).
  const stockPnl = assigned ? fv - K : 0;
  // Cash collateral sits in SPAXX for the full period whether assigned
  // or not (assignment happens at expiration in this hold-to-expiry
  // model). Spec §2 trade 3.
  const spaxxPnl = K * r * (T / 365);
  const totalPnl = stockPnl + bid + spaxxPnl;
  const roi = K > 0 ? totalPnl / K : 0;
  return {
    initialCapital: K,
    stockPnl,
    dividendPnl: 0,
    premiumPnl: bid,
    spaxxPnl,
    totalPnl,
    roi,
    roiAnnualized: annualize(roi, T),
    assigned,
    strike: K,
    bid,
  };
}

function holdCashLeg(input: ComputeInput): TradeLeg {
  const { currentPrice: P, daysToExpiry: T } = input;
  const r = input.spaxxRate ?? SPAXX_RATE;
  const spaxxPnl = P * r * (T / 365);
  return {
    initialCapital: P,
    stockPnl: 0,
    dividendPnl: 0,
    premiumPnl: 0,
    spaxxPnl,
    totalPnl: spaxxPnl,
    roi: P > 0 ? spaxxPnl / P : 0,
    roiAnnualized: annualize(P > 0 ? spaxxPnl / P : 0, T),
  };
}

export function computeTradeComparison(input: ComputeInput): TradeComparison {
  const fv = projectedEndPriceFor(input.scenario, input.fairValue, input.currentPrice);
  return {
    symbol: input.symbol,
    expiration: input.expiration,
    daysToExpiry: input.daysToExpiry,
    currentPrice: input.currentPrice,
    projectedEndPrice: fv,
    projectedEndCase: input.scenario,
    spaxxRate: input.spaxxRate ?? SPAXX_RATE,
    trades: {
      buyOutright: buyOutrightLeg(input, fv),
      coveredCall: coveredCallLeg(input, fv),
      cashSecuredPut: cashSecuredPutLeg(input, fv),
      holdCashSpaxx: holdCashLeg(input),
    },
  };
}
