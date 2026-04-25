/**
 * Markdown rendering for the user-picks validation report.
 */

import type { UserPicksReport } from "./engine.js";

export function renderUserPicksReport(report: UserPicksReport): string {
  const lines: string[] = [];
  lines.push(`# User-picks validation — ${report.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(`**Weight scheme:** ${report.weightSchemeName}`);
  lines.push("");
  lines.push(
    "For each user-supplied (symbol, snapshot date) pair, we reconstruct the snapshot universe at that date, compute composite scores under the supplied weight vector, and report the pick's rank — plus the names that ranked higher in its super-group with their realized 3y forward returns. Names ranked higher with WORSE realized returns are evidence the engine is over-rating something it shouldn't.",
  );
  lines.push("");

  for (const entry of report.picks) {
    lines.push(`## ${entry.pick.symbol} @ ${entry.pick.snapshotDate}`);
    lines.push("");
    if (!entry.ranking) {
      lines.push(`_${entry.notFoundReason}_`);
      lines.push("");
      continue;
    }
    const r = entry.ranking;
    lines.push(`- **Composite:** ${r.composite?.toFixed(2)}`);
    lines.push(
      `- **Universe rank:** ${r.rankInUniverse} of ${r.universeSize} (top ${pct(r.rankInUniverse, r.universeSize)})`,
    );
    lines.push(
      `- **Super-group rank:** ${r.rankInSuperGroup} of ${r.superGroupSize} (top ${pct(r.rankInSuperGroup, r.superGroupSize)})`,
    );
    lines.push(
      `- **Realized excess vs SPY:** 1y ${fmtPct(r.ownRealizedExcess1y)}, 3y ${fmtPct(r.ownRealizedExcess3y)}`,
    );
    lines.push("");
    if (r.betterRankedPeers.length === 0) {
      lines.push(`_The pick was the top-ranked name in its super-group — engine surfaced it cleanly._`);
      lines.push("");
      continue;
    }
    lines.push(
      `**Names ranked higher in the same super-group** (engine surfaced these first):`,
    );
    lines.push("");
    lines.push("| SG rank | Symbol | Composite | Realized 1y excess | Realized 3y excess | Better than pick? |");
    lines.push("|---|---|---|---|---|---|");
    const own1y = r.ownRealizedExcess1y;
    const own3y = r.ownRealizedExcess3y;
    for (const peer of r.betterRankedPeers) {
      const better1y =
        peer.realizedExcess1y !== null && own1y !== null
          ? peer.realizedExcess1y > own1y
            ? "✓ 1y"
            : "✗ 1y"
          : "—";
      const better3y =
        peer.realizedExcess3y !== null && own3y !== null
          ? peer.realizedExcess3y > own3y
            ? "✓ 3y"
            : "✗ 3y"
          : "—";
      lines.push(
        `| ${peer.rankInSuperGroup} | ${peer.symbol} | ${peer.composite.toFixed(2)} | ${fmtPct(peer.realizedExcess1y)} | ${fmtPct(peer.realizedExcess3y)} | ${better1y} / ${better3y} |`,
      );
    }
    lines.push("");
    // Quick verdict: did the engine over-rate higher-ranked names
    // that subsequently underperformed the pick?
    const overrated3y = r.betterRankedPeers.filter(
      (p) =>
        p.realizedExcess3y !== null &&
        own3y !== null &&
        p.realizedExcess3y < own3y,
    ).length;
    const totalWith3y = r.betterRankedPeers.filter(
      (p) => p.realizedExcess3y !== null && own3y !== null,
    ).length;
    if (totalWith3y > 0) {
      lines.push(
        `_Engine over-rated **${overrated3y} of ${totalWith3y}** higher-ranked super-group peers at the 3y horizon — those names ranked above the pick but realized a worse 3y excess. **Lower is better** here._`,
      );
      lines.push("");
    }
  }

  return lines.join("\n");
}

function pct(rank: number | null, total: number): string {
  if (rank === null || total === 0) return "—";
  return `${((rank / total) * 100).toFixed(1)}%`;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
