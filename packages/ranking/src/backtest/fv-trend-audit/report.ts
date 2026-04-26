/**
 * Markdown rendering for the FV-trend audit (Phase 4C / H10).
 */

import type { FvTrendAuditReport } from "./engine.js";

export function renderFvTrendAuditReport(report: FvTrendAuditReport): string {
  const lines: string[] = [];
  lines.push(`# FV-trend audit (H10) — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `**Snapshot range:** ${report.snapshotRange.start} → ${report.snapshotRange.end}`,
  );
  lines.push("");
  lines.push("**Hypothesis:** " + report.verdict.hypothesis);
  lines.push("");
  lines.push(
    `**Verdict:** **${report.verdict.verdict}** — ${report.verdict.evidence}`,
  );
  lines.push("");
  lines.push("## Per-trend × per-horizon excess return");
  lines.push("");
  lines.push("| Trend | Horizon | N | Mean excess | CI (95%) |");
  lines.push("|---|---|---|---|---|");
  for (const r of report.rows) {
    const ex =
      r.meanForwardExcess === null
        ? "—"
        : `${(r.meanForwardExcess * 100).toFixed(2)}%`;
    const ci = r.excessCi95
      ? `[${(r.excessCi95.lo * 100).toFixed(2)}%, ${(r.excessCi95.hi * 100).toFixed(2)}%]`
      : "—";
    lines.push(`| ${r.trend} | ${r.horizon}y | ${r.nObservations} | ${ex} | ${ci} |`);
  }
  lines.push("");
  lines.push("## Classification breakdown");
  lines.push("");
  lines.push(
    "How many (symbol, snapshot date) observations landed in each FV-trend bucket. The 2-year window + ≥4-sample minimum means the earliest backtest dates land in `insufficient_data` (no trailing FV history yet built up).",
  );
  lines.push("");
  lines.push("| Trend | Count |");
  lines.push("|---|---|");
  for (const [trend, count] of Object.entries(report.classificationCounts)) {
    lines.push(`| ${trend} | ${count} |`);
  }
  lines.push("");
  return lines.join("\n");
}
