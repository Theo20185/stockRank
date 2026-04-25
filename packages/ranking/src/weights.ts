import type { CategoryWeights } from "./types.js";

/**
 * Default weights — value-deep (per ranking.md §8.1, updated
 * 2026-04-25). These are the universal default; sliders in the UI
 * mutate them in-browser, and this constant is the reset target.
 *
 * Migrated from the original value-tilted-defensive weights
 * (35/25/15/15/10) after the §3.11.1 weight-validation rule
 * confirmed value-deep beats the prior default by +8.81 pp at the
 * 3y horizon (CI [+30.84%, +40.99%] vs default [+21.09%, +32.99%]).
 * Evidence: docs/backtest-weight-validation-2026-04-25.md +
 * docs/specs/backtest-actions-2026-04-25.md §2.1.
 *
 * Momentum stays 0% at default per ranking.md §11.6 — factor still
 * computed and visible for the IC pipeline, but doesn't shift
 * composite scores until evidence justifies a non-zero weight in
 * at least one super-group.
 */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  valuation: 0.50,
  health: 0.20,
  quality: 0.10,
  shareholderReturn: 0.10,
  growth: 0.10,
  momentum: 0,
};

/**
 * Normalizes weights so they sum to 1, dropping null/undefined categories.
 * Throws if the provided weights would all be zero.
 *
 * Momentum at 0 is fine — `total` only fails when EVERY weight is zero,
 * which is a configuration error rather than a 0-weight category being
 * treated as missing.
 */
export function normalizeWeights(
  weights: Partial<CategoryWeights>,
): CategoryWeights {
  const merged: CategoryWeights = { ...DEFAULT_WEIGHTS, ...weights };
  const total =
    merged.valuation +
    merged.health +
    merged.quality +
    merged.shareholderReturn +
    merged.growth +
    merged.momentum;
  if (total <= 0) {
    throw new Error("normalizeWeights: total weight must be > 0");
  }
  return {
    valuation: merged.valuation / total,
    health: merged.health / total,
    quality: merged.quality / total,
    shareholderReturn: merged.shareholderReturn / total,
    growth: merged.growth / total,
    momentum: merged.momentum / total,
  };
}
