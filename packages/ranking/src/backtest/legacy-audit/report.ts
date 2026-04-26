/**
 * Markdown rendering for the legacy-rule audit (backtest.md §3.5).
 */

import type { LegacyAuditReport } from "./types.js";

export function renderLegacyAuditReport(report: LegacyAuditReport): string {
  const lines: string[] = [];
  lines.push(`# Legacy-rule audit — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `**Snapshot range:** ${report.snapshotRange.start} → ${report.snapshotRange.end}`,
  );
  lines.push("");
  lines.push(
    "Each legacy rule (Quality floor) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.",
  );
  lines.push("");
  lines.push("## H11 — Quality floor (per-rule + combined)");
  lines.push("");
  lines.push("**Hypothesis:** " + report.verdicts.h11.hypothesis);
  lines.push("");
  lines.push(`**Verdict:** **${report.verdicts.h11.verdict}** — ${report.verdicts.h11.evidence}`);
  lines.push("");
  lines.push(
    "| Rule | Classification | Horizon | N | Mean excess | CI (95%) |",
  );
  lines.push("|---|---|---|---|---|---|");
  for (const r of report.floorRows) {
    const ex =
      r.meanForwardExcess === null
        ? "—"
        : `${(r.meanForwardExcess * 100).toFixed(2)}%`;
    const ci = r.excessCi95
      ? `[${(r.excessCi95.lo * 100).toFixed(2)}%, ${(r.excessCi95.hi * 100).toFixed(2)}%]`
      : "—";
    lines.push(`| ${r.rule} | ${r.classification} | ${r.horizon}y | ${r.nObservations} | ${ex} | ${ci} |`);
  }
  lines.push("");
  lines.push("## H12 — Turnaround watchlist (REMOVED 2026-04-26)");
  lines.push("");
  lines.push(
    "_The H12 watchlist hypothesis was removed along with the turnaround engine. Phase 2D.1 evidence had downgraded the watchlist to a regime-dependent short-horizon flag — the 3y signal flipped from +50.84 pp (COVID-recovery) to -20.29 pp (pre-COVID + delisted). The downgraded conclusion stands as final._");
  lines.push("");
  lines.push("## H10 — FV-trend demotion (DEFERRED)");
  lines.push("");
  lines.push(
    "_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._",
  );
  return lines.join("\n");
}
