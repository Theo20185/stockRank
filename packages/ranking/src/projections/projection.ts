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

const SAMPLE_WINDOW = 8;          // last 2 years of quarterly samples
const MIN_SAMPLES = 4;            // below this, the regression is meaningless
const CAP_FRACTION = 0.5;         // ±50% of last observed value
const R2_HIGH = 0.5;
const R2_MEDIUM = 0.25;

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

export function projectFromQuarterlySamples(
  samples: readonly FvTrendSample[],
  input: ProjectionInput,
): ProjectionResult | null {
  // Work on the last `SAMPLE_WINDOW` samples, oldest-to-newest.
  const window = [...samples].slice(-SAMPLE_WINDOW);
  // Filter to ones with a non-null value for the requested field.
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

  // Days from the FIRST sample to the target — that's the x value
  // on the regression line.
  const daysFromFirstToTarget = daysBetween(firstDate, input.targetDate);
  const rawProjected = intercept + slopePerDay * daysFromFirstToTarget;

  // ±50% cap relative to the LAST observed value (rationale in module
  // docstring). Floor at $0.01 to keep downstream math sane.
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
  };
}
