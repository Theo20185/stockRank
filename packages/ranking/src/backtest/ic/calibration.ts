/**
 * Phase 0 Monte Carlo calibration (backtest.md §3.10.1).
 *
 * Procedure: shuffle the (factor → return) link within each
 * (snapshot date, super-group) cell, recompute IC, repeat. The
 * 99th percentile of the resulting null distribution becomes the
 * Gate 1 statistical threshold for that cell.
 *
 * Pure function. Caller supplies the observation set and an RNG seed
 * for reproducibility.
 */

import { groupBy, mulberry32, shuffleInPlace } from "../../stats.js";
import { ALL_SUPER_GROUPS } from "../../super-groups.js";
import type { SuperGroupKey } from "../../super-groups.js";
import { FACTORS } from "../../factors.js";
import type { IcCalibration, IcNullThreshold, IcObservation } from "./types.js";
import { computeIcCells, dedupeYearly } from "./pipeline.js";

export type CalibrationOptions = {
  /** Number of Monte Carlo iterations. Default 1000 per spec §3.10.1. */
  iterations?: number;
  /** RNG seed for reproducibility. */
  seed?: number;
  /** Optional progress callback — called once per iteration. Useful
   * for long runs (1000 × full S&P 500 takes minutes). */
  onProgress?: (iteration: number, total: number) => void;
};

/**
 * Run Phase 0 calibration. Returns one threshold per
 * (superGroup, horizon) cell. Within each Monte Carlo iteration the
 * shuffle preserves: real return distributions per (date, super-group),
 * real industry sizes, real snapshot autocorrelation, real cross-
 * sectional return correlation, real survivorship pattern. Only the
 * factor → return link is broken.
 *
 * The threshold is computed PER (superGroup, horizon) — not per
 * (superGroup, factor, horizon) — because under the null all factors
 * have the same noise distribution within a cell. This makes the
 * computation O(cells × iterations) rather than O(cells × factors ×
 * iterations), with no loss of validity.
 *
 * Implementation note: rather than re-shuffling N times, we collect
 * the |IC| values across all factors for each iteration and pool them
 * into the per-cell null distribution. Each iteration thus contributes
 * `nFactors` |IC| values per cell — efficient use of the shuffle work,
 * and matches what the §3.10.1 procedure describes (the spec's "1000
 * iterations" really means 1000 shuffles, not 1000 IC values).
 */
export function runCalibration(
  observations: IcObservation[],
  options: CalibrationOptions = {},
): IcCalibration {
  const { iterations = 1000, seed = 1, onProgress } = options;
  const rng = mulberry32(seed);

  const horizonsBySuperGroup = new Map<SuperGroupKey, Set<number>>();
  for (const obs of observations) {
    if (!horizonsBySuperGroup.has(obs.superGroup)) {
      horizonsBySuperGroup.set(obs.superGroup, new Set());
    }
    horizonsBySuperGroup.get(obs.superGroup)!.add(obs.horizon);
  }

  const dedupedNs = new Map<string, number>();
  {
    const grouped = groupBy(
      observations,
      (o) => `${o.superGroup}|${o.horizon}`,
    );
    for (const [key, group] of grouped) {
      dedupedNs.set(key, dedupeYearly(group).length);
    }
  }

  // Bucket by (snapshot date, super-group) for shuffling.
  const shuffleBuckets = groupBy(
    observations,
    (o) => `${o.snapshotDate}|${o.superGroup}`,
  );

  const nullIcs = new Map<string, number[]>();
  for (let iter = 0; iter < iterations; iter += 1) {
    const shuffled: IcObservation[] = [];
    for (const [, bucket] of shuffleBuckets) {
      // Permute the excessReturn values within the bucket while
      // keeping every other field on each observation intact. This
      // breaks factor→return signal but preserves all structure.
      const returns = bucket.map((o) => o.excessReturn);
      shuffleInPlace(returns, rng);
      for (let i = 0; i < bucket.length; i += 1) {
        shuffled.push({
          ...bucket[i]!,
          excessReturn: returns[i]!,
        });
      }
    }
    // Inside the Monte Carlo loop we only need the IC point estimate
    // — bootstrap CIs and rolling-window ICs would multiply runtime
    // by ~1000x and 3x respectively, with no contribution to the
    // null-distribution thresholds the calibration is producing.
    const cells = computeIcCells(shuffled, {
      rngSeed: seed + iter,
      skipBootstrap: true,
      skipWindows: true,
    });
    for (const c of cells) {
      if (c.ic === null) continue;
      const key = `${c.superGroup}|${c.horizon}`;
      let arr = nullIcs.get(key);
      if (!arr) {
        arr = [];
        nullIcs.set(key, arr);
      }
      arr.push(Math.abs(c.ic));
    }
    onProgress?.(iter + 1, iterations);
  }

  const thresholds: IcNullThreshold[] = [];
  for (const sg of ALL_SUPER_GROUPS) {
    const horizons = horizonsBySuperGroup.get(sg) ?? new Set();
    for (const h of horizons) {
      const key = `${sg}|${h}`;
      const arr = nullIcs.get(key) ?? [];
      if (arr.length === 0) continue;
      arr.sort((a, b) => a - b);
      const idx99 = Math.min(arr.length - 1, Math.floor(0.99 * arr.length));
      const idx995 = Math.min(arr.length - 1, Math.floor(0.995 * arr.length));
      thresholds.push({
        superGroup: sg,
        horizon: h,
        nEffective: dedupedNs.get(key) ?? 0,
        threshold99: arr[idx99]!,
        threshold995: arr[idx995]!,
      });
    }
  }

  return {
    iterations,
    generatedAt: new Date().toISOString(),
    thresholds,
  };
}

/**
 * False-discovery sanity check (§3.10.1): given a calibration and the
 * cells computed on the REAL data, count how many cells survive Gate
 * 1 and compare to what the Monte Carlo would expect by chance.
 *
 * Returns a small report shape suitable for inclusion in the
 * calibration markdown output.
 */
export type FalseDiscoveryCheck = {
  cellsTested: number;
  cellsSurvivingGate1: number;
  expectedByChance: number;
  ratio: number;
  verdict: "real-signal" | "marginal" | "noise";
};

export function falseDiscoveryCheck(
  realCellIcs: ReadonlyMap<string, number>,
  thresholds: IcNullThreshold[],
): FalseDiscoveryCheck {
  let surviving = 0;
  for (const t of thresholds) {
    const key = `${t.superGroup}|${t.horizon}`;
    const realIc = realCellIcs.get(key);
    if (realIc === undefined) continue;
    if (Math.abs(realIc) >= t.threshold99) surviving += 1;
  }
  const cellsTested = thresholds.length * FACTORS.length;
  // 99th percentile threshold = 1% expected survival under pure null.
  const expectedByChance = cellsTested * 0.01;
  const ratio = expectedByChance > 0 ? surviving / expectedByChance : 0;
  let verdict: FalseDiscoveryCheck["verdict"] = "noise";
  if (ratio > 5) verdict = "real-signal";
  else if (ratio > 2) verdict = "marginal";
  return {
    cellsTested,
    cellsSurvivingGate1: surviving,
    expectedByChance,
    ratio,
    verdict,
  };
}
