/**
 * FV backtest engine — computes H1–H6 over FvObservation rows.
 *
 * Pure function; no I/O, no clock (generatedAt comes from the caller-
 * facing report layer via new Date() at the very end, matching the
 * other backtest engines). All thresholds and verdict rules are the
 * frozen constants in types.ts — nothing here is tuned after seeing
 * results.
 *
 * Statistical conventions (declared before any run):
 *  - Yearly dedup (§3.9.3, earliest snapshot per symbol-year) inside
 *    every H1-style cell and the H2 secondary estimator. H2 primary
 *    uses full monthly cross-sections; its serial correlation is
 *    absorbed by the date-structure-preserving shuffle null.
 *  - Annualization = cumulative mean excess ÷ horizon.
 *  - Bootstrap 1000 resamples, mulberry32, deterministic per-cell
 *    seed sequence.
 *  - Verdicts only on cells with ≥ MIN_VERDICT_N deduped rows per arm.
 */

import {
  bootstrapMeanCi,
  bootstrapSpearmanCi,
  groupBy,
  mulberry32,
  quantileSorted,
  spearmanCorrelation,
  wilsonInterval,
} from "../../stats.js";
import { ECONOMIC_FLOOR_IC } from "../ic/three-gate.js";
import { buildRollingWindows } from "../ic/pipeline.js";
import { nullPercentile, runShuffleNull } from "../shuffle-null.js";
import {
  ALL_ANCHOR_KEYS,
  OWN_ANCHOR_KEYS,
  PEER_ANCHOR_KEYS,
  anchorCorrelationReport,
  bandFromAnchors,
} from "./ablation.js";
import {
  ANNUALIZED_EDGE_FLOOR,
  FV_REGIMES,
  H5_DIRECTED_EDGES,
  H5_SYMMETRIC_EDGES,
  MIN_CROSS_SECTION,
  MIN_VERDICT_N,
} from "./types.js";
import type {
  FvArmStats,
  FvBacktestReport,
  FvH1Cell,
  FvH2Primary,
  FvH2Secondary,
  FvH3Cell,
  FvH4Verdict,
  FvH5Trend,
  FvObservation,
  FvRegimeKey,
  WeeklyCloses,
} from "./types.js";

export type FvBacktestInput = {
  observations: FvObservation[];
  /** Weekly valuation-basis closes per symbol (H3). */
  weeklyClosesBySymbol: WeeklyCloses;
  /** PIT industry-membership stress rerun (H1 only). Null = not run. */
  coarseCohortObservations?: FvObservation[] | null;
  engineErrorRows?: number;
  pit: {
    capBucketChurnPct: number | null;
    industryMembershipNote: string;
    restatementNote: string;
  };
};

export type FvBacktestOptions = {
  bootstrapResamples?: number;
  seed?: number;
  /** Monte Carlo iterations for the H2 shuffled-returns null. */
  mcIterations?: number;
  onMcProgress?: (iteration: number, total: number) => void;
};

export function runFvBacktest(
  input: FvBacktestInput,
  options: FvBacktestOptions = {},
): FvBacktestReport {
  const {
    observations,
    weeklyClosesBySymbol,
    coarseCohortObservations = null,
    engineErrorRows = 0,
    pit,
  } = input;
  const {
    bootstrapResamples = 1000,
    seed = 1,
    mcIterations = 1000,
    onMcProgress,
  } = options;

  const horizons = [...new Set(observations.map((o) => o.horizon))].sort(
    (a, b) => a - b,
  );
  const dates = [...new Set(observations.map((o) => o.snapshotDate))].sort();

  // Deterministic per-cell RNG: a shared counter advanced in fixed
  // iteration order.
  let seedCounter = 0;
  const nextRng = (): (() => number) => mulberry32(seed + (seedCounter += 1));

  // ── H1 — directional ────────────────────────────────────────────────
  const h1: FvH1Cell[] = [];
  for (const regime of FV_REGIMES) {
    for (const h of horizons) {
      h1.push(
        h1StyleCell(
          rowsFor(observations, regime.key, h),
          regime.key,
          h,
          "all",
          bootstrapResamples,
          nextRng,
        ),
      );
    }
  }

  const h1CoarseCohortStress: FvH1Cell[] | null = coarseCohortObservations
    ? FV_REGIMES.flatMap((regime) =>
        horizons.map((h) =>
          h1StyleCell(
            rowsFor(coarseCohortObservations, regime.key, h),
            regime.key,
            h,
            "coarse-cohort",
            bootstrapResamples,
            nextRng,
          ),
        ),
      )
    : null;

  // ── H2 — monotonic ──────────────────────────────────────────────────
  const h2Primary: FvH2Primary[] = [];
  const h2Secondary: FvH2Secondary[] = [];
  for (const h of horizons) {
    const rows = observations.filter(
      (o) => o.horizon === h && o.fv.upsideToP25Pct !== null,
    );
    h2Primary.push(
      h2PrimaryCell(rows, h, bootstrapResamples, mcIterations, seed, onMcProgress, nextRng),
    );

    const deduped = dedupeYearlyFv(rows);
    const xs = deduped.map((o) => o.fv.upsideToP25Pct!) ;
    const ys = deduped.map((o) => o.excessReturn);
    const ic = xs.length >= 2 ? spearmanCorrelation(xs, ys) : null;
    h2Secondary.push({
      horizon: h,
      nDeduped: deduped.length,
      ic,
      ci95:
        xs.length >= 5
          ? bootstrapSpearmanCi(xs, ys, bootstrapResamples, 0.05, nextRng())
          : null,
    });
  }

  // ── H3 — convergence ────────────────────────────────────────────────
  const h3: FvH3Cell[] = [];
  for (const regime of FV_REGIMES) {
    for (const h of horizons) {
      h3.push(
        h3Cell(rowsFor(observations, regime.key, h), regime.key, h, weeklyClosesBySymbol),
      );
    }
  }

  // ── H4 — do the flags discriminate? ─────────────────────────────────
  const h4Cells: FvH1Cell[] = [];
  const h4Strata: Array<[string, (o: FvObservation) => boolean]> = [
    ["confidence=high", (o) => o.fv.confidence === "high"],
    ["confidence=medium", (o) => o.fv.confidence === "medium"],
    ["confidence=low", (o) => o.fv.confidence === "low"],
    ["divergent=true", (o) => o.fv.peerCohortDivergent],
    ["divergent=false", (o) => !o.fv.peerCohortDivergent],
    ["deep-cyclical=true", (o) => o.deepCyclical],
    ["deep-cyclical=false", (o) => !o.deepCyclical],
  ];
  for (const regime of FV_REGIMES) {
    for (const h of horizons) {
      const base = rowsFor(observations, regime.key, h);
      for (const [label, predicate] of h4Strata) {
        h4Cells.push(
          h1StyleCell(base.filter(predicate), regime.key, h, label, bootstrapResamples, nextRng),
        );
      }
    }
  }
  const h4Verdicts: FvH4Verdict[] = [];
  const h4Comparisons: Array<[string, string, string]> = [
    ["confidence high vs low", "confidence=high", "confidence=low"],
    ["divergent false vs true", "divergent=false", "divergent=true"],
    ["deep-cyclical false vs true", "deep-cyclical=false", "deep-cyclical=true"],
  ];
  for (const regime of FV_REGIMES) {
    for (const h of horizons) {
      for (const [name, aLabel, bLabel] of h4Comparisons) {
        h4Verdicts.push(
          discriminationVerdict(
            name,
            regime.key,
            h,
            h4Cells.find((c) => c.regime === regime.key && c.horizon === h && c.stratum === aLabel)!,
            h4Cells.find((c) => c.regime === regime.key && c.horizon === h && c.stratum === bLabel)!,
          ),
        );
      }
    }
  }

  // ── H5 — peer-premium decay ─────────────────────────────────────────
  const h5Cells: FvH1Cell[] = [];
  const h5DirectedCells: FvH1Cell[] = [];
  const h5Trends: FvH5Trend[] = [];
  const symBuckets = bucketLabels("sym", H5_SYMMETRIC_EDGES, 1);
  const dirBuckets = bucketLabels("dir", H5_DIRECTED_EDGES, 0);
  for (const regime of FV_REGIMES) {
    for (const h of horizons) {
      const base = rowsFor(observations, regime.key, h);
      const gaps: Array<number | null> = [];
      symBuckets.forEach((label, idx) => {
        const rows = base.filter(
          (o) =>
            o.peerPremiumRatioSymmetric !== null &&
            bucketIndex(o.peerPremiumRatioSymmetric, H5_SYMMETRIC_EDGES) === idx,
        );
        const cell = h1StyleCell(rows, regime.key, h, label, bootstrapResamples, nextRng);
        h5Cells.push(cell);
        gaps.push(cell.gapAnnualized);
      });
      // >5.0 bucket rerun on the PRE-suppression full-9 band — the
      // production band there is own-only by construction, so this is
      // the only way to observe raw peer contamination past the cliff.
      {
        const topIdx = symBuckets.length - 1;
        const rows = base
          .filter(
            (o) =>
              o.peerPremiumRatioSymmetric !== null &&
              bucketIndex(o.peerPremiumRatioSymmetric, H5_SYMMETRIC_EDGES) === topIdx,
          )
          .map((o) => withVariantBand(o, "full9"));
        h5Cells.push(
          h1StyleCell(rows, regime.key, h, `${symBuckets[topIdx]} (pre-suppression band)`, bootstrapResamples, nextRng),
        );
      }
      dirBuckets.forEach((label, idx) => {
        const rows = base.filter(
          (o) =>
            o.peerPremiumRatioDirected !== null &&
            bucketIndex(o.peerPremiumRatioDirected, H5_DIRECTED_EDGES) === idx,
        );
        h5DirectedCells.push(
          h1StyleCell(rows, regime.key, h, label, bootstrapResamples, nextRng),
        );
      });

      const powered = gaps.filter((g, i) => {
        const cell = h5Cells.find(
          (c) => c.regime === regime.key && c.horizon === h && c.stratum === symBuckets[i],
        )!;
        return g !== null && cell.verdict !== "underpowered";
      });
      const presentGaps = gaps.filter((g): g is number => g !== null);
      const idxs = gaps
        .map((g, i) => (g !== null ? i : null))
        .filter((v): v is number => v !== null);
      const spearman =
        presentGaps.length >= 3
          ? spearmanCorrelation(idxs.map((i) => i), presentGaps)
          : null;
      const monotonic =
        presentGaps.length >= 3 &&
        presentGaps.every((g, i) => i === 0 || g <= presentGaps[i - 1]!);
      const lastGap = gaps[gaps.length - 1] ?? null;
      const topNonPositive = lastGap !== null && lastGap <= 0;
      h5Trends.push({
        regime: regime.key,
        horizon: h,
        bucketGapSpearman: spearman,
        monotonicDecay: monotonic,
        topBucketGapNonPositive: topNonPositive,
        verdict:
          powered.length < 3
            ? "underpowered"
            : monotonic && topNonPositive
              ? "supports-shrinkage"
              : "no-decay-evidence",
      });
    }
  }

  // ── H6 — anchor ablation (pooled only; regime lens lives in H1) ────
  const h6Cells: FvH1Cell[] = [];
  for (const h of horizons) {
    const base = rowsFor(observations, "pooled", h);
    // Common support: rows where BOTH own-3 and peer-6 bands exist.
    const common = base.filter(
      (o) =>
        bandFromAnchors(o.fv.anchorsPre, OWN_ANCHOR_KEYS) !== null &&
        bandFromAnchors(o.fv.anchorsPre, PEER_ANCHOR_KEYS) !== null,
    );
    const variants: Array<["production" | "full9" | "own3" | "peer6", string]> = [
      ["production", "variant=production"],
      ["full9", "variant=full9"],
      ["own3", "variant=own3"],
      ["peer6", "variant=peer6"],
    ];
    for (const [variant, label] of variants) {
      h6Cells.push(
        h1StyleCell(
          common.map((o) => withVariantBand(o, variant)),
          "pooled",
          h,
          `${label} (common support)`,
          bootstrapResamples,
          nextRng,
        ),
      );
      h6Cells.push(
        h1StyleCell(
          base.map((o) => withVariantBand(o, variant)),
          "pooled",
          h,
          `${label} (unrestricted)`,
          bootstrapResamples,
          nextRng,
        ),
      );
    }
  }
  // Correlation structure over first-horizon deduped rows (anchors are
  // per (symbol, date) — one horizon avoids double-counting).
  const firstHorizonRows = dedupeYearlyFv(
    observations.filter((o) => o.horizon === horizons[0]),
  );
  const h6Correlation = anchorCorrelationReport(
    firstHorizonRows.map((o) => o.fv.anchorsPre),
  );

  // ── verdict line ────────────────────────────────────────────────────
  const pooled3y =
    h1.find((c) => c.regime === "pooled" && c.horizon === Math.max(...horizons)) ?? null;
  const h2At3y = h2Primary.find((p) => p.horizon === Math.max(...horizons)) ?? null;
  const verdictLine = `H1 pooled ${Math.max(...horizons)}y: ${pooled3y?.verdict ?? "n/a"} (gap ${fmtPct(pooled3y?.gapAnnualized)}/yr); H2 ${Math.max(...horizons)}y: ${h2At3y?.verdict ?? "n/a"} (avg IC ${h2At3y?.avgIc?.toFixed(3) ?? "n/a"})`;

  return {
    generatedAt: new Date().toISOString(),
    snapshotRange: { start: dates[0] ?? "", end: dates[dates.length - 1] ?? "" },
    horizons,
    totals: {
      observations: observations.length,
      symbols: new Set(observations.map((o) => o.symbol)).size,
      dates: dates.length,
      noBandRows: observations.filter((o) => o.fv.belowP25 === null).length,
      engineErrorRows,
    },
    pit,
    h1,
    h1CoarseCohortStress,
    h2Primary,
    h2Secondary,
    h3,
    h4Cells,
    h4Verdicts,
    h5Cells,
    h5Trends,
    h5DirectedCells,
    h6Cells,
    h6Correlation,
    verdictLine,
  };
}

// ---------------------------------------------------------------
// Cell computation
// ---------------------------------------------------------------

function rowsFor(
  observations: readonly FvObservation[],
  regime: FvRegimeKey,
  horizon: number,
): FvObservation[] {
  const def = FV_REGIMES.find((r) => r.key === regime)!;
  return observations.filter(
    (o) =>
      o.horizon === horizon &&
      (def.start === null || o.snapshotDate >= def.start) &&
      (def.end === null || o.snapshotDate <= def.end),
  );
}

/** Yearly dedup (§3.9.3): earliest snapshot per (symbol, year). */
export function dedupeYearlyFv<T extends { symbol: string; snapshotYear: number; snapshotDate: string }>(
  rows: readonly T[],
): T[] {
  const sorted = [...rows].sort((a, b) =>
    a.snapshotDate < b.snapshotDate ? -1 : 1,
  );
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of sorted) {
    const key = `${r.symbol}|${r.snapshotYear}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function armStats(
  rows: readonly FvObservation[],
  horizon: number,
  bootstrapResamples: number,
  rng: () => number,
): FvArmStats {
  const deduped = dedupeYearlyFv(rows);
  const excess = deduped.map((o) => o.excessReturn);
  if (excess.length === 0) {
    return {
      n: rows.length,
      nDeduped: 0,
      meanCumExcess: null,
      annualizedExcess: null,
      annualizedCi95: null,
      medianCumExcess: null,
      hitRate: null,
      hitRateCi95: null,
    };
  }
  const mean = excess.reduce((s, v) => s + v, 0) / excess.length;
  const sorted = [...excess].sort((a, b) => a - b);
  const ci =
    excess.length >= 5
      ? bootstrapMeanCi(excess, bootstrapResamples, 0.05, rng)
      : null;
  const hits = excess.filter((v) => v > 0).length;
  const wilson = wilsonInterval(hits, excess.length);
  return {
    n: rows.length,
    nDeduped: excess.length,
    meanCumExcess: mean,
    annualizedExcess: mean / horizon,
    annualizedCi95: ci ? { lo: ci.lo / horizon, hi: ci.hi / horizon } : null,
    medianCumExcess: quantileSorted(sorted, 0.5),
    hitRate: hits / excess.length,
    hitRateCi95: wilson,
  };
}

function h1StyleCell(
  rows: readonly FvObservation[],
  regime: FvRegimeKey,
  horizon: number,
  stratum: string,
  bootstrapResamples: number,
  nextRng: () => () => number,
): FvH1Cell {
  const below = armStats(
    rows.filter((o) => o.fv.belowP25 === true),
    horizon,
    bootstrapResamples,
    nextRng(),
  );
  const atOrAbove = armStats(
    rows.filter((o) => o.fv.belowP25 === false),
    horizon,
    bootstrapResamples,
    nextRng(),
  );
  const nNoBand = rows.filter((o) => o.fv.belowP25 === null).length;
  const gap =
    below.annualizedExcess !== null && atOrAbove.annualizedExcess !== null
      ? below.annualizedExcess - atOrAbove.annualizedExcess
      : null;

  let verdict: FvH1Cell["verdict"];
  let reason: string;
  if (below.nDeduped < MIN_VERDICT_N || atOrAbove.nDeduped < MIN_VERDICT_N) {
    verdict = "underpowered";
    reason = `n(below)=${below.nDeduped}, n(at/above)=${atOrAbove.nDeduped} — below the ${MIN_VERDICT_N}-row verdict floor`;
  } else if (
    gap !== null &&
    gap >= ANNUALIZED_EDGE_FLOOR &&
    below.annualizedCi95 !== null &&
    below.annualizedCi95.lo > 0
  ) {
    verdict = "pass";
    reason = `gap ${fmtPct(gap)}/yr ≥ ${fmtPct(ANNUALIZED_EDGE_FLOOR)}/yr and below-arm CI excludes 0`;
  } else {
    verdict = "fail";
    const gapPart = gap === null ? "gap incomputable" : `gap ${fmtPct(gap)}/yr`;
    const ciPart =
      below.annualizedCi95 === null
        ? "no CI"
        : below.annualizedCi95.lo > 0
          ? "below-arm CI excludes 0"
          : "below-arm CI crosses 0";
    reason = `${gapPart}; ${ciPart}`;
  }

  return { regime, horizon, stratum, below, atOrAbove, nNoBand, gapAnnualized: gap, verdict, reason };
}

function discriminationVerdict(
  comparison: string,
  regime: FvRegimeKey,
  horizon: number,
  a: FvH1Cell,
  b: FvH1Cell,
): FvH4Verdict {
  const armA = a.below;
  const armB = b.below;
  if (armA.nDeduped < MIN_VERDICT_N || armB.nDeduped < MIN_VERDICT_N) {
    return {
      comparison,
      horizon,
      regime,
      gapAnnualized: null,
      verdict: "underpowered",
      reason: `below-arm n: ${armA.nDeduped} vs ${armB.nDeduped} (floor ${MIN_VERDICT_N})`,
    };
  }
  const gap =
    armA.annualizedExcess !== null && armB.annualizedExcess !== null
      ? armA.annualizedExcess - armB.annualizedExcess
      : null;
  const ciDisjoint =
    armA.annualizedCi95 !== null &&
    armB.annualizedCi95 !== null &&
    (armA.annualizedCi95.lo > armB.annualizedCi95.hi ||
      armB.annualizedCi95.lo > armA.annualizedCi95.hi);
  if (gap !== null && gap >= ANNUALIZED_EDGE_FLOOR && ciDisjoint) {
    return {
      comparison,
      horizon,
      regime,
      gapAnnualized: gap,
      verdict: "discriminating",
      reason: `below-arm gap ${fmtPct(gap)}/yr with disjoint CIs`,
    };
  }
  return {
    comparison,
    horizon,
    regime,
    gapAnnualized: gap,
    verdict: "decorative",
    reason:
      gap === null
        ? "gap incomputable"
        : `below-arm gap ${fmtPct(gap)}/yr${ciDisjoint ? "" : ", CIs overlap"}`,
  };
}

// ---------------------------------------------------------------
// H2 — per-snapshot-averaged Spearman with shuffle null
// ---------------------------------------------------------------

function perDateIcs(rows: readonly FvObservation[]): { ics: number[]; skipped: number; byDate: Map<string, number> } {
  const byDate = groupBy([...rows], (o) => o.snapshotDate);
  const ics: number[] = [];
  const icByDate = new Map<string, number>();
  let skipped = 0;
  for (const [date, group] of byDate) {
    if (group.length < MIN_CROSS_SECTION) {
      skipped += 1;
      continue;
    }
    const ic = spearmanCorrelation(
      group.map((o) => o.fv.upsideToP25Pct!),
      group.map((o) => o.excessReturn),
    );
    // Degenerate cross-sections (constant upside or constant excess)
    // carry no rank information — skipped like thin ones.
    if (ic === null) {
      skipped += 1;
      continue;
    }
    ics.push(ic);
    icByDate.set(date, ic);
  }
  return { ics, skipped, byDate: icByDate };
}

function h2PrimaryCell(
  rows: FvObservation[],
  horizon: number,
  bootstrapResamples: number,
  mcIterations: number,
  seed: number,
  onMcProgress: ((i: number, n: number) => void) | undefined,
  nextRng: () => () => number,
): FvH2Primary {
  const { ics, skipped, byDate } = perDateIcs(rows);
  const avgIc = ics.length > 0 ? ics.reduce((s, v) => s + v, 0) / ics.length : null;

  if (avgIc === null || ics.length < 10) {
    return {
      horizon,
      nDates: ics.length,
      nDatesSkipped: skipped,
      avgIc,
      ci95: null,
      null99: null,
      gate1Statistical: false,
      gate2Economic: false,
      windowIcs: [],
      gate3SignStability: false,
      verdict: "fail-insufficient-data",
    };
  }

  const ci95 = bootstrapMeanCi(ics, bootstrapResamples, 0.05, nextRng());

  // Shuffled-returns null: permute excess within (date, super-group)
  // buckets — identical structure preservation to the IC calibration —
  // and recompute the averaged IC per iteration.
  const pooled = runShuffleNull(
    rows,
    (o) => `${o.snapshotDate}|${o.superGroup ?? "none"}`,
    (o) => o.excessReturn,
    (o, excessReturn) => ({ ...o, excessReturn }),
    (shuffled) => {
      const { ics: nullIcs } = perDateIcs(shuffled);
      const avg =
        nullIcs.length > 0
          ? nullIcs.reduce((s, v) => s + v, 0) / nullIcs.length
          : null;
      return avg === null
        ? new Map<string, number[]>()
        : new Map([["avg", [Math.abs(avg)]]]);
    },
    {
      iterations: mcIterations,
      seed,
      ...(onMcProgress ? { onProgress: onMcProgress } : {}),
    },
  );
  const nullValues = (pooled.get("avg") ?? []).sort((a, b) => a - b);
  const null99 = nullValues.length > 0 ? nullPercentile(nullValues, 0.99) : null;

  const gate1 = null99 !== null && Math.abs(avgIc) >= null99;
  const gate2 = Math.abs(avgIc) >= ECONOMIC_FLOOR_IC;

  // Sign-stability: 3 evenly-spaced date windows; per-window average
  // of per-date ICs; ≥ 2 valid windows agreeing with the full-sample
  // sign (three-gate.ts semantics — fail closed under missing data).
  const windows = buildRollingWindows(
    [...byDate.keys()].map((d) => ({ snapshotDate: d })),
    3,
  );
  const windowIcs = windows.map((w) => {
    const inWindow = [...byDate.entries()].filter(
      ([d]) => d >= w.start && d < w.end,
    );
    if (inWindow.length === 0) return null;
    return inWindow.reduce((s, [, ic]) => s + ic, 0) / inWindow.length;
  });
  const sign = avgIc > 0 ? 1 : -1;
  let sameSign = 0;
  let validWindows = 0;
  for (const w of windowIcs) {
    if (w === null) continue;
    validWindows += 1;
    if ((w > 0 ? 1 : -1) === sign) sameSign += 1;
  }
  const gate3 = validWindows >= 2 && sameSign >= 2;

  const verdict: FvH2Primary["verdict"] = !gate1
    ? "fail-statistical"
    : !gate2
      ? "fail-economic"
      : !gate3
        ? "fail-sign-stability"
        : "pass";

  return {
    horizon,
    nDates: ics.length,
    nDatesSkipped: skipped,
    avgIc,
    ci95,
    null99,
    gate1Statistical: gate1,
    gate2Economic: gate2,
    windowIcs,
    gate3SignStability: gate3,
    verdict,
  };
}

// ---------------------------------------------------------------
// H3 — convergence
// ---------------------------------------------------------------

function h3Cell(
  rows: readonly FvObservation[],
  regime: FvRegimeKey,
  horizon: number,
  weeklyClosesBySymbol: WeeklyCloses,
): FvH3Cell {
  const below = dedupeYearlyFv(rows.filter((o) => o.fv.belowP25 === true));
  const above = dedupeYearlyFv(rows.filter((o) => o.fv.belowP25 === false));

  type PathResult = { converged: boolean; days: number | null; terminalRatio: number | null };
  const walk = (o: FvObservation, target: number): PathResult | null => {
    const closes = weeklyClosesBySymbol.get(o.symbol);
    if (!closes) return null;
    const end = addYearsIso(o.snapshotDate, horizon);
    let terminal: number | null = null;
    let sawAny = false;
    for (const bar of closes) {
      if (bar.date <= o.snapshotDate) continue;
      if (bar.date > end) break;
      sawAny = true;
      terminal = bar.close;
      if (bar.close >= target) {
        return {
          converged: true,
          days: daysBetween(o.snapshotDate, bar.date),
          terminalRatio: null,
        };
      }
    }
    if (!sawAny) return null;
    return { converged: false, days: null, terminalRatio: terminal !== null ? terminal / target : null };
  };

  const results: PathResult[] = [];
  for (const o of below) {
    if (o.fv.p25 === null) continue;
    const r = walk(o, o.fv.p25);
    if (r) results.push(r);
  }
  const converged = results.filter((r) => r.converged);
  const daysSorted = converged
    .map((r) => r.days!)
    .sort((a, b) => a - b);
  const terminalSorted = results
    .filter((r) => !r.converged && r.terminalRatio !== null)
    .map((r) => r.terminalRatio!)
    .sort((a, b) => a - b);

  // Magnitude-matched control: at-or-above rows must rise by the
  // treatment arm's median required rise (p25/price − 1) in this cell.
  const requiredRises = below
    .filter((o) => o.fv.p25 !== null && o.price > 0)
    .map((o) => o.fv.p25! / o.price - 1)
    .sort((a, b) => a - b);
  const targetRisePct =
    requiredRises.length > 0 ? quantileSorted(requiredRises, 0.5) : null;
  let controlN = 0;
  let controlConverged = 0;
  if (targetRisePct !== null) {
    for (const o of above) {
      const r = walk(o, o.price * (1 + targetRisePct));
      if (!r) continue;
      controlN += 1;
      if (r.converged) controlConverged += 1;
    }
  }

  return {
    regime,
    horizon,
    nBelow: below.length,
    nWithPath: results.length,
    converged: converged.length,
    convergedFrac: results.length > 0 ? converged.length / results.length : null,
    convergedCi95:
      results.length > 0 ? wilsonInterval(converged.length, results.length) : null,
    timeToP25Days:
      daysSorted.length > 0
        ? {
            median: quantileSorted(daysSorted, 0.5),
            p25: quantileSorted(daysSorted, 0.25),
            p75: quantileSorted(daysSorted, 0.75),
          }
        : null,
    nonConvergedTerminalRatio:
      terminalSorted.length > 0
        ? {
            median: quantileSorted(terminalSorted, 0.5),
            p25: quantileSorted(terminalSorted, 0.25),
            p75: quantileSorted(terminalSorted, 0.75),
          }
        : null,
    control: {
      n: controlN,
      targetRisePct,
      converged: controlConverged,
      convergedFrac: controlN > 0 ? controlConverged / controlN : null,
      convergedCi95: controlN > 0 ? wilsonInterval(controlConverged, controlN) : null,
    },
  };
}

// ---------------------------------------------------------------
// H5 / H6 helpers
// ---------------------------------------------------------------

function bucketIndex(value: number, edges: readonly number[]): number {
  for (let i = 0; i < edges.length; i += 1) {
    if (value < edges[i]!) return i;
  }
  return edges.length;
}

function bucketLabels(
  prefix: string,
  edges: readonly number[],
  lowerBound: number,
): string[] {
  const labels: string[] = [];
  let lo: number | string = lowerBound;
  for (const edge of edges) {
    labels.push(`${prefix} [${lo}, ${edge})`);
    lo = edge;
  }
  labels.push(`${prefix} >= ${edges[edges.length - 1]}`);
  return labels;
}

/** Recompute belowP25 for a row under an ablation variant band. */
function withVariantBand(
  o: FvObservation,
  variant: "production" | "full9" | "own3" | "peer6",
): FvObservation {
  if (variant === "production") return o;
  const keys =
    variant === "full9"
      ? ALL_ANCHOR_KEYS
      : variant === "own3"
        ? OWN_ANCHOR_KEYS
        : PEER_ANCHOR_KEYS;
  const band = bandFromAnchors(o.fv.anchorsPre, keys);
  return {
    ...o,
    fv: {
      ...o.fv,
      p25: band?.p25 ?? null,
      median: band?.median ?? null,
      p75: band?.p75 ?? null,
      belowP25: band ? o.price < band.p25 : null,
      upsideToP25Pct:
        band && o.price > 0 ? ((band.p25 - o.price) / o.price) * 100 : null,
    },
  };
}

// ---------------------------------------------------------------
// Date + formatting helpers
// ---------------------------------------------------------------

function addYearsIso(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "n/a";
  return `${(v * 100).toFixed(2)}%`;
}
