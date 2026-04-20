import type { FactorKey, RankedRow } from "./types.js";

/**
 * Three-bucket classifier for the Results screen tabs.
 *
 *   - **ranked**   — actionable buy candidates: positive upside to fair value
 *                    AND complete data on the three load-bearing signals
 *                    (quality category score, P/B, ROIC).
 *   - **watch**    — useful to follow but not actionable today: either
 *                    negative upside on a complete-data name (already at or
 *                    above fair value), or positive upside with exactly one
 *                    of the three signals missing (still mostly informative).
 *   - **excluded** — diagnostic bucket for data gaps: no fair value at all,
 *                    or two or more of the three signals are missing.
 *
 * Pure function over RankedRow[]. The categorization is independent of the
 * ranking factor weights — moving sliders does not move a row between
 * buckets, only inside one.
 */

export type BucketKey = "ranked" | "watch" | "excluded";

export type BucketedRows = {
  ranked: RankedRow[];
  watch: RankedRow[];
  excluded: RankedRow[];
};

const SIGNAL_FACTORS: FactorKey[] = ["priceToBook", "roic"];

function hasSignal(row: RankedRow, factor: FactorKey): boolean {
  if (row.missingFactors.includes(factor)) return false;
  const detail = row.factorDetails.find((f) => f.key === factor);
  return detail !== undefined && detail.rawValue !== null;
}

function missingSignalCount(row: RankedRow): number {
  let missing = 0;
  if (row.categoryScores.quality === null) missing += 1;
  for (const f of SIGNAL_FACTORS) {
    if (!hasSignal(row, f)) missing += 1;
  }
  return missing;
}

export function classifyRow(row: RankedRow): BucketKey {
  const missing = missingSignalCount(row);

  // Negative-equity names (BKNG, MCD, MO, …) get ROIC and P/B nulled
  // structurally — both metrics divide by equity. That's not a data
  // gap; it's a strategic-buyback consequence. Treat the negative-
  // equity row as if those two signals weren't required: it still
  // can't appear in "Ranked" (incomplete quality view), but it shouldn't
  // be exiled to "Excluded" alongside genuine coverage gaps.
  if (row.negativeEquity) {
    if (!row.fairValue || !row.fairValue.range) return "excluded";
    return "watch";
  }

  if (missing >= 2) return "excluded";
  if (!row.fairValue || !row.fairValue.range) return "excluded";

  const upside = row.fairValue.upsideToMedianPct;
  const positiveUpside = upside !== null && upside > 0;

  if (missing === 1) return "watch";
  // missing === 0: positive upside → ranked, otherwise → watch
  return positiveUpside ? "ranked" : "watch";
}

export function bucketRows(rows: RankedRow[]): BucketedRows {
  const out: BucketedRows = { ranked: [], watch: [], excluded: [] };
  for (const row of rows) {
    out[classifyRow(row)].push(row);
  }
  return out;
}
