/**
 * Forward projection of fair-value and price from the existing
 * quarterly trend samples (see `FvTrendSample` in @stockrank/core).
 *
 * Methodology:
 *   1. Take the last 8 samples (~2 years) of the requested field.
 *   2. Drop any samples with null values for that field.
 *   3. If fewer than 4 valid samples remain, return null
 *      (insufficient signal).
 *   4. Fit a linear regression of value vs days-since-first-sample
 *      using ordinary least squares.
 *   5. Project to (targetDate - first-sample-date) days.
 *   6. Apply ±50% soft cap relative to the LAST observed value
 *      (not today's value — today's value isn't on the regression
 *      line and using it as the cap base would silently dampen
 *      legitimate signals).
 *   7. Bucket R² into high (≥0.5) / medium (≥0.25) / weak (<0.25).
 *
 * The same function projects either FV anchors or the raw price by
 * varying the `field` argument — both quantities live on every
 * `FvTrendSample`.
 */

import type { FvTrendSample } from "@stockrank/core";

const DEFAULT_WINDOW = 8;         // 2 years of quarterly samples
const R2_TARGET = 0.8;            // try alternative windows when below this
const MIN_SAMPLES = 4;            // below this, the regression is meaningless
const CAP_FRACTION = 0.5;         // ±50% of last observed value
const R2_HIGH = 0.5;
const R2_MEDIUM = 0.25;

/**
 * Window sizes tried in order when the default 8q fit is weak.
 * Default 8q is tried first (most stable). Then 12q (3y, expand to
 * dampen outliers) → 6q → 4q (shrink to focus on current regime).
 * First window crossing R²≥0.8 wins; if none do, the highest-R²
 * window is chosen and `fallback` is true.
 */
const FALLBACK_WINDOW_LADDER: readonly number[] = [8, 12, 6, 4];

export type ProjectionField = "fvP25" | "fvMedian" | "fvP75" | "price";
export type ProjectionConfidence = "high" | "medium" | "weak";

export type ProjectionInput = {
  field: ProjectionField;
  /** ISO yyyy-mm-dd of the projection target (e.g., option expiration). */
  targetDate: string;
  /** ISO yyyy-mm-dd of "today" — used as the start of the days-ahead clock. */
  today: string;
};

export type ProjectionResult = {
  field: ProjectionField;
  /** Linear-regression slope expressed as % of the LAST observed value per year. */
  slopePctPerYear: number;
  rSquared: number;
  confidence: ProjectionConfidence;
  /** Days from `today` to `targetDate`. */
  daysAhead: number;
  /** Projected value at `targetDate`, after applying the ±50% cap. */
  projectedValue: number;
  /** True when the ±50% cap clipped the raw regression output. */
  capped: boolean;
  /** Number of samples that contributed to the regression (post-null-filter). */
  sampleCount: number;
  /**
   * Quarterly-sample window size that produced this fit. 8 = default
   * 2-year window; anything else = a fallback (3y / 1.5y / 1y) that
   * was tried because the 8q fit was weak.
   */
  windowSize: number;
  /**
   * True when the chosen fit used a non-default window (i.e., the 8q
   * default was tried but produced R²<0.8 and a different window was
   * preferred). UI surfaces a "fallback" chip in that case.
   */
  fallback: boolean;
};

function readField(sample: FvTrendSample, field: ProjectionField): number | null {
  if (field === "price") return sample.price;
  return sample[field];
}

const MS_PER_DAY = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso.slice(0, 10)}T00:00:00.000Z`).getTime() -
      new Date(`${fromIso.slice(0, 10)}T00:00:00.000Z`).getTime()) /
      MS_PER_DAY,
  );
}

/**
 * Single-window OLS fit. Internal helper — callers use
 * `projectFromQuarterlySamples` which iterates this over the fallback
 * ladder when the default window is weak.
 */
function fitOneWindow(
  samples: readonly FvTrendSample[],
  windowSize: number,
  input: ProjectionInput,
): ProjectionResult | null {
  const window = [...samples].slice(-windowSize);
  const points: Array<{ days: number; value: number }> = [];
  if (window.length === 0) return null;
  const firstDate = window[0]!.date;
  for (const s of window) {
    const v = readField(s, input.field);
    if (v === null || !Number.isFinite(v)) continue;
    points.push({ days: daysBetween(firstDate, s.date), value: v });
  }
  if (points.length < MIN_SAMPLES) return null;

  // Ordinary least squares regression.
  const n = points.length;
  const meanX = points.reduce((acc, p) => acc + p.days, 0) / n;
  const meanY = points.reduce((acc, p) => acc + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.days - meanX;
    const dy = p.value - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slopePerDay = sxy / sxx;
  const intercept = meanY - slopePerDay * meanX;
  const rSquared =
    syy === 0 ? 1 : Math.max(0, Math.min(1, (sxy * sxy) / (sxx * syy)));

  const lastValue = points[points.length - 1]!.value;
  const slopePctPerYear = lastValue !== 0 ? (slopePerDay * 365 / lastValue) * 100 : 0;

  const daysFromFirstToTarget = daysBetween(firstDate, input.targetDate);
  const rawProjected = intercept + slopePerDay * daysFromFirstToTarget;

  const upperCap = lastValue * (1 + CAP_FRACTION);
  const lowerCap = Math.max(0.01, lastValue * (1 - CAP_FRACTION));
  let projectedValue = rawProjected;
  let capped = false;
  if (rawProjected > upperCap) {
    projectedValue = upperCap;
    capped = true;
  } else if (rawProjected < lowerCap) {
    projectedValue = lowerCap;
    capped = true;
  }

  const daysAhead = daysBetween(input.today, input.targetDate);

  let confidence: ProjectionConfidence;
  if (rSquared >= R2_HIGH) confidence = "high";
  else if (rSquared >= R2_MEDIUM) confidence = "medium";
  else confidence = "weak";

  return {
    field: input.field,
    slopePctPerYear,
    rSquared,
    confidence,
    daysAhead,
    projectedValue,
    capped,
    sampleCount: n,
    windowSize,
    fallback: false, // caller flips this when a non-default window wins
  };
}

/**
 * Project a field forward, attempting the fallback window ladder
 * when the default fit is weak. Iteration:
 *   1. Try the default 8q window.
 *   2. If R² < 0.8, try 12q (expand), 6q, 4q (shrink) — each must
 *      have ≥ MIN_SAMPLES (4) non-null points to qualify.
 *   3. Return the first fit with R² ≥ 0.8 (preferring longer windows
 *      for stability), else the highest-R² candidate. Mark
 *      `fallback: true` when a non-default window is chosen.
 *
 * Returns null only when NO window has enough samples to fit.
 */
export function projectFromQuarterlySamples(
  samples: readonly FvTrendSample[],
  input: ProjectionInput,
): ProjectionResult | null {
  const candidates: ProjectionResult[] = [];
  for (const windowSize of FALLBACK_WINDOW_LADDER) {
    const fit = fitOneWindow(samples, windowSize, input);
    if (fit !== null) candidates.push(fit);
  }
  if (candidates.length === 0) return null;

  // Prefer the first candidate (in ladder order) that crosses R²≥0.8.
  // The ladder is ordered to prefer the DEFAULT first, then larger
  // (more stable) before smaller (more regime-focused).
  const goodFit = candidates.find((c) => c.rSquared >= R2_TARGET);
  const chosen = goodFit ?? candidates.reduce((best, c) =>
    c.rSquared > best.rSquared ? c : best,
  );
  return {
    ...chosen,
    fallback: chosen.windowSize !== DEFAULT_WINDOW,
  };
}
