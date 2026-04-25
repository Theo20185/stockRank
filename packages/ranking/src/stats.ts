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

/**
 * Convert raw values to fractional (mid)ranks. Ties get the average of
 * their tied positions. Used as the building block for Spearman.
 *
 * Pairs with `spearmanCorrelation` below; exposed for re-use in
 * stratified IC reporting where multiple correlations share the same
 * ranked vectors.
 */
export function ranksWithTies(values: readonly number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1]!.v === indexed[i]!.v) j += 1;
    // [i..j] are tied. Average rank = (i+1 + j+1) / 2 (1-based).
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k]!.i] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

/**
 * Spearman rank correlation. Robust to monotone non-linearities — what
 * we want for factor → return IC where the relationship doesn't have to
 * be linear, just consistent in sign.
 *
 * Returns null when:
 * - The arrays have different lengths (caller bug)
 * - Either array has < 2 elements (no degrees of freedom)
 * - Either array is constant (zero variance — correlation is undefined)
 */
export function spearmanCorrelation(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  if (xs.length !== ys.length) {
    throw new Error(
      `spearmanCorrelation: length mismatch (${xs.length} vs ${ys.length})`,
    );
  }
  if (xs.length < 2) return null;

  const rx = ranksWithTies(xs);
  const ry = ranksWithTies(ys);

  const n = rx.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += rx[i]!;
    sumY += ry[i]!;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = rx[i]! - meanX;
    const dy = ry[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return null;
  return num / denom;
}

/**
 * Bootstrap CI for a Spearman correlation by paired resampling — keeps
 * the (x, y) pairing intact while resampling pair indices with
 * replacement. Returns null when the sample is too small for a
 * meaningful CI (< 5 pairs) or the correlation itself is undefined.
 */
export function bootstrapSpearmanCi(
  xs: readonly number[],
  ys: readonly number[],
  resamples = 1000,
  alpha = 0.05,
  rng: () => number = Math.random,
): Interval | null {
  if (xs.length !== ys.length) {
    throw new Error("bootstrapSpearmanCi: length mismatch");
  }
  const n = xs.length;
  if (n < 5) return null;
  const corrs: number[] = [];
  for (let i = 0; i < resamples; i += 1) {
    const sx = new Array<number>(n);
    const sy = new Array<number>(n);
    for (let j = 0; j < n; j += 1) {
      const idx = Math.floor(rng() * n);
      sx[j] = xs[idx]!;
      sy[j] = ys[idx]!;
    }
    const c = spearmanCorrelation(sx, sy);
    if (c !== null) corrs.push(c);
  }
  if (corrs.length < 10) return null;
  corrs.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * corrs.length);
  const hiIdx = Math.min(corrs.length - 1, Math.floor((1 - alpha / 2) * corrs.length));
  return { lo: corrs[loIdx]!, hi: corrs[hiIdx]! };
}

/**
 * In-place Fisher-Yates shuffle using the supplied RNG. Returns the
 * mutated array for chaining. Used by the IC Monte Carlo to permute
 * forward returns within (date, super-group) cells.
 */
export function shuffleInPlace<T>(array: T[], rng: () => number = Math.random): T[] {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}
