import type { CompanySnapshot, AnnualPeriod } from "@stockrank/core";
import type { CategoryKey, FactorKey } from "./types.js";

export type FactorDirection = "higher" | "lower";

export type FactorDef = {
  key: FactorKey;
  category: CategoryKey;
  direction: FactorDirection;
  extract: (snapshot: CompanySnapshot) => number | null;
};

function nz(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

/** Compound annual growth rate. Returns null if start <= 0 or end is null. */
export function cagr(end: number, start: number, years: number): number | null {
  if (years <= 0) return null;
  if (start <= 0 || !Number.isFinite(start)) return null;
  if (end <= 0 || !Number.isFinite(end)) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

/**
 * Compute multi-year CAGR from an array of periods most-recent-first.
 * Uses the most recent period's value as `end` and walks back up to
 * `maxYears` to find the earliest available value as `start`.
 */
export function periodCagr(
  periods: AnnualPeriod[],
  pluck: (p: AnnualPeriod) => number | null,
  maxYears: number,
): number | null {
  if (periods.length < 2) return null;
  const end = pluck(periods[0]!);
  if (end === null) return null;

  const last = Math.min(periods.length - 1, maxYears);
  for (let i = last; i >= 1; i -= 1) {
    const start = pluck(periods[i]!);
    if (start !== null) return cagr(end, start, i);
  }
  return null;
}

/**
 * Average a metric across the most recent N periods, ignoring null entries.
 * Returns null if no non-null values are present.
 */
export function periodAverage(
  periods: AnnualPeriod[],
  pluck: (p: AnnualPeriod) => number | null,
  maxYears: number,
): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(periods.length, maxYears); i += 1) {
    const v = pluck(periods[i]!);
    if (v !== null) {
      sum += v;
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

/** True iff the company was profitable (NI > 0) in ≥ minYears of last maxYears. */
export function profitableInNOf5(
  periods: AnnualPeriod[],
  minYears: number,
  maxYears = 5,
): boolean {
  let positives = 0;
  for (let i = 0; i < Math.min(periods.length, maxYears); i += 1) {
    const ni = periods[i]!.income.netIncome;
    if (ni !== null && ni > 0) positives += 1;
  }
  return positives >= minYears;
}

function dividendsPerShare(p: AnnualPeriod): number | null {
  const div = p.cashFlow.dividendsPaid;
  const shares = p.income.sharesDiluted;
  if (div === null || shares === null || shares <= 0) return null;
  return div / shares;
}

function buybackYieldFromAnnual(snapshot: CompanySnapshot): number | null {
  const recent = snapshot.annual[0];
  if (!recent) return null;
  const buybacks = recent.cashFlow.buybacks;
  if (buybacks === null || snapshot.marketCap <= 0) return null;
  return buybacks / snapshot.marketCap;
}

function interestCoverageFromAnnual(snapshot: CompanySnapshot): number | null {
  const recent = snapshot.annual[0];
  if (!recent) return null;
  const ebit = recent.income.ebit;
  const interest = recent.income.interestExpense;
  if (ebit === null || interest === null || interest <= 0) return null;
  return ebit / interest;
}

export const FACTORS: FactorDef[] = [
  // Valuation
  {
    key: "evToEbitda",
    category: "valuation",
    direction: "lower",
    extract: (s) => nz(s.ttm.evToEbitda),
  },
  {
    key: "priceToFcf",
    category: "valuation",
    direction: "lower",
    extract: (s) => nz(s.ttm.priceToFcf),
  },
  {
    key: "peRatio",
    category: "valuation",
    direction: "lower",
    extract: (s) => {
      const pe = nz(s.ttm.peRatio);
      // Negative P/E is meaningless for ranking; drop it (the company's TTM
      // EPS was negative — Quality floor handles those names).
      if (pe === null || pe < 0) return null;
      return pe;
    },
  },
  {
    key: "priceToBook",
    category: "valuation",
    direction: "lower",
    extract: (s) => {
      const pb = nz(s.ttm.priceToBook);
      if (pb === null || pb < 0) return null;
      return pb;
    },
  },
  // Health
  {
    key: "debtToEbitda",
    category: "health",
    direction: "lower",
    extract: (s) => nz(s.ttm.netDebtToEbitda),
  },
  {
    key: "currentRatio",
    category: "health",
    direction: "higher",
    extract: (s) => nz(s.ttm.currentRatio),
  },
  {
    key: "interestCoverage",
    category: "health",
    direction: "higher",
    extract: (s) => interestCoverageFromAnnual(s),
  },
  // Quality
  {
    key: "roic",
    category: "quality",
    direction: "higher",
    extract: (s) => nz(s.ttm.roic),
  },
  // Shareholder Return
  {
    key: "dividendYield",
    category: "shareholderReturn",
    direction: "higher",
    extract: (s) => nz(s.ttm.dividendYield),
  },
  {
    key: "buybackYield",
    category: "shareholderReturn",
    direction: "higher",
    extract: (s) => buybackYieldFromAnnual(s),
  },
  {
    key: "dividendGrowth5Y",
    category: "shareholderReturn",
    direction: "higher",
    extract: (s) => periodCagr(s.annual, dividendsPerShare, 5),
  },
  // Growth (per §6: 7Y CAGR, peer-relative percentile)
  {
    key: "revenueGrowth7Y",
    category: "growth",
    direction: "higher",
    extract: (s) => periodCagr(s.annual, (p) => p.income.revenue, 7),
  },
  {
    key: "epsGrowth7Y",
    category: "growth",
    direction: "higher",
    extract: (s) => periodCagr(s.annual, (p) => p.income.epsDiluted, 7),
  },
];

export function factorsByCategory(): Record<CategoryKey, FactorDef[]> {
  const out: Record<CategoryKey, FactorDef[]> = {
    valuation: [],
    health: [],
    quality: [],
    shareholderReturn: [],
    growth: [],
  };
  for (const f of FACTORS) out[f.category].push(f);
  return out;
}
