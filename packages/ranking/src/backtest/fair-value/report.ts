/**
 * Markdown rendering for the FV backtest (H1–H6). Every cell computed
 * by the engine is printed — passing, failing, and underpowered alike
 * (backtest.md §3.11.2 honesty bar).
 */

import type {
  FvArmStats,
  FvBacktestReport,
  FvH1Cell,
} from "./types.js";
import {
  ANNUALIZED_EDGE_FLOOR,
  MIN_CROSS_SECTION,
  MIN_VERDICT_N,
} from "./types.js";

function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function ci(interval: { lo: number; hi: number } | null): string {
  if (!interval) return "—";
  return `[${pct(interval.lo)}, ${pct(interval.hi)}]`;
}

function arm(a: FvArmStats): string {
  return `${a.nDeduped} | ${pct(a.annualizedExcess)} | ${ci(a.annualizedCi95)} | ${pct(a.hitRate, 0)}`;
}

function h1Table(cells: FvH1Cell[], lines: string[]): void {
  lines.push(
    "| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |",
  );
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of cells) {
    lines.push(
      `| ${c.regime} | ${c.horizon}y | ${c.stratum} | ${arm(c.below)} | ${arm(c.atOrAbove)} | ${c.nNoBand} | ${pct(c.gapAnnualized)} | **${c.verdict}** — ${c.reason} |`,
    );
  }
  lines.push("");
}

export function renderFvBacktestReport(report: FvBacktestReport): string {
  const lines: string[] = [];
  lines.push(`# Fair-value backtest (H1–H6) — ${report.generatedAt.slice(0, 10)} (PIT)`);
  lines.push("");
  lines.push(`**Snapshot range:** ${report.snapshotRange.start} → ${report.snapshotRange.end} · horizons ${report.horizons.map((h) => `${h}y`).join(", ")}`);
  lines.push("");
  lines.push(
    `**Coverage:** ${report.totals.observations} observations, ${report.totals.symbols} symbols, ${report.totals.dates} snapshot dates. ${report.totals.noBandRows} no-band rows (kept, reported per cell), ${report.totals.engineErrorRows} engine-error rows (excluded, counted here).`,
  );
  lines.push("");
  lines.push("## Point-in-time caveats (restated per protocol)");
  lines.push("");
  lines.push(`- **Restatement bias** — ${report.pit.restatementNote}`);
  lines.push(`- **Industry membership** — ${report.pit.industryMembershipNote}`);
  lines.push(
    `- **Cap-bucket churn** (the cohort-drift component this harness DOES capture): ${report.pit.capBucketChurnPct === null ? "not computed" : pct(report.pit.capBucketChurnPct)} of (symbol, date) rows sit in a different cap bucket at the snapshot than at the run's final date.`,
  );
  lines.push("");
  lines.push(
    `**Conventions:** valuation-basis prices vs bands; total-return excess vs SPY; yearly dedup per §3.9.3 in every cell; annualized = cumulative ÷ horizon; verdicts need ≥ ${MIN_VERDICT_N} deduped rows/arm; pass bar = gap ≥ ${pct(ANNUALIZED_EDGE_FLOOR)}/yr with below-arm CI excluding 0 (§3.11.1 parity). All thresholds frozen before the run.`,
  );
  lines.push("");

  // H1
  lines.push("## H1 — directional: does `price < p25` predict positive forward excess?");
  lines.push("");
  h1Table(report.h1, lines);
  if (report.h1CoarseCohortStress) {
    lines.push(
      "### H1 stress — coarse (super-group) cohorts, bounding today's-industry-classification exposure",
    );
    lines.push("");
    h1Table(report.h1CoarseCohortStress, lines);
  }

  // H2
  lines.push("## H2 — monotonic: does `upsideToP25Pct` rank-predict forward excess?");
  lines.push("");
  lines.push(
    `Primary estimator: per-snapshot cross-sectional Spearman (dates with ≥ ${MIN_CROSS_SECTION} names), equal-weighted across dates; three gates vs a shuffled-returns null (permutation within date × super-group — same structure preservation as the IC calibration).`,
  );
  lines.push("");
  lines.push("| Horizon | Dates (skipped) | avg IC | CI (dates) | null 99th | Gate1 stat | Gate2 econ | Window ICs | Gate3 sign | Verdict |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");
  for (const p of report.h2Primary) {
    lines.push(
      `| ${p.horizon}y | ${p.nDates} (${p.nDatesSkipped}) | ${p.avgIc?.toFixed(3) ?? "—"} | ${ci(p.ci95)} | ${p.null99?.toFixed(3) ?? "—"} | ${p.gate1Statistical ? "pass" : "FAIL"} | ${p.gate2Economic ? "pass" : "FAIL"} | ${p.windowIcs.map((w) => (w === null ? "—" : w.toFixed(3))).join(" / ")} | ${p.gate3SignStability ? "pass" : "FAIL"} | **${p.verdict}** |`,
    );
  }
  lines.push("");
  lines.push("Secondary (consistency check): pooled + yearly-deduped Spearman — the estimator family the IC heatmap uses.");
  lines.push("");
  lines.push("| Horizon | n (deduped) | IC | CI |");
  lines.push("|---|---|---|---|");
  for (const s of report.h2Secondary) {
    lines.push(`| ${s.horizon}y | ${s.nDeduped} | ${s.ic?.toFixed(3) ?? "—"} | ${ci(s.ci95)} |`);
  }
  lines.push("");

  // H3
  lines.push("## H3 — convergence: do below-p25 names actually reach p25?");
  lines.push("");
  lines.push(
    "Weekly-close resolution (±1 week). Control = at-or-above rows required to rise by the treatment arm's median required rise over the same window.",
  );
  lines.push("");
  lines.push("| Regime | Horizon | n<p25 (path) | Converged | CI | Time-to-p25 days (p25/med/p75) | Non-conv terminal price/p25 (p25/med/p75) | Control n | Control target | Control converged | Control CI |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of report.h3) {
    const t = c.timeToP25Days;
    const nc = c.nonConvergedTerminalRatio;
    lines.push(
      `| ${c.regime} | ${c.horizon}y | ${c.nBelow} (${c.nWithPath}) | ${c.converged} (${pct(c.convergedFrac, 1)}) | ${ci(c.convergedCi95)} | ${t ? `${t.p25}/${t.median}/${t.p75}` : "—"} | ${nc ? `${nc.p25.toFixed(2)}/${nc.median.toFixed(2)}/${nc.p75.toFixed(2)}` : "—"} | ${c.control.n} | ${pct(c.control.targetRisePct, 1)} | ${c.control.converged} (${pct(c.control.convergedFrac, 1)}) | ${ci(c.control.convergedCi95)} |`,
    );
  }
  lines.push("");

  // H4
  lines.push("## H4 — do the confidence / divergence / deep-cyclical flags discriminate?");
  lines.push("");
  lines.push(
    "The deep-cyclical stratum (loss in annual[1:4] + positive TTM — the NEM signature) was pre-declared 2026-08-20, before this run.",
  );
  lines.push("");
  h1Table(report.h4Cells, lines);
  lines.push("### H4 discrimination verdicts (below-arm vs below-arm)");
  lines.push("");
  lines.push("| Comparison | Regime | Horizon | Gap/yr | Verdict |");
  lines.push("|---|---|---|---|---|");
  for (const v of report.h4Verdicts) {
    lines.push(
      `| ${v.comparison} | ${v.regime} | ${v.horizon}y | ${pct(v.gapAnnualized)} | **${v.verdict}** — ${v.reason} |`,
    );
  }
  lines.push("");

  // H5
  lines.push("## H5 — peer contamination: does predictive power decay with peer premium?");
  lines.push("");
  lines.push(
    "Primary buckets on the SYMMETRIC ratio max(peer/own, own/peer) — the quantity the production 5.0 cliff gates on. The `>= 5.0 (pre-suppression band)` stratum recomputes belowP25 from the full-9 pre-suppression anchors: production's band past the cliff is own-only by construction, so this is the only view of raw contamination there.",
  );
  lines.push("");
  h1Table(report.h5Cells, lines);
  lines.push("### H5 trend verdicts");
  lines.push("");
  lines.push("| Regime | Horizon | Spearman(bucket, gap) | Monotonic decay | Top bucket ≤ 0 | Verdict |");
  lines.push("|---|---|---|---|---|---|");
  for (const t of report.h5Trends) {
    lines.push(
      `| ${t.regime} | ${t.horizon}y | ${t.bucketGapSpearman?.toFixed(3) ?? "—"} | ${t.monotonicDecay ? "yes" : "no"} | ${t.topBucketGapNonPositive ? "yes" : "no"} | **${t.verdict}** |`,
    );
  }
  lines.push("");
  lines.push("### H5 secondary — directed ratio (peer/own), exposing the two sides of the cliff");
  lines.push("");
  h1Table(report.h5DirectedCells, lines);

  // H6
  lines.push("## H6 — anchor ablation (pooled; regime lens lives in H1)");
  lines.push("");
  lines.push(
    "Variants recompute the band from pre-suppression anchor subsets. Common support = rows where both own-3 and peer-6 bands exist.",
  );
  lines.push("");
  h1Table(report.h6Cells, lines);
  if (report.h6Correlation) {
    const c = report.h6Correlation;
    lines.push("### H6 anchor correlation structure");
    lines.push("");
    lines.push(
      `Pairwise Spearman of row-median-normalized implied prices. Effective anchor count ((Σλ)²/Σλ², non-negative eigenvalues over the active block): **${c.effectiveAnchorCount.toFixed(2)} of ${c.activeAnchorCount} active** (${c.anchorKeys.length} total${c.excludedAnchorKeys.length > 0 ? `; excluded for insufficient presence: ${c.excludedAnchorKeys.join(", ")}` : ""}). ${c.cellsBelowMinN} pairs below the min-N floor render as — and enter the eigen step as 0.`,
    );
    lines.push("");
    lines.push(`| | ${c.anchorKeys.join(" | ")} |`);
    lines.push(`|---|${c.anchorKeys.map(() => "---").join("|")}|`);
    for (let i = 0; i < c.anchorKeys.length; i += 1) {
      lines.push(
        `| **${c.anchorKeys[i]}** | ${c.matrix[i]!.map((v) => (v === null ? "—" : v.toFixed(2))).join(" | ")} |`,
      );
    }
    lines.push("");
    lines.push(`Eigenvalues: ${c.eigenvalues.map((l) => l.toFixed(2)).join(", ")}`);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`**Verdict:** ${report.verdictLine}`);
  lines.push("");
  return lines.join("\n");
}
