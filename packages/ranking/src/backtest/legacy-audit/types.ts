/**
 * Types for the legacy-rule audit (backtest.md §3.5).
 *
 * Two hypotheses get the same evidence bar as new factors:
 *   H10 — FV-trend demotion: declining-trend names underperform peers
 *   H11 — Quality floor exclusion: excluded names underperform
 *
 * H10 is stubbed (requires backtest-side FV-trend reconstruction
 * which isn't yet built); H11 is fully implemented.
 *
 * H12 (turnaround watchlist) was REMOVED 2026-04-26 along with the
 * turnaround engine. Phase 2D.1 evidence had downgraded the watchlist
 * to a "regime-dependent short-horizon flag" — the 3y signal flipped
 * from +50.84 pp (COVID) to -20.29 pp (pre-COVID + delisted). Without
 * the engine producing the watchlist, the audit can't run; the
 * downgraded conclusion stands as the final verdict.
 */

export type FloorRuleKey =
  | "profitable-3of5"
  | "sector-relative-roic"
  | "interest-coverage"
  | "combined";

/** Per-snapshot, per-company classification under the §4 floor. */
export type FloorClassification = {
  symbol: string;
  snapshotDate: string;
  /** True iff company would PASS the combined floor (all rules). */
  passedCombined: boolean;
  /** Per-rule pass/fail — for the per-rule stratification in §3.5. */
  perRule: Record<FloorRuleKey, boolean | null>;
};

/** One row of the H11 stratification table. */
export type FloorAuditRow = {
  rule: FloorRuleKey;
  classification: "passed" | "failed";
  horizon: number;
  nObservations: number;
  meanForwardExcess: number | null;
  excessCi95: { lo: number; hi: number } | null;
};

export type LegacyAuditReport = {
  generatedAt: string;
  /** ISO date range of snapshots audited. */
  snapshotRange: { start: string; end: string };
  /** H11 — per-rule + combined floor pass/fail returns. */
  floorRows: FloorAuditRow[];
  /** Verdicts derived from the rows. */
  verdicts: {
    h11: { hypothesis: string; verdict: "pass" | "fail" | "inconclusive"; evidence: string };
  };
};
