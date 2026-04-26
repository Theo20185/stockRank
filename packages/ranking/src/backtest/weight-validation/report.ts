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

  // Phase 4A — long/short factor isolation table
  lines.push("## Long/short factor isolation (Phase 4A)");
  lines.push("");
  lines.push(
    "Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.",
  );
  lines.push("");
  lines.push("| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |");
  lines.push("|---|---|---|---|---|");
  for (const c of report.candidates) {
    for (const h of c.perHorizon) {
      const top = h.meanExcess === null ? "—" : `${(h.meanExcess * 100).toFixed(2)}%`;
      const bot =
        h.meanBottomExcess === null || h.meanBottomExcess === undefined
          ? "—"
          : `${(h.meanBottomExcess * 100).toFixed(2)}%`;
      const ls =
        h.longShortDelta === null || h.longShortDelta === undefined
          ? "—"
          : `${(h.longShortDelta * 100).toFixed(2)} pp`;
      lines.push(`| ${c.candidate.name} | ${h.horizon}y | ${top} | ${bot} | ${ls} |`);
    }
  }
  lines.push("");

  // Phase 4B — risk-adjusted comparison
  lines.push("## Risk-adjusted comparison (Phase 4B)");
  lines.push("");
  lines.push(
    "Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.",
  );
  lines.push("");
  lines.push("| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of report.candidates) {
    for (const h of c.perHorizon) {
      const ex = h.meanExcess === null ? "—" : `${(h.meanExcess * 100).toFixed(2)}%`;
      const sh =
        h.sharpeLike === null || h.sharpeLike === undefined
          ? "—"
          : h.sharpeLike.toFixed(2);
      const so =
        h.sortinoLike === null || h.sortinoLike === undefined
          ? "—"
          : h.sortinoLike.toFixed(2);
      const dd =
        h.maxDrawdown === null || h.maxDrawdown === undefined
          ? "—"
          : `${(h.maxDrawdown * 100).toFixed(2)}%`;
      lines.push(`| ${c.candidate.name} | ${h.horizon}y | ${ex} | ${sh} | ${so} | ${dd} |`);
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
