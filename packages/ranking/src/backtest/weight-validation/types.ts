/**
 * Types for the weight-validation backtest (backtest.md §3.11).
 *
 * The validation runs candidate weight vectors against a held-out
 * test window and asks: does the top decile by composite (under this
 * weight vector) beat SPY by a meaningful margin out-of-sample?
 *
 * Adoption rule: a candidate is adopted only if mean excess return
 * at the 3y horizon is ≥ 1%/yr higher than the default's, with
 * bootstrap CI not crossing zero.
 */

import type { CategoryKey, CategoryWeights, FactorKey } from "../../types.js";

/**
 * Optional sub-factor weight overrides — per category, a partial map
 * of factor → weight. When provided for a category, the listed factors
 * are weighted as specified (with the remainder of the category's
 * weight, if any, distributed equally to unlisted factors). When
 * omitted for a category, the historical equal-weight-within-category
 * convention applies.
 *
 * Example — boost EV/EBITDA inside the Valuation category:
 *   { valuation: { evToEbitda: 0.6, priceToFcf: 0.2,
 *                  peRatio: 0.1, priceToBook: 0.1 } }
 *
 * Within each category map, the supplied weights should sum to 1
 * (caller-validated).
 */
export type SubFactorWeights = Partial<
  Record<CategoryKey, Partial<Record<FactorKey, number>>>
>;

/**
 * Pre-decile filters that screen names OUT before the top-decile
 * selection. Used by Phase 2B combined-screen stacking — candidates
 * can opt to filter on signals that are validated independently
 * (e.g., fundamentalsDirection ≠ declining).
 *
 * When `excludeFundamentalsDirections` is supplied, observations
 * whose `fundamentalsDirection` field matches any listed direction
 * are dropped from the candidate's universe before the top-decile
 * cut. The filter applies per-snapshot.
 */
export type PreDecileFilter = {
  excludeFundamentalsDirections?: ReadonlyArray<
    "improving" | "stable" | "declining" | "insufficient_data"
  >;
};

/** A named weight vector to evaluate. */
export type CandidateWeights = {
  /** Stable identifier — appears in the report. */
  name: string;
  /** Optional human-readable description, surfaced in the report. */
  description?: string;
  /** Source label — "default", "ic-derived", "academic-prior", etc. */
  source?: string;
  weights: CategoryWeights;
  /** Optional within-category factor weights. When omitted, factors
   * within each category are equal-weighted (historical default). */
  subFactorWeights?: SubFactorWeights;
  /** Optional pre-decile screen. When omitted, no filtering — all
   * observations participate in the top-decile selection. */
  filter?: PreDecileFilter;
};

/** Per-horizon performance metric for a single candidate. */
export type HorizonPerformance = {
  horizon: number;
  /** Mean realized return of the top-decile cohort across all
   * test-period snapshots, equal-weighted within each snapshot then
   * averaged across snapshots. */
  meanRealized: number | null;
  /** Mean excess return vs SPY (mean of (realized - spy) per snapshot). */
  meanExcess: number | null;
  /** Bootstrap 95% CI on the mean excess return. */
  excessCi95: { lo: number; hi: number } | null;
  /** Number of (snapshot) data points contributing to the mean. */
  nSnapshots: number;
};

/** Validation result for one candidate. */
export type CandidateResult = {
  candidate: CandidateWeights;
  perHorizon: HorizonPerformance[];
};

/** Adoption verdict for a candidate vs the default. */
export type AdoptionVerdict = {
  candidateName: string;
  verdict: "adopt" | "reject";
  reason: string;
  /** Excess vs default at the 3y horizon (positive = candidate
   * outperforms). Null when 3y data is missing for either. */
  excessVsDefault3y: number | null;
};

export type WeightValidationReport = {
  generatedAt: string;
  trainPeriod: { start: string; end: string };
  testPeriod: { start: string; end: string };
  /** First entry is the default — others are compared against it. */
  candidates: CandidateResult[];
  verdicts: AdoptionVerdict[];
};
