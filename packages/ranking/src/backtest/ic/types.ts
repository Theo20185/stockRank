/**
 * Shared types for the IC analysis pipeline (backtest.md §3.9–3.10).
 *
 * The pipeline operates on a flat array of `IcObservation` rows —
 * each row represents one (symbol, snapshot date) point with its
 * factor percentiles and realized forward excess return at one
 * horizon. This shape is what the Monte Carlo shuffle, the per-cell
 * IC computation, and the rolling-window stability check all consume.
 */

import type { FactorKey } from "../../types.js";
import type { SuperGroupKey } from "../../super-groups.js";

/** One per (symbol, snapshotDate, horizon) — the atom of IC analysis. */
export type IcObservation = {
  symbol: string;
  /** ISO date — snapshot at which factors were measured. */
  snapshotDate: string;
  /** Calendar year of snapshotDate — used by the yearly-dedup rule
   * (backtest.md §3.9.3) so we don't claim N=6,000 when the
   * effective sample size is 60. */
  snapshotYear: number;
  /** Super-group the symbol mapped to at the snapshot date. */
  superGroup: SuperGroupKey;
  /** Forward horizon in years (1, 2, 3, 5). */
  horizon: number;
  /**
   * Factor percentile at the snapshot date — already direction-
   * adjusted (higher = better) so IC sign is comparable across
   * "lower is better" and "higher is better" factors. Null when the
   * factor wasn't computable for this symbol on this date.
   */
  factorPercentiles: Partial<Record<FactorKey, number>>;
  /**
   * Excess return = realizedReturn(symbol, T+horizon) − spyReturn(T+horizon).
   * The IC target. Always present — observations without a complete
   * forward window are filtered out at construction.
   */
  excessReturn: number;
  /**
   * Pre-computed fundamentals-direction signal at snapshot date.
   * Used by Phase 2B combined-screen stacking — candidates can opt
   * to filter out names whose fundamentals were declining at T.
   * "insufficient_data" when the snapshot lacks enough EPS history.
   */
  fundamentalsDirection?:
    | "improving"
    | "stable"
    | "declining"
    | "insufficient_data";
};

/**
 * Result of computing IC for one (superGroup, factor, horizon) cell.
 * Bootstrapped CIs and rolling-window sign-stability included so the
 * three-gate filter (§3.10) can be applied without re-reading the raw
 * observations.
 */
export type IcCell = {
  superGroup: SuperGroupKey;
  factor: FactorKey;
  horizon: number;
  /** Effective N = number of (symbol, year) pairs after dedup. */
  nEffective: number;
  /** Spearman IC point estimate. Null when too few observations or
   * factor/return is constant within the cell. */
  ic: number | null;
  /** Bootstrap 95% CI on the IC. Null when nEffective is too small
   * for a meaningful CI (< 5 pairs). */
  ci95: { lo: number; hi: number } | null;
  /** Per-rolling-window IC values used for the sign-stability gate.
   * Length = number of rolling windows (default 3). Null entries
   * mean the window had insufficient data. */
  windowIcs: Array<number | null>;
};

/**
 * Output of the Monte Carlo Phase 0 calibration (§3.10.1) — one row
 * per (superGroup, horizon). The threshold is per-cell because Banks
 * 3y at N=2000 has a very different noise floor than Tobacco 1y at
 * N=80.
 */
export type IcNullThreshold = {
  superGroup: SuperGroupKey;
  horizon: number;
  /** Median effective N observed across the Monte Carlo iterations.
   * Provides context for interpreting the threshold. */
  nEffective: number;
  /** 99th percentile of |IC| under the shuffled-returns null
   * distribution. The Gate 1 threshold. */
  threshold99: number;
  /** 99.5th percentile — provided for consumers wanting a stricter
   * gate (e.g., when many factors are tested in the same cell). */
  threshold995: number;
};

/** A complete Phase 0 calibration archive, keyed by (superGroup, horizon). */
export type IcCalibration = {
  /** Number of Monte Carlo iterations used to build the thresholds. */
  iterations: number;
  /** ISO date — when the calibration was run. */
  generatedAt: string;
  thresholds: IcNullThreshold[];
};

/**
 * The output of applying the three gates (§3.10) to an IcCell.
 * Renders as a colored value in the heatmap when verdict is "pass";
 * renders as "—" with a tooltip otherwise.
 */
export type ThreeGateVerdict = {
  /** "pass" when all three gates pass; "fail-<reason>" otherwise. */
  verdict:
    | "pass"
    | "fail-statistical"
    | "fail-economic"
    | "fail-sign-stability"
    | "fail-insufficient-data";
  /** Human-readable explanation. Used in tooltips. */
  reason: string;
};

export type IcCellWithVerdict = IcCell & {
  verdict: ThreeGateVerdict;
};

/**
 * Final output of the IC pipeline — heatmap-ready cells filtered by
 * the three gates, plus calibration metadata for traceability.
 */
export type IcReport = {
  generatedAt: string;
  calibrationRef: string;
  cells: IcCellWithVerdict[];
  /** Per-horizon counts of pass/fail verdicts — quick health check. */
  summary: {
    horizon: number;
    passing: number;
    failingStatistical: number;
    failingEconomic: number;
    failingSignStability: number;
    failingInsufficientData: number;
  }[];
};
