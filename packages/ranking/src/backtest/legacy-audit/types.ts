/**
 * Types for the legacy-rule audit (backtest.md §3.5).
 *
 * Three hypotheses get the same evidence bar as new factors (H7-H9):
 *   H10 — FV-trend demotion: declining-trend names underperform peers
 *   H11 — Quality floor exclusion: excluded names underperform
 *   H12 — Turnaround watchlist criteria pick fallen-angel signal
 *
 * H10 is stubbed (requires backtest-side FV-trend reconstruction
 * which isn't yet built); H11 and H12 are fully implemented.
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

/** Per-snapshot turnaround classification (§7). */
export type TurnaroundClassification = {
  symbol: string;
  snapshotDate: string;
  /** True iff company meets all 3 watchlist criteria. */
  isOnWatchlist: boolean;
  /** True iff company FAILED the §4 floor. The watchlist is a subset
   * of the excluded set; this lets H12 compare the two. */
  failedFloor: boolean;
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

/** One row of the H12 stratification table. */
export type TurnaroundAuditRow = {
  cohort: "watchlist" | "excluded-not-watchlist" | "spy";
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
  /** H12 — turnaround vs excluded-not-watchlist returns. */
  turnaroundRows: TurnaroundAuditRow[];
  /** Verdicts derived from the rows. */
  verdicts: {
    h11: { hypothesis: string; verdict: "pass" | "fail" | "inconclusive"; evidence: string };
    h12: { hypothesis: string; verdict: "pass" | "fail" | "inconclusive"; evidence: string };
  };
};
