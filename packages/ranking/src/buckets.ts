import type { CategoryKey, RankedRow } from "./types.js";

/**
 * Industries where the engine's PE / EV-EBITDA / P-FCF anchors
 * structurally don't apply — the accounting framework is too
 * different (banks, capital markets, reinsurance). For these names
 * we go straight to Excluded; computing a fair value here would
 * just be model-incompatibility noise.
 *
 * Calibrated from snapshot audit (2026-04-23): 100% of names in
 * these industries had EV/EBITDA AND P/FCF anchors null because
 * EBITDA isn't meaningful (banks treat deposits as liabilities
 * not debt; capital-markets firms have carry-comp distorting
 * earnings; reinsurers have claims-reserve accounting).
 *
 * Asset Management is intentionally NOT here — it's partially
 * compatible (PE-only) and downstream confidence layer flags it.
 *
 * Future-improvement note: each of these has a dedicated valuation
 * framework (book value / NAV / embedded value). When we build
 * those, names move out of this list and into their proper anchor.
 */
export const MODEL_INCOMPATIBLE_INDUSTRIES = new Set<string>([
  "Banks - Regional",
  "Banks - Diversified",
  "Capital Markets",
  "Insurance - Reinsurance",
]);

/**
 * Three-bucket classifier for the Results screen tabs.
 *
 *   - **ranked**   — actionable buy candidates: passed the quality floor,
 *                    fair value present, current price below the
 *                    conservative-tail (p25), FV trend not declining.
 *                    Options liquidity is NOT a gate — names without
 *                    options still show as share-purchase candidates;
 *                    the UI hides the options-strategy panels (CSP,
 *                    buy-write, covered call) for illiquid-options
 *                    rows. fundamentalsDirection is also NOT a gate
 *                    (Phase 2B rejected the filter as regime-unstable).
 *   - **watch**    — interesting but not actionable today: above the
 *                    conservative-tail, declining FV trend, or
 *                    carrying a structural-but-tracked flag like
 *                    negative equity.
 *   - **excluded** — diagnostic bucket: failed the quality floor entirely
 *                    (all 5 category scores null — the ineligible-row
 *                    stub) or no fair value range computable.
 *
 * Note: missing some-but-not-all category scores no longer affects the
 * bucket. Earlier the rule was missing>=2 → excluded, missing===1 →
 * watch, but that wasn't a data-driven decision and tossed otherwise-
 * good Candidates out for thin-data reasons. The composite score
 * already handles missing categories by averaging across what's
 * available, which is the right way to weight uncertainty.
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
  // Model-incompatible industries (banks, capital markets, reinsurance)
  // skip the entire pipeline — even an attractive-looking FV is just
  // PE-extrapolation noise on accounting structures the model wasn't
  // built for. This precedes the quality-floor / negative-equity
  // checks because it's a stronger statement: not "this name failed
  // a screen" but "this name is outside our model's domain."
  if (MODEL_INCOMPATIBLE_INDUSTRIES.has(row.industry)) return "excluded";

  const missing = missingCategoryCount(row);

  // Names that failed the quality floor — surfaced as RankedRow stubs
  // with all 5 category scores null. These come straight here regardless
  // of negative-equity / fair-value status; they didn't even get scored.
  if (missing === 5) return "excluded";

  // Negative-equity names (BKNG, MCD, MO, …) get ROIC nulled
  // structurally (the ratio divides by equity). That's not a data gap;
  // it's a strategic-buyback consequence. Treat them as Watch — but if
  // there's no fair value at all, fall back to Excluded.
  if (row.negativeEquity) {
    if (!row.fairValue || !row.fairValue.range) return "excluded";
    return "watch";
  }

  // Without a fair-value range we can't ask whether the price is below
  // the conservative tail, so we can't classify as either ranked or
  // watch — fall to Excluded as a diagnostic bucket.
  if (!row.fairValue || !row.fairValue.range) return "excluded";

  // Ranked requires the stock to be trading below the conservative-tail
  // fair value. Above it and we're not getting a value entry —
  // interesting to follow but not actionable today.
  const belowP25 = row.fairValue.current < row.fairValue.range.p25;
  if (!belowP25) return "watch";

  // The fvTrend === "declining" demotion was REMOVED 2026-04-26.
  // Phase 4C H10 audit
  // (docs/specs/backtest-actions-2026-04-26-phase4.md §3) showed
  // the rule is unjustified by forward-return evidence:
  //   PIT 2018-2023: declining cohort 3y -4.76% vs stable+improving
  //                  -10.05% — declining OUTPERFORMS by +5.30 pp
  //                  (rule actively HARMFUL)
  //   PIT 2010-2018: declining vs stable+improving within 2 pp —
  //                  no clear edge
  // Original calibration (~96% of miss-p25 events coincide with
  // declining FV) was measuring a different question on biased data.
  // Same pattern as the fundamentalsDirection rule we removed
  // 2026-04-25 — defensive intuition that doesn't survive PIT
  // weight-validation. fvTrend stays on RankedRow as informational
  // metadata for the UI drill-down.

  // The fundamentalsDirection=declining demotion was REMOVED 2026-04-25.
  // Phase 2B weight-validation backtest evidence
  // (docs/specs/backtest-actions-2026-04-25-phase2.md §1) showed that
  // filtering declining-fundamentals names from the top decile is
  // regime-unstable — within noise in the COVID window (+0.20 pp at
  // 3y) and substantially HARMFUL in pre-COVID (-5.36 pp at 3y).
  // The filter kicks out companies emerging from troughs that
  // value-deep specifically wants to buy; the Quality category
  // (10% weight) already captures profitability via ROIC + accruals.
  //
  // Earlier calibration (2020-2024, n=1493 flag-date events) showed
  // declining-cohort recovery rate 47% vs stable 65% — but that was
  // measuring a different question (recovery to FV) on biased
  // survivor-only data. The PIT-aware Phase 2B test is more
  // rigorous and the right authority on the engine's downstream
  // bucket placement. The fundamentalsDirection field stays on the
  // RankedRow as informational for the UI drill-down.

  // Note: options liquidity is NOT a bucket gate. Names without an
  // active options market still show up in Ranked when they pass the
  // valuation/quality screens — the user can buy shares directly even
  // when CSPs / buy-writes / covered calls aren't available. The
  // `optionsLiquid` field stays on the row so the UI can hide the
  // options-strategy panels for those rows; bucket placement doesn't
  // change. (Earlier this rule demoted illiquid-options names to Watch
  // on a "quality signal" theory; user override 2026-04-25 removed it
  // because the share-purchase strategy itself is still actionable.)
  return "ranked";
}

export function bucketRows(rows: RankedRow[]): BucketedRows {
  const out: BucketedRows = { ranked: [], watch: [], excluded: [] };
  for (const row of rows) {
    out[classifyRow(row)].push(row);
  }
  return out;
}
