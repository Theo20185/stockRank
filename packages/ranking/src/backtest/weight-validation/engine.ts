/**
 * Weight-validation engine (backtest.md §3.11).
 *
 * Pure function: takes IC observations + candidate weight vectors,
 * produces per-candidate per-horizon mean-excess-return + bootstrap
 * CIs, then applies the §3.11.1 adoption rule.
 *
 * The IC observations carry pre-computed per-super-group factor
 * percentiles, so we can reconstruct composite scores under any
 * weight vector without re-running the ranker. This decouples the
 * validation from any particular snapshot/cohort builder.
 */

import { bootstrapMeanCi, mulberry32, groupBy } from "../../stats.js";
import { FACTORS } from "../../factors.js";
import { DEFAULT_WEIGHTS } from "../../weights.js";
import type {
  CategoryKey,
  CategoryWeights,
  FactorKey,
} from "../../types.js";
import type { IcObservation } from "../ic/types.js";
import type {
  AdoptionVerdict,
  CandidateResult,
  CandidateWeights,
  HorizonPerformance,
  PreDecileFilter,
  SubFactorWeights,
  WeightValidationReport,
} from "./types.js";

/**
 * §3.11.1 adoption threshold: candidate must beat default by ≥ 1%/yr
 * excess at the 3y horizon, CI not crossing zero. Hand-set economic
 * floor matching the §3.10 Gate 2 logic.
 */
export const ADOPTION_EXCESS_FLOOR_PER_YEAR = 0.01;

export type WeightValidationOptions = {
  /** ISO date — start of test period (inclusive). */
  testPeriodStart: string;
  /** Bootstrap resample count. Default 1000 per spec. */
  bootstrapResamples?: number;
  /** RNG seed for reproducibility. */
  seed?: number;
  /** Top decile by default — but allow override for sensitivity tests. */
  topPercentile?: number;
};

/**
 * Compute each candidate's per-horizon mean excess return using the
 * test-period subset of observations, then apply the adoption rule.
 *
 * `candidates` first entry is treated as the baseline (the §8.1
 * default weights). Subsequent candidates are compared against it.
 * If `candidates` is empty, the default weights are used as the sole
 * candidate.
 */
export function runWeightValidation(
  observations: IcObservation[],
  candidates: CandidateWeights[],
  options: WeightValidationOptions,
): WeightValidationReport {
  const {
    testPeriodStart,
    bootstrapResamples = 1000,
    seed = 1,
    topPercentile = 0.10,
  } = options;

  const candidatesWithDefault: CandidateWeights[] = candidates.length
    ? candidates
    : [
        {
          name: "default",
          description: "ranking.md §8.1 default value-tilted defensive weights",
          source: "default",
          weights: { ...DEFAULT_WEIGHTS },
        },
      ];

  const trainStart = observations
    .map((o) => o.snapshotDate)
    .reduce((a, b) => (a < b ? a : b), "9999-12-31");
  const testEnd = observations
    .map((o) => o.snapshotDate)
    .reduce((a, b) => (a > b ? a : b), "0000-01-01");

  const testObservations = observations.filter(
    (o) => o.snapshotDate >= testPeriodStart,
  );

  // Group test observations by (snapshotDate, horizon) — each group
  // is one decision point for the top-decile selection.
  const grouped = groupBy(
    testObservations,
    (o) => `${o.snapshotDate}|${o.horizon}`,
  );

  const candidateResults: CandidateResult[] = candidatesWithDefault.map(
    (candidate, idx) => {
      const horizons = new Set<number>();
      for (const o of testObservations) horizons.add(o.horizon);
      const perHorizon: HorizonPerformance[] = [];
      for (const horizon of [...horizons].sort()) {
        // Per-snapshot top-decile + bottom-decile excess returns.
        const perSnapshotExcess: number[] = [];
        const perSnapshotBottomExcess: number[] = [];
        let perSnapshotRealized = 0;
        let snapshotCount = 0;
        for (const [key, snapshotObs] of grouped) {
          if (!key.endsWith(`|${horizon}`)) continue;
          // Apply pre-decile filter if specified — drops names matching
          // the exclusion criteria BEFORE the top-decile selection.
          const filteredObs = candidate.filter
            ? snapshotObs.filter((o) => !rejectedByFilter(o, candidate.filter!))
            : snapshotObs;
          const composites = filteredObs.map((obs) => ({
            obs,
            composite: composeFromPercentiles(
              obs.factorPercentiles,
              candidate.weights,
              candidate.subFactorWeights,
            ),
          }));
          const valid = composites.filter((c) => c.composite !== null);
          if (valid.length < 10) continue; // need at least 10 to form a decile
          valid.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));
          const cutoff = Math.max(1, Math.ceil(valid.length * topPercentile));
          const top = valid.slice(0, cutoff);
          // Bottom decile (lowest composites). Phase 4A — for
          // long/short factor isolation. Same cutoff size as top.
          const bottom = valid.slice(-cutoff);
          let sumExcess = 0;
          let sumRealized = 0;
          for (const t of top) {
            sumExcess += t.obs.excessReturn;
            sumRealized += t.obs.excessReturn;
          }
          let sumBottomExcess = 0;
          for (const b of bottom) sumBottomExcess += b.obs.excessReturn;
          perSnapshotExcess.push(sumExcess / top.length);
          perSnapshotBottomExcess.push(sumBottomExcess / bottom.length);
          perSnapshotRealized += sumRealized / top.length;
          snapshotCount += 1;
        }
        const meanExcess =
          perSnapshotExcess.length === 0
            ? null
            : perSnapshotExcess.reduce((a, b) => a + b, 0) /
              perSnapshotExcess.length;
        const meanBottomExcess =
          perSnapshotBottomExcess.length === 0
            ? null
            : perSnapshotBottomExcess.reduce((a, b) => a + b, 0) /
              perSnapshotBottomExcess.length;
        const meanRealized =
          snapshotCount === 0 ? null : perSnapshotRealized / snapshotCount;
        const ci95 =
          perSnapshotExcess.length >= 5
            ? bootstrapMeanCi(
                perSnapshotExcess,
                bootstrapResamples,
                0.05,
                mulberry32(seed + idx * 1000 + horizon),
              )
            : null;
        // Phase 4B — risk-adjusted metrics from the per-snapshot series.
        const sharpe = sharpeLike(perSnapshotExcess);
        const sortino = sortinoLike(perSnapshotExcess);
        const mdd = maxDrawdownOfRunningMean(perSnapshotExcess);
        perHorizon.push({
          horizon,
          meanRealized,
          meanExcess,
          excessCi95: ci95,
          nSnapshots: perSnapshotExcess.length,
          meanBottomExcess,
          longShortDelta:
            meanExcess !== null && meanBottomExcess !== null
              ? meanExcess - meanBottomExcess
              : null,
          sharpeLike: sharpe,
          sortinoLike: sortino,
          maxDrawdown: mdd,
        });
      }
      return { candidate, perHorizon };
    },
  );

  // Adoption verdicts — compare candidates [1..N] against [0] (default).
  const verdicts: AdoptionVerdict[] = [];
  const defaultResult = candidateResults[0];
  if (!defaultResult) {
    return {
      generatedAt: new Date().toISOString(),
      trainPeriod: { start: trainStart, end: testPeriodStart },
      testPeriod: { start: testPeriodStart, end: testEnd },
      candidates: candidateResults,
      verdicts,
    };
  }
  for (let i = 1; i < candidateResults.length; i += 1) {
    const cand = candidateResults[i]!;
    verdicts.push(adoptionVerdict(cand, defaultResult));
  }

  return {
    generatedAt: new Date().toISOString(),
    trainPeriod: { start: trainStart, end: testPeriodStart },
    testPeriod: { start: testPeriodStart, end: testEnd },
    candidates: candidateResults,
    verdicts,
  };
}

/**
 * §3.11.1 adoption rule. Candidate is adopted only when:
 *   1. mean 3y excess return ≥ default's + 1%/yr
 *   2. bootstrap 95% CI on candidate's 3y excess does not cross zero
 */
function adoptionVerdict(
  candidate: CandidateResult,
  baseline: CandidateResult,
): AdoptionVerdict {
  const cand3y = candidate.perHorizon.find((p) => p.horizon === 3);
  const base3y = baseline.perHorizon.find((p) => p.horizon === 3);
  if (!cand3y || !base3y) {
    return {
      candidateName: candidate.candidate.name,
      verdict: "reject",
      reason: "no 3y horizon data on candidate or baseline",
      excessVsDefault3y: null,
    };
  }
  if (cand3y.meanExcess === null || base3y.meanExcess === null) {
    return {
      candidateName: candidate.candidate.name,
      verdict: "reject",
      reason: "insufficient 3y data",
      excessVsDefault3y: null,
    };
  }
  const excessVsDefault = cand3y.meanExcess - base3y.meanExcess;
  if (excessVsDefault < ADOPTION_EXCESS_FLOOR_PER_YEAR * 3) {
    return {
      candidateName: candidate.candidate.name,
      verdict: "reject",
      reason: `3y excess vs default ${(excessVsDefault * 100).toFixed(2)}% — below ${(ADOPTION_EXCESS_FLOOR_PER_YEAR * 3 * 100).toFixed(1)}% adoption floor`,
      excessVsDefault3y: excessVsDefault,
    };
  }
  if (
    cand3y.excessCi95 === null ||
    cand3y.excessCi95.lo <= 0
  ) {
    return {
      candidateName: candidate.candidate.name,
      verdict: "reject",
      reason: "candidate's 3y excess CI crosses zero — outperformance not statistically distinguishable from zero",
      excessVsDefault3y: excessVsDefault,
    };
  }
  return {
    candidateName: candidate.candidate.name,
    verdict: "adopt",
    reason: `3y excess ${(cand3y.meanExcess * 100).toFixed(2)}% vs default ${(base3y.meanExcess * 100).toFixed(2)}%; CI ${ciToString(cand3y.excessCi95)}`,
    excessVsDefault3y: excessVsDefault,
  };
}

function ciToString(ci: { lo: number; hi: number }): string {
  return `[${(ci.lo * 100).toFixed(2)}%, ${(ci.hi * 100).toFixed(2)}%]`;
}

/**
 * Phase 4B — Sharpe-like ratio: meanExcess / stddev(perSnapshotExcess).
 * Caveat: not a true Sharpe because the input is already excess return
 * vs SPY, not vs a risk-free benchmark. Useful for relative comparison
 * across candidates within the same regime.
 *
 * Returns null when there are fewer than 2 observations or stddev is 0.
 */
function sharpeLike(perSnapshotExcess: number[]): number | null {
  if (perSnapshotExcess.length < 2) return null;
  const mean =
    perSnapshotExcess.reduce((a, b) => a + b, 0) / perSnapshotExcess.length;
  let sumSq = 0;
  for (const v of perSnapshotExcess) sumSq += (v - mean) ** 2;
  const variance = sumSq / (perSnapshotExcess.length - 1);
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return null;
  return mean / stddev;
}

/**
 * Phase 4B — Sortino-like ratio. Same numerator as Sharpe but divides
 * only by the downside standard deviation (variance of negative
 * excess values vs zero). Matches the user's "value-tilted defensive"
 * preference for asymmetric returns.
 */
function sortinoLike(perSnapshotExcess: number[]): number | null {
  if (perSnapshotExcess.length < 2) return null;
  const mean =
    perSnapshotExcess.reduce((a, b) => a + b, 0) / perSnapshotExcess.length;
  let sumSqDown = 0;
  let nDown = 0;
  for (const v of perSnapshotExcess) {
    if (v < 0) {
      sumSqDown += v * v;
      nDown += 1;
    }
  }
  if (nDown === 0) return null; // no downside → undefined (infinite)
  const downsideVar = sumSqDown / nDown;
  const downsideStddev = Math.sqrt(downsideVar);
  if (downsideStddev === 0) return null;
  return mean / downsideStddev;
}

/**
 * Phase 4B — maximum drawdown of the running mean of per-snapshot
 * excess returns. Walks the series, tracking the highest running mean
 * seen so far, then the worst (most-negative) deviation from that
 * peak. Captures how far underwater the strategy would have been at
 * the worst point during the test window.
 *
 * Returns null when fewer than 2 observations.
 */
function maxDrawdownOfRunningMean(perSnapshotExcess: number[]): number | null {
  if (perSnapshotExcess.length < 2) return null;
  let cumSum = 0;
  let peak = -Infinity;
  let maxDD = 0;
  for (let i = 0; i < perSnapshotExcess.length; i += 1) {
    cumSum += perSnapshotExcess[i]!;
    const runningMean = cumSum / (i + 1);
    if (runningMean > peak) peak = runningMean;
    const dd = runningMean - peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

/**
 * True iff the observation should be REJECTED (filtered out) by the
 * pre-decile filter. Returns false (keep) when no filter criterion
 * matches the observation.
 */
function rejectedByFilter(
  obs: IcObservation,
  filter: PreDecileFilter,
): boolean {
  const ex = filter.excludeFundamentalsDirections;
  if (ex && ex.length > 0) {
    if (obs.fundamentalsDirection !== undefined && ex.includes(obs.fundamentalsDirection)) {
      return true;
    }
  }
  return false;
}

/**
 * Compose category scores from factor percentiles, then composite
 * from category scores under the supplied weight vector. Mirrors the
 * ranker's logic so the validation backtest's composites match what
 * a live ranker would produce under the same weights.
 *
 * Returns null when no factor has data (composite is undefined).
 */
function composeFromPercentiles(
  percentiles: Partial<Record<FactorKey, number>>,
  weights: CategoryWeights,
  subFactorWeights?: SubFactorWeights,
): number | null {
  // Compute category scores. When sub-factor weights are supplied
  // for a category, use the explicit weights; otherwise equal-
  // weight present factors.
  const categoryScores: Partial<Record<CategoryKey, number>> = {};
  for (const factor of FACTORS) {
    void factor; // category iteration happens below
  }
  // Group factors by category once for sub-weight resolution.
  const factorsByCat = new Map<CategoryKey, typeof FACTORS>();
  for (const f of FACTORS) {
    const arr = factorsByCat.get(f.category);
    if (arr) arr.push(f);
    else factorsByCat.set(f.category, [f]);
  }

  for (const [cat, factors] of factorsByCat) {
    const subWeights = subFactorWeights?.[cat];
    if (subWeights) {
      // Explicit per-factor weights. Factors not listed are
      // weight-zero (excluded from the category score).
      let weightedSum = 0;
      let weightUsed = 0;
      for (const f of factors) {
        const w = subWeights[f.key];
        if (w === undefined || w === null) continue;
        const pct = percentiles[f.key];
        if (pct === undefined || pct === null) continue;
        weightedSum += pct * w;
        weightUsed += w;
      }
      if (weightUsed > 0) categoryScores[cat] = weightedSum / weightUsed;
    } else {
      // Default — equal-weight over present factors.
      let sum = 0;
      let n = 0;
      for (const f of factors) {
        const pct = percentiles[f.key];
        if (pct === undefined || pct === null) continue;
        sum += pct;
        n += 1;
      }
      if (n > 0) categoryScores[cat] = sum / n;
    }
  }

  // Composite from category scores under category weights.
  let numerator = 0;
  let denominator = 0;
  for (const cat of Object.keys(weights) as CategoryKey[]) {
    const score = categoryScores[cat];
    if (score === undefined) continue;
    numerator += score * weights[cat];
    denominator += weights[cat];
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}
