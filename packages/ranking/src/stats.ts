/**
 * Statistical helpers for back-test accuracy reporting (and any future
 * reporting that needs honest CIs over modest sample sizes).
 *
 * All functions are pure and deterministic. Bootstrap uses an injected
 * RNG so tests can pin a seed.
 */

export type Interval = { lo: number; hi: number };

/**
 * Wilson score interval for a binomial proportion. Better than the
 * normal approximation for small N or proportions near 0/1, which is
 * exactly the regime we land in when stratifying back-test results.
 *
 * - successes: count of "hits"
 * - n: total observations
 * - z: z-score for the desired CI level (1.96 → 95%, 2.576 → 99%)
 *
 * Returns null when n === 0 (no proportion to estimate).
 */
export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96,
): Interval | null {
  if (n <= 0) return null;
  if (successes < 0 || successes > n) {
    throw new Error(`successes must be in [0, n]; got ${successes}/${n}`);
  }
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

/**
 * Mean of a number array. Returns null when empty so callers don't get
 * NaN by accident.
 */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/**
 * Mulberry32 — small, fast, deterministic PRNG. Used by the bootstrap
 * helper so tests can pin a seed and assert on exact CI bounds.
 */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap CI for the mean of a sample. Resamples `n` times with
 * replacement and returns the (alpha/2, 1-alpha/2) quantiles of the
 * resampled means.
 *
 * Returns null when the sample is empty. When the sample has length 1,
 * the CI degenerates to [value, value] — caller should treat as
 * uninformative.
 */
export function bootstrapMeanCi(
  values: number[],
  resamples = 1000,
  alpha = 0.05,
  rng: () => number = Math.random,
): Interval | null {
  if (values.length === 0) return null;
  if (values.length === 1) return { lo: values[0]!, hi: values[0]! };
  const means: number[] = new Array(resamples);
  for (let i = 0; i < resamples; i += 1) {
    let s = 0;
    for (let j = 0; j < values.length; j += 1) {
      const idx = Math.floor(rng() * values.length);
      s += values[idx]!;
    }
    means[i] = s / values.length;
  }
  means.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * resamples);
  const hiIdx = Math.min(resamples - 1, Math.floor((1 - alpha / 2) * resamples));
  return { lo: means[loIdx]!, hi: means[hiIdx]! };
}

/**
 * Quartile bin label for a value relative to a sorted reference array.
 * Returns "Q1".."Q4". Used to bucket continuous variables (like
 * upside-to-p25) for stratified reporting.
 */
export function quartileBin(value: number, sortedRef: number[]): "Q1" | "Q2" | "Q3" | "Q4" {
  if (sortedRef.length === 0) return "Q1";
  const cuts = [0.25, 0.5, 0.75].map((q) => quantileSorted(sortedRef, q));
  if (value <= cuts[0]!) return "Q1";
  if (value <= cuts[1]!) return "Q2";
  if (value <= cuts[2]!) return "Q3";
  return "Q4";
}

/** Quantile of an already-sorted array. Linear interpolation. */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("quantileSorted: empty array");
  if (sorted.length === 1) return sorted[0]!;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

/**
 * Group-by helper that returns a Map keyed by the chosen field. Stable
 * insertion order — useful for predictable report output.
 */
export function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    let bucket = out.get(k);
    if (!bucket) {
      bucket = [];
      out.set(k, bucket);
    }
    bucket.push(item);
  }
  return out;
}
