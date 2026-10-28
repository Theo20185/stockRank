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
 *   - **ranked** — candidates: passed the §4 quality floor, scoreable,
 *                  model-compatible. The fair-value band does NOT
 *                  gate candidacy (removed 2026-10-28, see below).
 *                  Options liquidity is NOT a gate — names without
 *                  options still show as share-purchase candidates;
 *                  the UI hides the options-strategy panels for
 *                  illiquid-options rows. fundamentalsDirection is
 *                  NOT a gate (Phase 2B rejected it as
 *                  regime-unstable).
 *   - **watch**  — structurally-tracked-but-different: negative-equity
 *                  names (ROIC structurally null; strategic-buyback
 *                  balance sheets like BKNG/MCD/MO).
 *   - **avoid**  — engine wants you out (or to skip entirely). One of:
 *                    * composite in the bottom decile of the eligible
 *                      cohort (Phase 4A long/short tail-avoidance);
 *                    * failed the §4 quality floor (all 5 category
 *                      scores null — the ineligible-row stub);
 *                    * model-incompatible industry (banks, capital
 *                      markets, reinsurance — accounting outside the
 *                      model's PE/EV-EBITDA/P-FCF domain).
 *
 * **The `price < p25` CANDIDATE gate was REMOVED 2026-10-28.** The FV
 * backtest harness measured it twice, with thresholds frozen before
 * each run:
 *   PIT 2011-2023 (2026-08-21): 0/8 regime×horizon cells pass;
 *     pooled 3y below-p25 gap −0.28%/yr; upsideToP25Pct marginally
 *     ANTI-predictive (avg IC −0.022); convergence-to-p25 BELOW a
 *     magnitude-matched control (59% vs 74% at 3y).
 *   Clean-input rerun (2026-10-28, split-basis + quarter-row fixes
 *     active, band coverage ~5× wider): gap −0.83%/yr, IC −0.026 —
 *     same verdict, stronger.
 * The band (p25/median/p75, upsideToP25Pct) stays on the row as
 * informational context — same informational-only status as fvTrend
 * and fundamentalsDirection. Floors exclude, the composite orders;
 * price levels do neither (docs/engine-gaps-2026-09-21.md §1).
 *
 * The "no fair-value range → avoid" branch left with the gate: its
 * only rationale was "can't ask the p25 question." A thin band is
 * data thinness — the same reason missing category scores stopped
 * affecting buckets — and the §4 floor + bottom-decile cut remain
 * the exclusion mechanisms.
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

export type BucketKey = "ranked" | "watch" | "avoid";

export type BucketedRows = {
  ranked: RankedRow[];
  watch: RankedRow[];
  /**
   * Either bottom-decile-by-composite eligible names OR diagnostic
   * rows the engine couldn't score (failed quality floor, no fair
   * value, model-incompatible industry). All four sub-cases share
   * the same user-facing answer; the per-stock rationale module
   * surfaces the specific reason on the detail page.
   *
   * Phase 4A long/short evidence: in COVID-era PIT data the bottom
   * decile underperformed SPY by ~25 pp at 3y while the top decile
   * only barely beat it. The engine's strongest signal is in the
   * tail; this view makes that actionable.
   */
  avoid: RankedRow[];
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
  if (MODEL_INCOMPATIBLE_INDUSTRIES.has(row.industry)) return "avoid";

  const missing = missingCategoryCount(row);

  // Names that failed the quality floor — surfaced as RankedRow stubs
  // with all 5 category scores null. These come straight here regardless
  // of negative-equity / fair-value status; they didn't even get scored.
  if (missing === 5) return "avoid";

  // Negative-equity names (BKNG, MCD, MO, …) get ROIC nulled
  // structurally (the ratio divides by equity). That's not a data gap;
  // it's a strategic-buyback consequence. The flag alone decides —
  // the old "no fair value → Avoid" sub-branch was band-dependent and
  // left with the p25 gate (2026-10-28).
  if (row.negativeEquity) return "watch";

  // The price < p25 CANDIDATE gate was REMOVED 2026-10-28 — see the
  // module header for the two FV-backtest verdicts (2026-08-21 and
  // the clean-input 2026-10-28 rerun; no edge in either, worse on
  // better data). The band stays on the row as informational context;
  // it no longer touches bucket placement. The companion
  // "no fair-value range → Avoid" branch left with it.

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

/**
 * Default cutoff for the Avoid bucket — bottom decile by composite
 * within the eligible (non-ineligible-stub) cohort. Phase 4A long/
 * short evidence used 10% as the matching cohort size.
 */
const AVOID_PERCENTILE_DEFAULT = 0.10;

/**
 * Partition rows into 3 mutually-exclusive buckets.
 *
 * Priority order (highest wins):
 *   1. avoid — classifyRow returned "avoid" (failed quality floor /
 *      no FV / model-incompatible industry / negative equity without
 *      FV) OR composite is in the bottom `avoidPercentile` of the
 *      eligible cohort. Both sub-cases share the bucket; the
 *      stock-detail rationale module surfaces the specific reason.
 *   2. watch / ranked — classifyRow's normal output for everything
 *      else.
 *
 * The Avoid bucket was added 2026-04-26 from Phase 4A long/short
 * evidence — in COVID-era PIT data, the bottom decile underperformed
 * SPY by ~25 pp at 3y while the top decile only barely beat it. The
 * engine's strongest signal is in the tail; this view makes that
 * actionable. The previously-separate Excluded bucket was rolled in
 * the same day — both answer "don't buy this," and surfacing them in
 * separate tabs forced the user to think about the difference rather
 * than just see all the names to skip in one place.
 */
export function bucketRows(
  rows: RankedRow[],
  options: { avoidPercentile?: number } = {},
): BucketedRows {
  const avoidPercentile = options.avoidPercentile ?? AVOID_PERCENTILE_DEFAULT;
  const out: BucketedRows = { ranked: [], watch: [], avoid: [] };

  // First pass — classify each row by classifyRow.
  const initial: Array<{ row: RankedRow; klass: BucketKey }> = rows.map(
    (row) => ({ row, klass: classifyRow(row) }),
  );

  // Determine the bottom-decile cohort over rows that classifyRow
  // would otherwise rank/watch. Diagnostic-bucket rows (already
  // classified as avoid by classifyRow) and zero-composite stubs
  // shouldn't dilute the cohort.
  const eligibleByComposite = initial
    .filter((e) => e.klass !== "avoid" && e.row.composite > 0)
    .map((e) => e.row.composite)
    .sort((a, b) => a - b);
  let avoidCutoff = -Infinity;
  if (eligibleByComposite.length > 0 && avoidPercentile > 0) {
    const idx = Math.max(
      0,
      Math.ceil(eligibleByComposite.length * avoidPercentile) - 1,
    );
    avoidCutoff = eligibleByComposite[idx]!;
  }

  // Second pass — apply bottom-decile Avoid override.
  for (const { row, klass } of initial) {
    if (klass === "avoid") {
      out.avoid.push(row);
      continue;
    }
    if (row.composite > 0 && row.composite <= avoidCutoff) {
      out.avoid.push(row);
      continue;
    }
    out[klass].push(row);
  }

  return out;
}
