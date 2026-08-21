/**
 * FV backtest harness types (H1–H6).
 *
 * The harness measures whether the fair-value engine's outputs
 * (`price < p25` gate, `upsideToP25Pct` ranking, `confidence` flag,
 * peer-derived anchors) predict realized forward excess returns. It is
 * a measurement layer only — it never feeds back into the engine.
 *
 * All hypotheses, thresholds, bucket edges, and verdict rules are
 * FROZEN here before any run (backtest.md §3.11.2 honesty bar):
 *
 *   H1  directional  — price < p25 → positive forward excess vs SPY?
 *   H2  monotonic    — upsideToP25Pct rank-predicts excess? (per-
 *                      snapshot-averaged Spearman primary; pooled
 *                      yearly-deduped secondary; three-gate vs
 *                      shuffled-returns null)
 *   H3  convergence  — of below-p25 names, what fraction traded at or
 *                      above p25 within the horizon, and how fast?
 *   H4  confidence   — do the confidence / divergence flags (and the
 *                      pre-declared deep-cyclical flag, added
 *                      2026-08-20 after NEM, before any run)
 *                      discriminate?
 *   H5  peer premium — does predictive power decay as the peer-vs-own
 *                      P/E ratio grows? (evidence for replacing the
 *                      5.0 cliff with continuous shrinkage)
 *   H6  ablation     — own-3 vs peer-6 vs full-9 anchor bands, plus
 *                      the effective number of independent anchors.
 */

import type { SuperGroupKey } from "../../super-groups.js";
import type {
  FairValueAnchors,
  FairValueConfidence,
  FairValuePeerSet,
} from "../../fair-value/types.js";

/** One row per (symbol, snapshotDate, horizon) — the atom of the
 * FV backtest. Prices are VALUATION basis (split-adjusted, not
 * dividend-adjusted); excess returns are TOTAL-RETURN basis. */
export type FvObservation = {
  symbol: string;
  /** ISO date — snapshot at which the band was computed. */
  snapshotDate: string;
  /** Calendar year — yearly-dedup key (§3.9.3). */
  snapshotYear: number;
  /** Super-group at snapshot (null when industry is unmapped — the
   * row still participates in universe-wide cells). */
  superGroup: SuperGroupKey | null;
  /** Forward horizon in years. */
  horizon: number;
  /** fwd(symbol) − fwd(SPY), both total-return basis. */
  excessReturn: number;
  /** Valuation-basis price at the snapshot. */
  price: number;
  /** Band + flags as the production engine computed them at T. */
  fv: {
    p25: number | null;
    median: number | null;
    p75: number | null;
    /** price < p25; null when the engine produced no band. */
    belowP25: boolean | null;
    upsideToP25Pct: number | null;
    confidence: FairValueConfidence;
    peerCohortDivergent: boolean;
    peerSet: FairValuePeerSet;
    /** Count of non-null positive anchors in the production band. */
    anchorCount: number;
    /** Post-divergence-suppression anchors (what production used). */
    anchors: FairValueAnchors;
    /** Pre-suppression anchors (H5 >5.0 bucket + H6 ablation). */
    anchorsPre: FairValueAnchors;
    ttmTreatment: "ttm" | "normalized";
  };
  /** median(peer TTM P/E) ÷ subject TTM P/E. Null when either side is
   * missing/non-positive. */
  peerPremiumRatioDirected: number | null;
  /** max(directed, 1/directed) — the quantity the production 5.0
   * cliff actually gates on. */
  peerPremiumRatioSymmetric: number | null;
  /** Pre-declared H4 stratum (2026-08-20, before any run): ≥1
   * non-null EPS ≤ 0 in annual[1:4] AND TTM EPS > 0 — the NEM
   * signature the spike defense was blind to. */
  deepCyclical: boolean;
};

/** Weekly valuation-basis closes per symbol — H3 convergence checks
 * slice these per observation. Weekly resolution is declared: time-
 * to-p25 is measured to ±1 week. */
export type WeeklyCloses = ReadonlyMap<
  string,
  ReadonlyArray<{ date: string; close: number }>
>;

export type FvRegimeKey = "pooled" | "pre-covid" | "covid" | "post-2022";

/** Fixed regime windows (declared before any run; boundaries match
 * the --max-snapshot-date conventions used by prior regime reruns). */
export const FV_REGIMES: ReadonlyArray<{
  key: FvRegimeKey;
  /** Inclusive ISO date bounds on snapshotDate; null = unbounded. */
  start: string | null;
  end: string | null;
}> = [
  { key: "pooled", start: null, end: null },
  { key: "pre-covid", start: null, end: "2018-12-31" },
  { key: "covid", start: "2019-01-01", end: "2021-12-31" },
  { key: "post-2022", start: "2022-01-01", end: null },
];

/** Minimum yearly-deduped observations for a cell to carry a verdict;
 * below this the numbers print tagged "underpowered". */
export const MIN_VERDICT_N = 30;

/** Minimum names in a date's cross-section for that date to
 * contribute a per-snapshot IC (H2). */
export const MIN_CROSS_SECTION = 10;

/** H1/H4/H5 economic floor: 1 pp/yr annualized edge — same hand-set
 * floor as §3.11.1 weight-validation adoption. Annualization is
 * declared as cumulative mean excess ÷ horizon. */
export const ANNUALIZED_EDGE_FLOOR = 0.01;

/** H5 symmetric-ratio bucket edges (primary; the brief's four
 * buckets applied to the symmetric ratio the production cliff gates
 * on). Intervals: [1, 1.5), [1.5, 2.5), [2.5, 5.0), [5.0, ∞). */
export const H5_SYMMETRIC_EDGES = [1.5, 2.5, 5.0] as const;

/** H5 directed-ratio bucket edges (secondary; exposes the two sides
 * separately). Intervals: (<0.4], (0.4, 0.67], (0.67, 1.5), [1.5,
 * 2.5), [2.5, 5.0), [5.0, ∞). */
export const H5_DIRECTED_EDGES = [0.4, 0.67, 1.5, 2.5, 5.0] as const;

/** Pairwise Spearman cells with fewer than this many co-present rows
 * are treated as 0 (independence) in the H6 correlation matrix and
 * flagged in the report. */
export const H6_MIN_PAIRWISE_N = 30;

// ---------------------------------------------------------------
// Result cell shapes
// ---------------------------------------------------------------

export type FvArmStats = {
  /** Raw row count before yearly dedup. */
  n: number;
  /** Yearly-deduped count — the effective N all bars apply to. */
  nDeduped: number;
  meanCumExcess: number | null;
  /** meanCumExcess ÷ horizon. */
  annualizedExcess: number | null;
  /** Bootstrap 95% CI on the ANNUALIZED mean. */
  annualizedCi95: { lo: number; hi: number } | null;
  medianCumExcess: number | null;
  /** Share of rows with excess > 0 + Wilson 95% interval. */
  hitRate: number | null;
  hitRateCi95: { lo: number; hi: number } | null;
};

/** One H1-style comparison cell: treatment vs control within a
 * (regime, horizon, stratum). */
export type FvH1Cell = {
  regime: FvRegimeKey;
  horizon: number;
  /** "all" for H1; stratum label for H4/H5 (e.g. "confidence=high"). */
  stratum: string;
  below: FvArmStats;
  atOrAbove: FvArmStats;
  /** Rows with no band at all (excluded from both arms). */
  nNoBand: number;
  /** Annualized (below − atOrAbove) gap; null when either arm empty. */
  gapAnnualized: number | null;
  verdict: "pass" | "fail" | "underpowered";
  reason: string;
};

export type FvH2Windows = Array<number | null>;

export type FvH2Primary = {
  horizon: number;
  /** Dates contributing (cross-section ≥ MIN_CROSS_SECTION). */
  nDates: number;
  nDatesSkipped: number;
  avgIc: number | null;
  /** Bootstrap CI over per-date ICs (resampling dates). */
  ci95: { lo: number; hi: number } | null;
  /** 99th pct of |avg IC| under the shuffled-returns null. */
  null99: number | null;
  gate1Statistical: boolean;
  gate2Economic: boolean;
  /** Per rolling-window avg ICs (3 windows over the date range). */
  windowIcs: FvH2Windows;
  gate3SignStability: boolean;
  verdict: "pass" | "fail-statistical" | "fail-economic" | "fail-sign-stability" | "fail-insufficient-data";
};

export type FvH2Secondary = {
  horizon: number;
  nDeduped: number;
  ic: number | null;
  ci95: { lo: number; hi: number } | null;
};

export type FvH3Cell = {
  regime: FvRegimeKey;
  horizon: number;
  nBelow: number;
  nWithPath: number;
  converged: number;
  convergedFrac: number | null;
  convergedCi95: { lo: number; hi: number } | null;
  /** Days from snapshot to first weekly close ≥ p25, over converged. */
  timeToP25Days: { median: number; p25: number; p75: number } | null;
  /** Terminal price/p25 ratio distribution over NON-converged rows. */
  nonConvergedTerminalRatio: { median: number; p25: number; p75: number } | null;
  /** Magnitude-matched control: at-or-above rows that rose by the
   * treatment arm's median required rise within the same window. */
  control: {
    n: number;
    targetRisePct: number | null;
    converged: number;
    convergedFrac: number | null;
    convergedCi95: { lo: number; hi: number } | null;
  };
};

export type FvH4Verdict = {
  comparison: string;
  horizon: number;
  regime: FvRegimeKey;
  gapAnnualized: number | null;
  verdict: "discriminating" | "decorative" | "underpowered";
  reason: string;
};

export type FvH5Trend = {
  regime: FvRegimeKey;
  horizon: number;
  /** Spearman of (bucket index, treatment−control gap). */
  bucketGapSpearman: number | null;
  monotonicDecay: boolean;
  topBucketGapNonPositive: boolean;
  verdict: "supports-shrinkage" | "no-decay-evidence" | "underpowered";
};

export type FvH6Variant = "production" | "full9" | "own3" | "peer6";

export type FvH6CorrelationReport = {
  anchorKeys: string[];
  /** Pairwise Spearman, row-median-normalized implied prices. */
  matrix: Array<Array<number | null>>;
  pairwiseN: number[][];
  /** Anchors present in < H6_MIN_PAIRWISE_N rows — excluded from the
   * eigen step so an absent anchor can't masquerade as an independent
   * evidence source (identity row → spurious eigenvalue 1). */
  excludedAnchorKeys: string[];
  /** Eigenvalues over the ACTIVE (non-excluded) anchor submatrix. */
  eigenvalues: number[];
  /** (Σλ)² / Σλ² over non-negative eigenvalues of the active block;
   * "X effective of N active" is the honest denominator. */
  effectiveAnchorCount: number;
  activeAnchorCount: number;
  cellsBelowMinN: number;
};

export type FvBacktestReport = {
  generatedAt: string;
  snapshotRange: { start: string; end: string };
  horizons: number[];
  /** Row bookkeeping so the doc can state coverage honestly. */
  totals: {
    observations: number;
    symbols: number;
    dates: number;
    noBandRows: number;
    engineErrorRows: number;
  };
  /** PIT caveat quantifications supplied by the runner. */
  pit: {
    capBucketChurnPct: number | null;
    industryMembershipNote: string;
    restatementNote: string;
  };
  h1: FvH1Cell[];
  h1CoarseCohortStress: FvH1Cell[] | null;
  h2Primary: FvH2Primary[];
  h2Secondary: FvH2Secondary[];
  h3: FvH3Cell[];
  h4Cells: FvH1Cell[];
  h4Verdicts: FvH4Verdict[];
  h5Cells: FvH1Cell[];
  h5Trends: FvH5Trend[];
  h5DirectedCells: FvH1Cell[];
  h6Cells: FvH1Cell[];
  h6Correlation: FvH6CorrelationReport | null;
  /** One-line verdict for the doc footer. */
  verdictLine: string;
};
