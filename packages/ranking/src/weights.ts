import type { CategoryWeights } from "./types.js";

/**
 * Default weights — value-tilted defensive (per ranking.md §8.1).
 * These are the user's defaults, not generic. Sliders in the UI mutate
 * these in-browser; this constant is the reset target.
 *
 * Momentum is intentionally 0% at default per ranking.md §11.6 —
 * factor still computed and visible, but doesn't shift composite
 * scores until the IC pipeline (backtest.md §3.9) provides evidence
 * for raising it.
 */
export const DEFAULT_WEIGHTS: CategoryWeights = {
  valuation: 0.35,
  health: 0.25,
  quality: 0.15,
  shareholderReturn: 0.15,
  growth: 0.1,
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
