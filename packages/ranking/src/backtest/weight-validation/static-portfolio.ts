/**
 * Static-portfolio backtest candidates — portfolios whose composition
 * doesn't depend on the ranker output (VOO buy-and-hold, VOO 50/50
 * barbell, 100% VOO CSP collateral).
 *
 * The weight-validation pipeline normally selects a top decile under a
 * weight vector and measures excess vs SPY. Static portfolios bypass
 * the selection entirely: their per-snapshot return is a closed-form
 * function of the snapshot's SPY return and a yield assumption.
 *
 * Yields are inputs, not measurements:
 *   - `collateralYield` — annualized rate on the CSP cash collateral
 *     (T-bills / SPAXX). User confirmed 4.5% as the current baseline.
 *   - `putPremiumYield` — annualized NET put premium yield after
 *     assignment losses. Reasonable sweep: 3% / 6% / 9%.
 *
 * Both compound over the horizon; cumulative yield over Y years is
 * `(1 + collateralYield + putPremiumYield)^Y - 1`. The collateral and
 * premium streams share the same capital (the CSP collateral earns
 * interest WHILE the put is open), so they sum before compounding.
 *
 * Tax/friction metadata (`annualTurnover`, `incomeShare`) lives on the
 * candidate so the frictions overlay can apply uniform haircuts across
 * weight-vector and static candidates.
 */

import { bootstrapMeanCi, mulberry32 } from "../../stats.js";
import type { HorizonPerformance } from "./types.js";

export type StaticPortfolioYields = {
  /** Annualized cash-yield on the CSP collateral, e.g. 0.045 for 4.5%. */
  collateralYield: number;
  /** Annualized NET put premium yield (after assignment losses), e.g. 0.06. */
  putPremiumYield: number;
};

export type StaticPortfolioCandidate = {
  /** Stable identifier — appears in the report. */
  name: string;
  description?: string;
  /** Source label for the report ("static-baseline" etc.). */
  source?: string;
  /**
   * Cumulative return at the given horizon for one snapshot, as a
   * function of the snapshot's cumulative SPY return at that horizon.
   * Both returns are decimals (e.g. 0.20 = +20%) and both are
   * CUMULATIVE over the horizon, not annualized — matching the rest
   * of the weight-validation pipeline.
   */
  perSnapshotReturn: (snapshotSpyReturn: number, horizonYears: number) => number;
  /**
   * Implied annual portfolio turnover (1.0 = full rebuild every year).
   * Used by the frictions overlay to scale per-trade-cost into a
   * portfolio drag.
   */
  annualTurnover: number;
  /**
   * Fraction of total return treated as ordinary-income / short-term
   * gains for tax purposes. Put premium and collateral interest get
   * ordinary-income treatment; VOO capital appreciation gets LTCG.
   * The frictions overlay uses this to weight the tax haircut between
   * the two regimes.
   */
  incomeShare: number;
};

/** Cumulative yield (decimal) for `annualYield` compounded over `years`. */
export function cumulativeYieldOver(annualYield: number, years: number): number {
  return Math.pow(1 + annualYield, years) - 1;
}

export function vooBuyAndHold(): StaticPortfolioCandidate {
  return {
    name: "voo-buy-and-hold",
    description: "100% VOO bought once, held — captures the full SPY total return",
    source: "static-baseline",
    perSnapshotReturn: (spy) => spy,
    annualTurnover: 0,
    incomeShare: 0,
  };
}

export function vooCspFull(yields: StaticPortfolioYields): StaticPortfolioCandidate {
  const combined = yields.collateralYield + yields.putPremiumYield;
  return {
    name: `voo-csp-100 (${formatYieldPair(yields)})`,
    description:
      "100% of capital sits as VOO CSP collateral — collateral interest + put premium income, no SPY exposure except on assignment",
    source: "static-csp",
    perSnapshotReturn: (_spy, horizon) => cumulativeYieldOver(combined, horizon),
    annualTurnover: 1,
    incomeShare: 1,
  };
}

export function vooBarbell50_50(yields: StaticPortfolioYields): StaticPortfolioCandidate {
  const combined = yields.collateralYield + yields.putPremiumYield;
  return {
    name: `voo-barbell-50/50 (${formatYieldPair(yields)})`,
    description:
      "50% VOO outright + 50% as VOO CSP collateral — captures half of SPY plus half of the collateral+premium yield",
    source: "static-barbell",
    perSnapshotReturn: (spy, horizon) =>
      0.5 * spy + 0.5 * cumulativeYieldOver(combined, horizon),
    annualTurnover: 0.5,
    incomeShare: 0.5,
  };
}

function formatYieldPair(yields: StaticPortfolioYields): string {
  return `coll ${(yields.collateralYield * 100).toFixed(1)}% + put ${(yields.putPremiumYield * 100).toFixed(1)}%`;
}

export type StaticPortfolioInput = {
  candidate: StaticPortfolioCandidate;
  /** Map keyed by snapshotDate → Map keyed by horizon-as-string → cumulative SPY return. */
  spyReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  horizon: number;
  /** ISO date — only snapshots on/after this date contribute. */
  testPeriodStart: string;
  bootstrapResamples?: number;
  seed?: number;
};

/**
 * Mean realized return and mean excess vs SPY for a static portfolio
 * across the test-period snapshots. Mirrors the per-horizon shape of
 * the weight-vector candidate's `HorizonPerformance` so the reporting
 * layer can iterate uniformly.
 */
export function computeStaticPortfolioPerHorizon(
  input: StaticPortfolioInput,
): HorizonPerformance {
  const {
    candidate,
    spyReturnsByDate,
    horizon,
    testPeriodStart,
    bootstrapResamples = 1000,
    seed = 1,
  } = input;

  const perSnapshotRealized: number[] = [];
  const perSnapshotExcess: number[] = [];

  for (const [date, byHorizon] of spyReturnsByDate) {
    if (date < testPeriodStart) continue;
    const spy = byHorizon.get(String(horizon));
    if (spy === undefined) continue;
    const realized = candidate.perSnapshotReturn(spy, horizon);
    perSnapshotRealized.push(realized);
    perSnapshotExcess.push(realized - spy);
  }

  if (perSnapshotRealized.length === 0) {
    return {
      horizon,
      meanRealized: null,
      meanExcess: null,
      excessCi95: null,
      nSnapshots: 0,
    };
  }

  const meanRealized =
    perSnapshotRealized.reduce((a, b) => a + b, 0) / perSnapshotRealized.length;
  const meanExcess =
    perSnapshotExcess.reduce((a, b) => a + b, 0) / perSnapshotExcess.length;
  const rng = mulberry32(seed);
  const excessCi95 = bootstrapMeanCi(perSnapshotExcess, bootstrapResamples, 0.05, rng);

  return {
    horizon,
    meanRealized,
    meanExcess,
    excessCi95,
    nSnapshots: perSnapshotRealized.length,
  };
}
