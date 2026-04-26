/**
 * Markdown rendering for the per-super-group validation report.
 */

import type { PerSuperGroupValidationReport } from "./per-super-group.js";

export function renderPerSuperGroupReport(
  report: PerSuperGroupValidationReport,
): string {
  const lines: string[] = [];
  lines.push(`# Per-super-group preset validation — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(`**Test period start:** ${report.testPeriodStart}`);
  lines.push("");
  lines.push(
    "Each preset is tested against ONLY its target super-group's cohort. The baseline is the §8.1 default weights applied to the same cohort. Adoption rule (§3.11.1): preset must beat default by ≥ 1%/yr × 3y AND CI not crossing zero, in this regime. The cross-regime adoption rule (≥ 2 of N PIT regimes) is applied by stacking these single-regime reports manually.",
  );
  lines.push("");
  lines.push("## Per-preset verdicts");
  lines.push("");
  lines.push(
    "| Super-group | Preset | Cohort N | Default 3y | Preset 3y | Excess vs default | Verdict |",
  );
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of report.results) {
    const def = r.report.candidates.find((c) => c.candidate.name === "default");
    const cand = r.report.candidates.find(
      (c) => c.candidate.name === r.preset.name,
    );
    const defH3 = def?.perHorizon.find((p) => p.horizon === 3);
    const candH3 = cand?.perHorizon.find((p) => p.horizon === 3);
    const defStr = defH3?.meanExcess !== null && defH3?.meanExcess !== undefined
      ? `${(defH3.meanExcess * 100).toFixed(2)}%`
      : "—";
    const candStr =
      candH3?.meanExcess !== null && candH3?.meanExcess !== undefined
        ? `${(candH3.meanExcess * 100).toFixed(2)}%`
        : "—";
    const excessStr = r.verdict?.excessVsDefault3y !== null && r.verdict?.excessVsDefault3y !== undefined
      ? `${(r.verdict.excessVsDefault3y * 100).toFixed(2)} pp`
      : "—";
    const verdictStr = r.verdict ? `**${r.verdict.verdict}**` : "—";
    lines.push(
      `| ${r.preset.targetSuperGroup} | ${r.preset.name} | ${r.cohortSize} | ${defStr} | ${candStr} | ${excessStr} | ${verdictStr} |`,
    );
  }
  lines.push("");
  for (const r of report.results) {
    lines.push(`## ${r.preset.targetSuperGroup} — ${r.preset.name}`);
    if (r.preset.description) {
      lines.push("");
      lines.push(`_${r.preset.description}_`);
    }
    lines.push("");
    if (r.verdict) {
      lines.push(`**Verdict:** ${r.verdict.verdict} — ${r.verdict.reason}`);
      lines.push("");
    }
    lines.push("**Per-horizon detail (preset vs default in this cohort):**");
    lines.push("");
    lines.push("| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |");
    lines.push("|---|---|---|---|---|");
    for (const cand of r.report.candidates) {
      for (const h of cand.perHorizon) {
        const ex = h.meanExcess === null
          ? "—"
          : `${(h.meanExcess * 100).toFixed(2)}%`;
        const ci = h.excessCi95
          ? `[${(h.excessCi95.lo * 100).toFixed(2)}%, ${(h.excessCi95.hi * 100).toFixed(2)}%]`
          : "—";
        lines.push(
          `| ${cand.candidate.name} | ${h.horizon}y | ${h.nSnapshots} | ${ex} | ${ci} |`,
        );
      }
    }
    lines.push("");
    lines.push("**Preset weights:**");
    lines.push("");
    lines.push("| Category | Weight |");
    lines.push("|---|---|");
    for (const [cat, w] of Object.entries(r.preset.weights)) {
      lines.push(`| ${cat} | ${(w * 100).toFixed(1)}% |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
