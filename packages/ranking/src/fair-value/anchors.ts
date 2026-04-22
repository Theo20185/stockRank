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

// ---------- TTM outlier detection (EPS + EBITDA) ----------

const TTM_OUTLIER_RATIO = 1.5;     // TTM > 1.5× prior-3y mean → suspicious
const FORWARD_AGREEMENT_RATIO = 0.7; // forward ≥ 70% of TTM → corroborates spike

export type EpsTreatment = "ttm" | "normalized";
export type EbitdaTreatment = "ttm" | "normalized";

export type EpsForAnchor = {
  eps: number | null;
  treatment: EpsTreatment;
};

export type EbitdaForAnchor = {
  ebitda: number | null;
  treatment: EbitdaTreatment;
};

/**
 * Choose the EPS to apply to a peer-median P/E multiple, with one-time-gain
 * defense per `fair-value.md` §4. Returns the TTM EPS unless:
 *   1. TTM EPS is > 1.5× the mean of the prior 3 profitable years, AND
 *   2. forward consensus EPS (when available) is < 70% of TTM
 *      — i.e., analysts don't expect the spike to repeat.
 *
 * When both conditions fire, falls back to the prior-3y mean to avoid
 * inflating fair value with a one-time gain (e.g., wildfire settlement
 * reversal at EIX). When forward EPS is missing, the prior-years rule
 * stands on its own — better to be slightly conservative than to lock in
 * an obvious one-time spike.
 */
export function chooseEpsForPeerAnchor(snapshot: CompanySnapshot): EpsForAnchor {
  const recent = snapshot.annual[0]?.income.epsDiluted ?? null;
  if (recent === null) return { eps: null, treatment: "ttm" };

  const priorEps = snapshot.annual.slice(1, 4)
    .map((p) => p.income.epsDiluted)
    .filter((v): v is number => v !== null && v > 0);

  if (priorEps.length < 2) {
    // Not enough prior history to detect outlier — accept TTM as is.
    return { eps: recent, treatment: "ttm" };
  }

  const priorMean = priorEps.reduce((s, v) => s + v, 0) / priorEps.length;
  const isHighSpike = recent > priorMean * TTM_OUTLIER_RATIO;
  if (!isHighSpike) {
    return { eps: recent, treatment: "ttm" };
  }

  // TTM looks high. Cross-check with forward consensus.
  const forward = snapshot.ttm.forwardEps;
  if (forward !== null && forward !== undefined && forward > 0) {
    if (forward >= recent * FORWARD_AGREEMENT_RATIO) {
      // Forward agrees → real step-change, trust the TTM.
      return { eps: recent, treatment: "ttm" };
    }
    // Forward disagrees → one-time gain, fall back to prior mean.
    return { eps: priorMean, treatment: "normalized" };
  }

  // No forward EPS available; fall back to prior mean on the TTM rule alone.
  return { eps: priorMean, treatment: "normalized" };
}

/**
 * Choose the EBITDA to apply to a peer-median EV/EBITDA multiple. Mirrors
 * the EPS rule: when the most recent annual EBITDA exceeds 1.5× the
 * prior-3-year mean, fall back to the prior mean. Yahoo doesn't surface a
 * forward-EBITDA estimate (vs forward EPS), so this is a single-signal
 * rule — same as the no-forward branch of `chooseEpsForPeerAnchor`.
 *
 * EIX FY2025 is the canonical case: $10.77B EBITDA vs ~$5.5B prior 3y mean
 * (1.95× spike) driven by the same TKM wildfire settlement that inflated EPS.
 */
export function chooseEbitdaForAnchor(snapshot: CompanySnapshot): EbitdaForAnchor {
  const recent = snapshot.annual[0]?.income.ebitda ?? null;
  if (recent === null) return { ebitda: null, treatment: "ttm" };

  const priorEbitda = snapshot.annual.slice(1, 4)
    .map((p) => p.income.ebitda)
    .filter((v): v is number => v !== null && v > 0);

  if (priorEbitda.length < 2) {
    return { ebitda: recent, treatment: "ttm" };
  }

  const priorMean = priorEbitda.reduce((s, v) => s + v, 0) / priorEbitda.length;
  if (recent <= priorMean * TTM_OUTLIER_RATIO) {
    return { ebitda: recent, treatment: "ttm" };
  }

  return { ebitda: priorMean, treatment: "normalized" };
}

// ---------- Own-historical multiples ----------

/**
 * Median of historical (price ÷ EPS) ratios over the available
 * annual periods — a "what multiple has the market typically paid for
 * this stock's earnings?" signal. Requires `priceAtYearEnd` populated
 * on each annual record (production Yahoo provider does this; FMP
 * mapper does not).
 *
 * Falls back to the legacy placeholder behavior (`ttm.peRatio`) when
 * no period has both a price and a positive EPS — that branch keeps
 * older snapshots and FMP-sourced rows working, but produces the
 * known degenerate "p25 collapses to current price" pattern. New
 * Yahoo snapshots get the real historical multiple.
 */
export function ownHistoricalPe(snapshot: CompanySnapshot): number | null {
  const ratios: number[] = [];
  for (const p of snapshot.annual) {
    const price = p.priceAtYearEnd;
    const eps = p.income.epsDiluted;
    if (price !== null && eps !== null && eps > 0) {
      ratios.push(price / eps);
    }
  }
  if (ratios.length === 0) return snapshot.ttm.peRatio ?? null;
  return median(ratios);
}

/**
 * Median historical EV/EBITDA. Reconstructs each year's enterprise
 * value as priceAtYearEnd × sharesDiluted + totalDebt − cash, divides
 * by that year's EBITDA. Same fallback semantics as
 * `ownHistoricalPe` — if no usable period, returns ttm.evToEbitda.
 */
export function ownHistoricalEvEbitda(snapshot: CompanySnapshot): number | null {
  const ratios: number[] = [];
  for (const p of snapshot.annual) {
    const price = p.priceAtYearEnd;
    const shares = p.income.sharesDiluted;
    const ebitda = p.income.ebitda;
    if (
      price !== null && shares !== null && shares > 0 &&
      ebitda !== null && ebitda > 0
    ) {
      const debt = p.balance.totalDebt ?? 0;
      const cash = p.balance.cash ?? 0;
      const ev = price * shares + debt - cash;
      if (ev > 0) ratios.push(ev / ebitda);
    }
  }
  if (ratios.length === 0) return snapshot.ttm.evToEbitda ?? null;
  return median(ratios);
}

/**
 * Median historical price-to-FCF. fcf-per-share = freeCashFlow /
 * sharesDiluted. Same fallback as the other two.
 */
export function ownHistoricalPFcf(snapshot: CompanySnapshot): number | null {
  const ratios: number[] = [];
  for (const p of snapshot.annual) {
    const price = p.priceAtYearEnd;
    const shares = p.income.sharesDiluted;
    const fcf = p.cashFlow.freeCashFlow;
    if (
      price !== null && shares !== null && shares > 0 &&
      fcf !== null && fcf > 0
    ) {
      const fcfPerShare = fcf / shares;
      if (fcfPerShare > 0) ratios.push(price / fcfPerShare);
    }
  }
  if (ratios.length === 0) return snapshot.ttm.priceToFcf ?? null;
  return median(ratios);
}
