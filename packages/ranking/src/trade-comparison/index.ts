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
 * Default Fidelity SPAXX (government money market) annualized yield.
 * Used as a fallback when the caller doesn't supply `spaxxRate`. The
 * web UI lets the user override this via a small input in the
 * options-panel header (persisted in localStorage), so this constant
 * really only matters for tests and the standalone CLI.
 */
export const SPAXX_RATE = 0.033;   // 3.3% as of 2026-04-21

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

/**
 * Buy-write: open a new long-stock position and sell a call against
 * it in a single transaction. The premium discounts the purchase
 * (cost basis = P − bid), so the bid is "consumed" at entry and is
 * not separately held in cash — no SPAXX accrues on it. ROI uses
 * the net cash withdrawn (P − bid) as the denominator.
 */
function buyWriteLeg(input: ComputeInput, fv: number): TradeLeg | null {
  if (!input.call) return null;
  const { currentPrice: P, daysToExpiry: T, annualDividendPerShare: D } = input;
  const { strike: K, bid } = input.call;
  const assigned = fv >= K;
  const stockPnl = assigned ? K - P : fv - P;
  const dividendPnl = D * (T / 365);
  const totalPnl = stockPnl + dividendPnl + bid;
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

/**
 * Covered call: stock is already owned at entry. No new capital is
 * deployed — the share's current market value (P) stands in as the
 * opportunity-cost denominator, since you could have sold and
 * reallocated. Premium received at T=0 is fresh cash that sits in
 * SPAXX for the holding period.
 */
function coveredCallLeg(input: ComputeInput, fv: number): TradeLeg | null {
  if (!input.call) return null;
  const { currentPrice: P, daysToExpiry: T, annualDividendPerShare: D } = input;
  const { strike: K, bid } = input.call;
  const r = input.spaxxRate ?? SPAXX_RATE;
  const assigned = fv >= K;
  const stockPnl = assigned ? K - P : fv - P;
  const dividendPnl = D * (T / 365);
  const spaxxPnl = bid * r * (T / 365);
  const totalPnl = stockPnl + dividendPnl + bid + spaxxPnl;
  const initialCapital = P;
  const roi = initialCapital > 0 ? totalPnl / initialCapital : 0;
  return {
    initialCapital,
    stockPnl,
    dividendPnl,
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

function cashSecuredPutLeg(input: ComputeInput, fv: number): TradeLeg | null {
  if (!input.put) return null;
  const { daysToExpiry: T } = input;
  const { strike: K, bid } = input.put;
  const r = input.spaxxRate ?? SPAXX_RATE;
  const assigned = fv < K;
  // No stock during the period; if assigned, we now own at K and the
  // stock is worth fv (the projected end price).
  const stockPnl = assigned ? fv - K : 0;
  // Both the K cash collateral AND the bid premium received at T=0
  // sit in SPAXX for the full holding period — assignment (if any)
  // happens at expiration in this hold-to-expiry model, so the
  // collateral conversion to stock is a T-day event. The premium is
  // free cash from the moment the put is sold.
  const spaxxPnl = (K + bid) * r * (T / 365);
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
      buyWrite: buyWriteLeg(input, fv),
      coveredCall: coveredCallLeg(input, fv),
      cashSecuredPut: cashSecuredPutLeg(input, fv),
      holdCashSpaxx: holdCashLeg(input),
    },
  };
}
