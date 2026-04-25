/**
 * Markdown rendering for IC reports — heatmap + drill-down detail
 * per backtest.md §3.9 and §3.10.
 *
 * Pure functions; caller writes the strings to disk.
 */

import { FACTORS } from "../../factors.js";
import { ALL_SUPER_GROUPS, SUPER_GROUP_LABELS } from "../../super-groups.js";
import type { SuperGroupKey } from "../../super-groups.js";
import type { FactorKey } from "../../types.js";
import type {
  IcCalibration,
  IcCellWithVerdict,
  IcReport,
} from "./types.js";

const HORIZONS_DEFAULT = [1, 2, 3, 5];

const SHORT_FACTOR_LABEL: Record<FactorKey, string> = {
  evToEbitda: "EV/EBITDA",
  priceToFcf: "P/FCF",
  peRatio: "P/E",
  priceToBook: "P/B",
  debtToEbitda: "D/EBITDA",
  currentRatio: "CurR",
  interestCoverage: "IntCov",
  roic: "ROIC",
  accruals: "Accr",
  dividendYield: "DivY",
  buybackYield: "BBY",
  dividendGrowth5Y: "DivG5",
  netIssuance: "NetIss",
  revenueGrowth7Y: "RevG7",
  epsGrowth7Y: "EpsG7",
  momentum12_1: "Mom12-1",
};

/**
 * Build the full IcReport from cells with verdicts. Computes per-
 * horizon summary counts so the renderer doesn't have to re-scan
 * the cell list.
 */
export function buildIcReport(
  cells: IcCellWithVerdict[],
  calibrationRef: string,
): IcReport {
  const horizons = new Set<number>();
  for (const c of cells) horizons.add(c.horizon);

  const summary = [...horizons].sort().map((h) => {
    let passing = 0;
    let s = 0;
    let e = 0;
    let sg = 0;
    let id = 0;
    for (const c of cells) {
      if (c.horizon !== h) continue;
      switch (c.verdict.verdict) {
        case "pass":
          passing += 1;
          break;
        case "fail-statistical":
          s += 1;
          break;
        case "fail-economic":
          e += 1;
          break;
        case "fail-sign-stability":
          sg += 1;
          break;
        case "fail-insufficient-data":
          id += 1;
          break;
      }
    }
    return {
      horizon: h,
      passing,
      failingStatistical: s,
      failingEconomic: e,
      failingSignStability: sg,
      failingInsufficientData: id,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    calibrationRef,
    cells,
    summary,
  };
}

/**
 * Render the IC heatmap as a Markdown document. Cells passing the
 * three-gate filter render as their IC value with sign; failing cells
 * render as "—" with a footnote-style explanation in the per-cell
 * drill-down table beneath each heatmap.
 */
export function renderIcReport(report: IcReport): string {
  const sections: string[] = [];
  sections.push(`# IC analysis — ${report.generatedAt.slice(0, 10)}`);
  sections.push("");
  sections.push(
    `**Calibration:** \`${report.calibrationRef}\` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).`,
  );
  sections.push("");
  sections.push(
    "**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.",
  );
  sections.push("");
  sections.push("## Summary");
  sections.push("");
  sections.push(
    "| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |",
  );
  sections.push("|---|---|---|---|---|---|");
  for (const s of report.summary) {
    sections.push(
      `| ${s.horizon}y | ${s.passing} | ${s.failingStatistical} | ${s.failingEconomic} | ${s.failingSignStability} | ${s.failingInsufficientData} |`,
    );
  }
  sections.push("");

  const horizonsSorted = [...new Set(report.cells.map((c) => c.horizon))].sort();
  for (const h of horizonsSorted) {
    sections.push(`## Heatmap — ${h}y horizon`);
    sections.push("");
    sections.push(
      "Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.",
    );
    sections.push("");
    sections.push(renderHeatmap(report.cells, h));
    sections.push("");
    sections.push(`### ${h}y — passing cells`);
    sections.push("");
    sections.push(renderPassingTable(report.cells, h));
    sections.push("");
  }

  return sections.join("\n");
}

function renderHeatmap(cells: IcCellWithVerdict[], horizon: number): string {
  const lines: string[] = [];
  // Header: Super-group | factor1 | factor2 | ...
  const header = ["Super-group", ...FACTORS.map((f) => SHORT_FACTOR_LABEL[f.key])];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`|${header.map(() => "---").join("|")}|`);

  for (const sg of ALL_SUPER_GROUPS) {
    const row: string[] = [SUPER_GROUP_LABELS[sg]];
    for (const f of FACTORS) {
      const cell = cells.find(
        (c) => c.superGroup === sg && c.horizon === horizon && c.factor === f.key,
      );
      if (!cell || cell.verdict.verdict !== "pass" || cell.ic === null) {
        row.push("—");
      } else {
        row.push(formatIc(cell.ic));
      }
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

function renderPassingTable(
  cells: IcCellWithVerdict[],
  horizon: number,
): string {
  const passing = cells.filter(
    (c) => c.horizon === horizon && c.verdict.verdict === "pass",
  );
  if (passing.length === 0) return "_No cells passed the three-gate filter at this horizon._";

  // Sort by |IC| descending — most informative first.
  passing.sort((a, b) => Math.abs(b.ic ?? 0) - Math.abs(a.ic ?? 0));

  const lines: string[] = [];
  lines.push("| Super-group | Factor | IC | 95% CI | N | Sign-stability |");
  lines.push("|---|---|---|---|---|---|");
  for (const c of passing) {
    const ci = c.ci95
      ? `[${c.ci95.lo.toFixed(3)}, ${c.ci95.hi.toFixed(3)}]`
      : "—";
    const signs = c.windowIcs
      .map((w) => (w === null ? "?" : w > 0 ? "+" : "-"))
      .join("/");
    lines.push(
      `| ${SUPER_GROUP_LABELS[c.superGroup as SuperGroupKey]} | ${SHORT_FACTOR_LABEL[c.factor]} | ${formatIc(c.ic ?? 0)} | ${ci} | ${c.nEffective} | ${signs} |`,
    );
  }
  return lines.join("\n");
}

function formatIc(ic: number): string {
  const sign = ic >= 0 ? "+" : "";
  return `${sign}${ic.toFixed(3)}`;
}

/**
 * Render the Phase 0 calibration archive as Markdown. Includes per-
 * cell threshold table, N-vs-noise summary, and the calibration
 * metadata for traceability.
 */
export function renderCalibrationReport(
  calibration: IcCalibration,
  fdr: { cellsTested: number; cellsSurvivingGate1: number; expectedByChance: number; ratio: number; verdict: string },
): string {
  const lines: string[] = [];
  lines.push(`# IC calibration — ${calibration.generatedAt.slice(0, 10)}`);
  lines.push("");
  lines.push(
    `**Iterations:** ${calibration.iterations} Monte Carlo shuffles per backtest.md §3.10.1.`,
  );
  lines.push("");
  lines.push("## Per-cell thresholds");
  lines.push("");
  lines.push(
    "Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.",
  );
  lines.push("");
  lines.push("| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |");
  lines.push("|---|---|---|---|---|");

  const sorted = [...calibration.thresholds].sort((a, b) => {
    if (a.superGroup !== b.superGroup) return a.superGroup.localeCompare(b.superGroup);
    return a.horizon - b.horizon;
  });
  for (const t of sorted) {
    lines.push(
      `| ${SUPER_GROUP_LABELS[t.superGroup]} | ${t.horizon}y | ${t.nEffective} | ${t.threshold99.toFixed(3)} | ${t.threshold995.toFixed(3)} |`,
    );
  }
  lines.push("");
  lines.push("## False-discovery sanity check");
  lines.push("");
  lines.push(
    `- Cells tested: **${fdr.cellsTested}** (super-groups × factors × horizons combinations with calibration)`,
  );
  lines.push(
    `- Cells surviving Gate 1 on REAL data: **${fdr.cellsSurvivingGate1}**`,
  );
  lines.push(
    `- Expected survival under pure null (1% × cells tested): **${fdr.expectedByChance.toFixed(1)}**`,
  );
  lines.push(`- Ratio (real / expected): **${fdr.ratio.toFixed(2)}×**`);
  lines.push(`- Verdict: **${fdr.verdict}**`);
  lines.push("");
  lines.push(
    "_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._",
  );
  return lines.join("\n");
}
