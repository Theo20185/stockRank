/**
 * Markdown rendering for the weight-validation report (backtest.md
 * §3.11.2). Pure function; caller writes the string to disk.
 *
 * Honest reporting requirement (§3.11.2): show ALL candidates
 * evaluated, not just the ones that pass. The full table prevents
 * selective re-running until something sticks.
 */

import type { WeightValidationReport } from "./types.js";

export function renderWeightValidationReport(
  report: WeightValidationReport,
): string {
  const lines: string[] = [];
  lines.push(`# Weight validation — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `**Train period:** ${report.trainPeriod.start} → ${report.trainPeriod.end}`,
  );
  lines.push(
    `**Test period:** ${report.testPeriod.start} → ${report.testPeriod.end}`,
  );
  lines.push("");
  lines.push(
    "Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.",
  );
  lines.push("");
  lines.push(
    "**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.",
  );
  lines.push("");
  lines.push("## Per-candidate per-horizon excess return");
  lines.push("");
  lines.push("| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of report.candidates) {
    for (const h of c.perHorizon) {
      const ex = h.meanExcess === null ? "—" : `${(h.meanExcess * 100).toFixed(2)}%`;
      const ci = h.excessCi95
        ? `[${(h.excessCi95.lo * 100).toFixed(2)}%, ${(h.excessCi95.hi * 100).toFixed(2)}%]`
        : "—";
      lines.push(
        `| ${c.candidate.name} | ${c.candidate.source ?? "—"} | ${h.horizon}y | ${h.nSnapshots} | ${ex} | ${ci} |`,
      );
    }
  }
  lines.push("");
  if (report.verdicts.length > 0) {
    lines.push("## Adoption verdicts (vs default)");
    lines.push("");
    lines.push("| Candidate | 3y excess vs default | Verdict | Reason |");
    lines.push("|---|---|---|---|");
    for (const v of report.verdicts) {
      const exVsDefault =
        v.excessVsDefault3y === null
          ? "—"
          : `${(v.excessVsDefault3y * 100).toFixed(2)}%`;
      lines.push(
        `| ${v.candidateName} | ${exVsDefault} | **${v.verdict}** | ${v.reason} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Candidate weight vectors");
  lines.push("");
  for (const c of report.candidates) {
    lines.push(`### ${c.candidate.name}`);
    if (c.candidate.description) lines.push(`_${c.candidate.description}_`);
    lines.push("");
    lines.push("| Category | Weight |");
    lines.push("|---|---|");
    for (const [cat, w] of Object.entries(c.candidate.weights)) {
      lines.push(`| ${cat} | ${(w * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
