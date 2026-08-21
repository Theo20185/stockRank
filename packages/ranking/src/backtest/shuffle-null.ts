/**
 * Generic shuffle-and-recompute null-distribution engine.
 *
 * Extracted from `ic/calibration.ts` (backtest.md §3.10.1) so the FV
 * backtest harness can reuse the identical null-construction procedure
 * for a different statistic (per-snapshot-averaged Spearman of
 * upsideToP25Pct vs forward excess) without hand-rolling a second
 * Monte Carlo loop.
 *
 * Procedure per iteration:
 *   1. Partition observations into shuffle buckets (caller-keyed —
 *      the IC pipeline uses `(snapshotDate, superGroup)`).
 *   2. Permute the target value (excess return) WITHIN each bucket,
 *      leaving every other field intact. This breaks the signal →
 *      return link while preserving return distributions, bucket
 *      sizes, snapshot autocorrelation, cross-sectional correlation,
 *      and survivorship pattern.
 *   3. Recompute the caller's statistic(s) on the shuffled set and
 *      pool the per-cell values across iterations.
 *
 * RNG discipline: a single mulberry32 stream seeded once, consumed in
 * bucket-map insertion order — identical to the original calibration
 * loop, so refactored callers produce byte-identical thresholds.
 *
 * Pure function; no I/O, no clock.
 */

import { groupBy, mulberry32, shuffleInPlace } from "../stats.js";

export type ShuffleNullOptions = {
  /** Number of Monte Carlo iterations. */
  iterations?: number;
  /** RNG seed for reproducibility. */
  seed?: number;
  /** Optional progress callback — called once per iteration. */
  onProgress?: (iteration: number, total: number) => void;
};

/**
 * Run the shuffle-null loop and return the pooled per-cell null
 * statistics, keyed by whatever cell key `collectStats` emits.
 *
 * @param observations flat observation rows
 * @param shuffleBucketKey groups rows for within-bucket permutation
 * @param readValue extracts the value to permute (e.g. excessReturn)
 * @param withValue returns a copy of the row carrying a permuted value
 * @param collectStats computes the statistic(s) of interest on one
 *   shuffled dataset; may return multiple values per cell (the IC
 *   pipeline pools |IC| across factors per iteration). Receives the
 *   iteration index for callers whose statistic needs an
 *   iteration-specific seed.
 */
export function runShuffleNull<T>(
  observations: readonly T[],
  shuffleBucketKey: (obs: T) => string,
  readValue: (obs: T) => number,
  withValue: (obs: T, value: number) => T,
  collectStats: (shuffled: T[], iteration: number) => Map<string, number[]>,
  options: ShuffleNullOptions = {},
): Map<string, number[]> {
  const { iterations = 1000, seed = 1, onProgress } = options;
  const rng = mulberry32(seed);

  const shuffleBuckets = groupBy(observations as T[], shuffleBucketKey);

  const pooled = new Map<string, number[]>();
  for (let iter = 0; iter < iterations; iter += 1) {
    const shuffled: T[] = [];
    for (const [, bucket] of shuffleBuckets) {
      const values = bucket.map(readValue);
      shuffleInPlace(values, rng);
      for (let i = 0; i < bucket.length; i += 1) {
        shuffled.push(withValue(bucket[i]!, values[i]!));
      }
    }
    for (const [key, stats] of collectStats(shuffled, iter)) {
      let arr = pooled.get(key);
      if (!arr) {
        arr = [];
        pooled.set(key, arr);
      }
      arr.push(...stats);
    }
    onProgress?.(iter + 1, iterations);
  }
  return pooled;
}

/**
 * Percentile extraction over a pooled null distribution — ascending
 * sort, floor-index convention. Matches the original calibration's
 * `idx99 = floor(0.99 × n)` exactly.
 */
export function nullPercentile(sortedAscending: number[], pct: number): number {
  const idx = Math.min(
    sortedAscending.length - 1,
    Math.floor(pct * sortedAscending.length),
  );
  return sortedAscending[idx]!;
}
