import type { CategoryKey, RankedRow } from "./types.js";

/**
 * Three-bucket classifier for the Results screen tabs.
 *
 *   - **ranked**   — actionable buy candidates: passed the quality floor,
 *                    all 5 category scores computable, fair value present,
 *                    current price below the conservative-tail (p25), and
 *                    the options chain is liquid enough to act on.
 *   - **watch**    — interesting but not actionable today: either above the
 *                    conservative-tail, missing exactly one category score,
 *                    or carrying a structural-but-tracked flag like negative
 *                    equity or illiquid options.
 *   - **excluded** — diagnostic bucket: failed the quality floor entirely,
 *                    missing two or more category scores, or no fair value
 *                    range computable.
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

const ALL_CATEGORIES: CategoryKey[] = [
  "valuation",
  "health",
  "quality",
  "shareholderReturn",
  "growth",
];

/** Count of category scores that couldn't be computed. */
function missingCategoryCount(row: RankedRow): number {
  let missing = 0;
  for (const cat of ALL_CATEGORIES) {
    if (row.categoryScores[cat] === null) missing += 1;
  }
  return missing;
}

export function classifyRow(row: RankedRow): BucketKey {
  const missing = missingCategoryCount(row);

  // Names that failed the quality floor — surfaced as RankedRow stubs
  // with all 5 category scores null. These come straight here regardless
  // of negative-equity / fair-value status; they didn't even get scored.
  if (missing === 5) return "excluded";

  // Negative-equity names (BKNG, MCD, MO, …) get ROIC nulled
  // structurally (the ratio divides by equity). That's not a data gap;
  // it's a strategic-buyback consequence. Treat them as Watch even when
  // the missing-category count would otherwise demote them — but if
  // there's no fair value at all, fall back to Excluded.
  if (row.negativeEquity) {
    if (!row.fairValue || !row.fairValue.range) return "excluded";
    return "watch";
  }

  if (missing >= 2) return "excluded";
  if (!row.fairValue || !row.fairValue.range) return "excluded";
  if (missing === 1) return "watch";

  // Ranked requires the stock to be trading below the conservative-tail
  // fair value. Above it and we're not getting a value entry —
  // interesting to follow but not actionable today.
  const belowP25 = row.fairValue.current < row.fairValue.range.p25;
  if (!belowP25) return "watch";

  // Declining FV trend is a "fundamentals deteriorating" signal — per
  // the back-test miss-analysis, ~96% of names that miss p25 within
  // the horizon also see their FV decline over the same period. Avoid
  // entering until the trend reverses. (Stable / improving / unknown
  // trends pass; only "declining" demotes.)
  if (row.fvTrend === "declining") return "watch";

  // Illiquid options chain is itself a quality signal — quality stocks
  // have active options markets. Demote to Watch if the options
  // pipeline didn't surface at least one OTM call AND one OTM put.
  if (!row.optionsLiquid) return "watch";

  return "ranked";
}

export function bucketRows(rows: RankedRow[]): BucketedRows {
  const out: BucketedRows = { ranked: [], watch: [], excluded: [] };
  for (const row of rows) {
    out[classifyRow(row)].push(row);
  }
  return out;
}
