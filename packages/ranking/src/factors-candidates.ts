import type { AnnualPeriod, CompanySnapshot } from "@stockrank/core";
import type { FactorDef } from "./factors.js";
import {
  chooseEbitdaForAnchor,
  chooseEpsForPeerAnchor,
} from "./fair-value/anchors.js";

/**
 * Candidate factors (2026-11-02, engine-gaps §3.2 + the academic-lit
 * translation). Computed alongside FACTORS for the IC and
 * weight-validation harnesses; NOT part of the production composite —
 * adoption is gated by the frozen rules in ranking.md ("candidate
 * factors" section). Two families:
 *
 * 1. Normalized variants of the spike-contaminated factors. The EIX
 *    FY2025 wildfire settlement inflates raw ROIC / interest coverage
 *    / net-debt-to-EBITDA / 7Y EPS CAGR / trailing multiples all at
 *    once (one-time-spike audit); the FV anchors have normalized
 *    since 2026-04 while the factors still eat the spike (EIX ranked
 *    #2 overall with valuation 100 on 2026-11-02). Variants reuse the
 *    exact anchor-layer guards (1.5× prior-3y, forward corroboration
 *    for EPS, baseline-collapse branch) so one set of frozen
 *    primitives governs both layers.
 *
 * 2. New factors from the academic-lit translation: gross
 *    profitability (Novy-Marx GP/A), gross-margin trend, and the
 *    deliberately-simplest Frankel-Lee residual-income V/P.
 */

const TTM_OUTLIER_RATIO = 1.5; // mirrors fair-value/anchors.ts

function nz(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

/** Cycle-average EBIT over ≤7y (all non-null years, losses included) —
 * the baseline-collapse denominator, mirroring normalizedEbitda's
 * fallback arm. */
function cycleAverageEbit(periods: AnnualPeriod[]): number | null {
  const vals = periods
    .slice(0, 7)
    .map((p) => p.income.ebit)
    .filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/**
 * Spike-guarded EBIT — chooseEbitdaForAnchor's exact shape applied to
 * the EBIT series (no forward signal exists for EBIT either):
 * recent = annual[0], baseline = positive EBITs of annual[1..3];
 * spike > 1.5× baseline mean → prior mean; loss-emptied baseline →
 * cycle-average comparison (the NEM branch).
 */
export function chooseEbitForFactor(snapshot: CompanySnapshot): number | null {
  const recent = nz(snapshot.annual[0]?.income.ebit);
  if (recent === null) return null;

  const windowEbit = snapshot.annual
    .slice(1, 4)
    .map((p) => p.income.ebit)
    .filter((v): v is number => v !== null);
  const priorEbit = windowEbit.filter((v) => v > 0);

  if (priorEbit.length < 2) {
    if (windowEbit.length >= 2 && recent > 0) {
      const cycleAverage = cycleAverageEbit(snapshot.annual);
      if (
        cycleAverage !== null &&
        recent > Math.max(cycleAverage, 0) * TTM_OUTLIER_RATIO
      ) {
        return cycleAverage;
      }
    }
    return recent;
  }

  const priorMean = priorEbit.reduce((s, v) => s + v, 0) / priorEbit.length;
  if (recent <= priorMean * TTM_OUTLIER_RATIO) return recent;
  return priorMean;
}

/** Net debt from the most recent annual balance (point-in-time). */
function netDebtFromAnnual(snapshot: CompanySnapshot): number | null {
  const b = snapshot.annual[0]?.balance;
  if (!b) return null;
  if (b.totalDebt === null || b.cash === null) return null;
  return b.totalDebt - b.cash;
}

/**
 * 7Y EPS CAGR with 3-year-average endpoints (the one-time-spike
 * audit's fix shape): end = mean(eps[0..2]), start = mean(eps[4..6]),
 * midpoints 4 years apart. A spiked endpoint year moves a 3y average
 * by a third instead of setting the CAGR outright.
 */
export function epsCagrNormalizedEndpoints(
  snapshot: CompanySnapshot,
): number | null {
  const eps = (i: number): number | null =>
    nz(snapshot.annual[i]?.income.epsDiluted);
  const mean3 = (from: number): number | null => {
    const vals = [eps(from), eps(from + 1), eps(from + 2)].filter(
      (v): v is number => v !== null,
    );
    if (vals.length < 2) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const end = mean3(0);
  const start = mean3(4);
  if (end === null || start === null) return null;
  if (end <= 0 || start <= 0) return null;
  return Math.pow(end / start, 1 / 4) - 1;
}

/** Frankel-Lee residual income, deliberately simplest form:
 * V = B0 × ROE / r (no-growth RI perpetuity), ROE = 3y mean of
 * NI/equity (equity > 0 years), r = 0.10 fixed. Factor = V/P.
 * Refinements only via the harness. */
export function residualIncomeVP(snapshot: CompanySnapshot): number | null {
  const COST_OF_EQUITY = 0.1;
  const b = snapshot.annual[0]?.balance;
  const shares = nz(snapshot.annual[0]?.income.sharesDiluted);
  if (!b || b.totalEquity === null || b.totalEquity <= 0) return null;
  if (shares === null || shares <= 0) return null;
  const roes: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ni = nz(snapshot.annual[i]?.income.netIncome);
    const eq = nz(snapshot.annual[i]?.balance.totalEquity);
    if (ni === null || eq === null || eq <= 0) continue;
    roes.push(ni / eq);
  }
  if (roes.length < 2) return null;
  const roe = roes.reduce((s, v) => s + v, 0) / roes.length;
  if (roe <= 0) return null;
  const b0PerShare = b.totalEquity / shares;
  const vPerShare = (b0PerShare * roe) / COST_OF_EQUITY;
  const price = snapshot.quote.price;
  if (price <= 0) return null;
  return vPerShare / price;
}

/** Novy-Marx gross profitability: grossProfit / totalAssets. */
export function grossProfitability(snapshot: CompanySnapshot): number | null {
  const gp = nz(snapshot.annual[0]?.income.grossProfit);
  const ta = nz(snapshot.annual[0]?.balance.totalAssets);
  if (gp === null || ta === null || ta <= 0) return null;
  return gp / ta;
}

/** Gross-margin trend: margin[0] − mean(margin[1..3]). */
export function grossMarginTrend(snapshot: CompanySnapshot): number | null {
  const margin = (i: number): number | null => {
    const gp = nz(snapshot.annual[i]?.income.grossProfit);
    const rev = nz(snapshot.annual[i]?.income.revenue);
    if (gp === null || rev === null || rev <= 0) return null;
    return gp / rev;
  };
  const current = margin(0);
  if (current === null) return null;
  const priors = [margin(1), margin(2), margin(3)].filter(
    (v): v is number => v !== null,
  );
  if (priors.length < 2) return null;
  return current - priors.reduce((s, v) => s + v, 0) / priors.length;
}

export const CANDIDATE_FACTORS: FactorDef[] = [
  // ---- normalized variants ----
  {
    key: "peRatioNormalized",
    category: "valuation",
    direction: "lower",
    extract: (s) => {
      const eps = chooseEpsForPeerAnchor(s).eps;
      if (eps === null || eps <= 0 || s.quote.price <= 0) return null;
      return s.quote.price / eps;
    },
  },
  {
    key: "evToEbitdaNormalized",
    category: "valuation",
    direction: "lower",
    extract: (s) => {
      const ebitda = chooseEbitdaForAnchor(s).ebitda;
      const ev = nz(s.ttm.enterpriseValue);
      if (ebitda === null || ebitda <= 0 || ev === null || ev <= 0) return null;
      return ev / ebitda;
    },
  },
  {
    key: "interestCoverageNormalized",
    category: "health",
    direction: "higher",
    extract: (s) => {
      const ebit = chooseEbitForFactor(s);
      const interest = nz(s.annual[0]?.income.interestExpense);
      if (ebit === null || interest === null || interest <= 0) return null;
      return ebit / interest;
    },
  },
  {
    key: "debtToEbitdaNormalized",
    category: "health",
    direction: "lower",
    extract: (s) => {
      const ebitda = chooseEbitdaForAnchor(s).ebitda;
      const netDebt = netDebtFromAnnual(s);
      if (ebitda === null || ebitda <= 0 || netDebt === null) return null;
      return netDebt / ebitda;
    },
  },
  {
    key: "roicNormalized",
    category: "quality",
    direction: "higher",
    extract: (s) => {
      const ebit = chooseEbitForFactor(s);
      const ic = nz(s.ttm.investedCapital);
      if (ebit === null || ic === null || ic <= 0) return null;
      return (ebit * (1 - 0.21)) / ic;
    },
  },
  {
    key: "epsGrowth7YNormalized",
    category: "growth",
    direction: "higher",
    extract: (s) => epsCagrNormalizedEndpoints(s),
  },
  // ---- new academic candidates ----
  {
    key: "grossProfitability",
    category: "quality",
    direction: "higher",
    extract: (s) => grossProfitability(s),
  },
  {
    key: "grossMarginTrend",
    category: "quality",
    direction: "higher",
    extract: (s) => grossMarginTrend(s),
  },
  {
    key: "residualIncomeVP",
    category: "valuation",
    direction: "higher",
    extract: (s) => residualIncomeVP(s),
  },
];
