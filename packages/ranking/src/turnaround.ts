import type { CompanySnapshot } from "@stockrank/core";
import { periodAverage } from "./factors.js";
import type { TurnaroundReason, TurnaroundRow } from "./types.js";

const LONG_TERM_ROIC_THRESHOLD = 0.12;
const DEEP_DRAWDOWN_THRESHOLD = 40; // pctOffYearHigh ≥ 40
const TROUGH_RATIO_THRESHOLD = 0.5; // TTM EPS < 50% of 5Y avg

/**
 * Tests a company against the turnaround criteria (ranking.md §7).
 * Returns null if the company doesn't qualify; returns a row with the
 * reasons it does qualify otherwise.
 */
export function evaluateTurnaround(company: CompanySnapshot): TurnaroundRow | null {
  const reasons: TurnaroundReason[] = [];

  // 1. Long-term track record
  const longTermRoic = periodAverage(company.annual, (p) => p.ratios.roic, 10);
  if (longTermRoic !== null && longTermRoic > LONG_TERM_ROIC_THRESHOLD) {
    reasons.push("longTermQuality");
  }

  // 2. Currently in TTM trough — TTM net income loss OR TTM EPS deeply below
  // the 5-year average EPS.
  const recent = company.annual[0];
  const recentNi = recent?.income.netIncome;
  const inLossNow = recentNi !== null && recentNi !== undefined && recentNi < 0;

  const recentEps = recent?.income.epsDiluted ?? null;
  const avgEps5Y = periodAverage(company.annual, (p) => p.income.epsDiluted, 5);
  let trough = false;
  let epsRelativeRatio: number | null = null;

  if (inLossNow) {
    trough = true;
  } else if (
    recentEps !== null &&
    avgEps5Y !== null &&
    avgEps5Y > 0
  ) {
    epsRelativeRatio = recentEps / avgEps5Y;
    if (epsRelativeRatio < TROUGH_RATIO_THRESHOLD) trough = true;
  }
  if (trough) reasons.push("ttmTrough");

  // 3. Deep drawdown
  if (company.pctOffYearHigh >= DEEP_DRAWDOWN_THRESHOLD) {
    reasons.push("deepDrawdown");
  }

  // Must hit all three lanes per ranking.md §7
  const passed =
    reasons.includes("longTermQuality") &&
    reasons.includes("ttmTrough") &&
    reasons.includes("deepDrawdown");

  if (!passed) return null;

  return {
    symbol: company.symbol,
    name: company.name,
    industry: company.industry,
    marketCap: company.marketCap,
    price: company.quote.price,
    pctOffYearHigh: company.pctOffYearHigh,
    pctAboveYearLow: company.pctAboveYearLow ?? 0,
    reasons,
    longTermAvgRoic: longTermRoic,
    ttmEpsRelativeTo5YAvg: epsRelativeRatio,
    fairValue: null,
  };
}
