import type {
  AnnualPeriod,
  CompanySnapshot,
} from "@stockrank/core";

/** Median of a non-empty number array (linear, no need to sort in place). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** k-th percentile (0..100) of a non-empty array. */
export function quantile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const idx = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

// ---------- Per-stock per-anchor implied price calculations ----------

export function impliedPriceFromPE(
  ttmEps: number | null,
  multiple: number | null,
): number | null {
  if (ttmEps === null || multiple === null) return null;
  if (ttmEps <= 0) return null;
  return ttmEps * multiple;
}

export function impliedPriceFromEvEbitda(
  ttmEbitda: number | null,
  multiple: number | null,
  totalDebt: number,
  cash: number,
  sharesDiluted: number | null,
): number | null {
  if (ttmEbitda === null || multiple === null || sharesDiluted === null) return null;
  if (ttmEbitda <= 0 || sharesDiluted <= 0) return null;
  const impliedEv = ttmEbitda * multiple;
  const equityValue = impliedEv - totalDebt + cash;
  if (equityValue <= 0) return null;
  return equityValue / sharesDiluted;
}

export function impliedPriceFromPFcf(
  ttmFcf: number | null,
  multiple: number | null,
  sharesDiluted: number | null,
): number | null {
  if (ttmFcf === null || multiple === null || sharesDiluted === null) return null;
  if (ttmFcf <= 0 || sharesDiluted <= 0) return null;
  return (ttmFcf * multiple) / sharesDiluted;
}

// ---------- Average over the most recent N profitable years out of last M ----------

export function normalizedEarningsPerShare(
  periods: AnnualPeriod[],
  windowYears = 7,
  minProfitableYears = 5,
): number | null {
  const window = periods.slice(0, windowYears);
  const profitable = window
    .map((p) => p.income.epsDiluted)
    .filter((v): v is number => v !== null && v > 0);
  if (profitable.length < minProfitableYears) {
    // Fall back to simple average over what we have if we can't hit the
    // minimum, but never if we have nothing to average.
    if (window.length === 0) return null;
    const all = window
      .map((p) => p.income.epsDiluted)
      .filter((v): v is number => v !== null);
    if (all.length === 0) return null;
    return all.reduce((s, v) => s + v, 0) / all.length;
  }
  const recent = profitable.slice(0, minProfitableYears);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

export function normalizedEbitda(
  periods: AnnualPeriod[],
  windowYears = 7,
  minProfitableYears = 5,
): number | null {
  const window = periods.slice(0, windowYears);
  const profitable = window
    .map((p) => p.income.ebitda)
    .filter((v): v is number => v !== null && v > 0);
  if (profitable.length < minProfitableYears) {
    if (window.length === 0) return null;
    const all = window
      .map((p) => p.income.ebitda)
      .filter((v): v is number => v !== null);
    if (all.length === 0) return null;
    return all.reduce((s, v) => s + v, 0) / all.length;
  }
  const recent = profitable.slice(0, minProfitableYears);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

export function normalizedFcf(
  periods: AnnualPeriod[],
  windowYears = 7,
  minProfitableYears = 5,
): number | null {
  const window = periods.slice(0, windowYears);
  const profitable = window
    .map((p) => p.cashFlow.freeCashFlow)
    .filter((v): v is number => v !== null && v > 0);
  if (profitable.length < minProfitableYears) {
    if (window.length === 0) return null;
    const all = window
      .map((p) => p.cashFlow.freeCashFlow)
      .filter((v): v is number => v !== null);
    if (all.length === 0) return null;
    return all.reduce((s, v) => s + v, 0) / all.length;
  }
  const recent = profitable.slice(0, minProfitableYears);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

// ---------- Own-historical multiples ----------

/**
 * Median of (price-at-period-end × shares ÷ EPS) across recent profitable
 * years — a rough "where did this stock typically trade on P/E?" signal.
 *
 * We don't have historical prices here, so we approximate by using the TTM
 * P/E as the most recent point and assuming a 5Y average ≈ TTM (a placeholder
 * for now; a future enhancement plugs in historical prices from snapshot).
 */
export function ownHistoricalPe(snapshot: CompanySnapshot): number | null {
  return snapshot.ttm.peRatio ?? null;
}

export function ownHistoricalEvEbitda(snapshot: CompanySnapshot): number | null {
  return snapshot.ttm.evToEbitda ?? null;
}

export function ownHistoricalPFcf(snapshot: CompanySnapshot): number | null {
  return snapshot.ttm.priceToFcf ?? null;
}
