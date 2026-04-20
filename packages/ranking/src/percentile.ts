/**
 * Percent rank of `value` within `cohort` on a 0–100 scale.
 *
 * Convention:
 * - Lowest value in the cohort scores 0; highest scores 100.
 * - Ties share the average rank of the tied positions ("midrank").
 * - A single-element cohort returns 50 (no comparison possible).
 * - Throws on empty cohort.
 *
 * `value` does not need to be a member of `cohort`; if not present, it is
 * scored as if inserted (extrapolated to 0 or 100 if outside the range).
 */
export function percentRank(value: number, cohort: readonly number[]): number {
  if (cohort.length === 0) {
    throw new Error("percentRank: cohort cannot be empty");
  }
  if (cohort.length === 1) return 50;

  let below = 0;
  let equal = 0;
  let cohortMin = cohort[0]!;
  let cohortMax = cohort[0]!;
  for (const v of cohort) {
    if (v < value) below += 1;
    else if (v === value) equal += 1;
    if (v < cohortMin) cohortMin = v;
    if (v > cohortMax) cohortMax = v;
  }

  // Clamp values outside the cohort's observed range — a value below the
  // minimum scores 0 (worst), above the maximum scores 100 (best). Without
  // this, midrank extrapolation would produce negative or >100 percentiles.
  if (value < cohortMin) return 0;
  if (value > cohortMax) return 100;

  const midrank = below + (equal + 1) / 2;
  return ((midrank - 1) / (cohort.length - 1)) * 100;
}

/**
 * Convenience: compute percentRank for every value in `cohort` against
 * the cohort itself. Order of returned percentiles matches input order.
 */
export function percentRankAll(cohort: readonly number[]): number[] {
  return cohort.map((v) => percentRank(v, cohort));
}
