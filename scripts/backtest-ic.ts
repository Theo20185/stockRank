#!/usr/bin/env tsx
/**
 * IC analysis backtest orchestrator (backtest.md §3.9–3.10).
 *
 * Reuses the Yahoo cache + per-symbol history infrastructure from
 * scripts/backtest.ts to build snapshot universes at past month-end
 * dates, then runs the IC pipeline:
 *
 *   1. For each backtest date, build a snapshot per universe symbol
 *      via buildSnapshotAtDate (point-in-time fundamentals + price).
 *   2. Compute forward total returns at T+1y, T+3y, T+5y using cached
 *      adjusted-close prices.
 *   3. Compute SPY total returns over the same windows.
 *   4. Build IcObservations.
 *   5. Run Monte Carlo Phase 0 calibration.
 *   6. Compute IC cells with bootstrap CIs and rolling-window
 *      sign-stability.
 *   7. Apply the three-gate filter.
 *   8. Render heatmap + drill-down + calibration reports as Markdown.
 *
 * Outputs:
 *   tmp/backtest-ic/calibration.md (also docs/ when --archive)
 *   tmp/backtest-ic/heatmap.md      (also docs/ when --archive)
 *
 * CLI:
 *   npm run backtest-ic -- [--symbols A,B,C] [--all-sp500]
 *                          [--horizons 1,3,5] [--years 8]
 *                          [--iterations 1000] [--archive]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  pullHistory,
  buildSnapshotAtDate,
  priceAtOrAfter,
  addYears,
  monthEnds,
  type SymbolHistory,
} from "./backtest.js";
import { loadSp500Universe } from "../packages/data/src/universe/loader.js";
import type { CompanySnapshot } from "@stockrank/core";
import {
  buildIcObservations,
  computeIcCells,
  runCalibration,
  applyGatesToAll,
  buildIcReport,
  renderIcReport,
  renderCalibrationReport,
  falseDiscoveryCheck,
  runWeightValidation,
  renderWeightValidationReport,
  DEFAULT_WEIGHTS,
  type CandidateWeights,
  type IcCalibration,
} from "@stockrank/ranking";

type IcArgs = {
  symbols: string[] | null;
  allSp500: boolean;
  years: number;
  horizons: number[];
  iterations: number;
  archive: boolean;
  cacheDir: string;
  /** When true, also run weight-validation (backtest.md §3.11). */
  weightValidation: boolean;
  /** Optional path to a JSON file with candidate weight vectors. */
  candidatesPath: string | null;
  /** Test-period start date for weight validation. */
  testPeriodStart: string;
};

function parseIcArgs(argv: string[]): IcArgs {
  const args: IcArgs = {
    symbols: null,
    allSp500: false,
    years: 8,
    horizons: [1, 3],
    iterations: 200,
    archive: false,
    cacheDir: "tmp/backtest-cache",
    weightValidation: false,
    candidatesPath: null,
    // Default test-period split: 5y back from today. Backtest spec §3.11.1.
    testPeriodStart: (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - 5);
      return d.toISOString().slice(0, 10);
    })(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    switch (a) {
      case "--symbols":
        args.symbols = argv[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--all-sp500":
        args.allSp500 = true;
        break;
      case "--years":
        args.years = Math.max(1, parseInt(argv[++i]!, 10));
        break;
      case "--horizons":
        args.horizons = argv[++i]!.split(",").map((s) => parseInt(s.trim(), 10));
        break;
      // tsx CLI claims --iterations for its own purposes; we use --mc-iter
      case "--mc-iter":
        args.iterations = Math.max(50, parseInt(argv[++i]!, 10));
        break;
      case "--archive":
        args.archive = true;
        break;
      case "--cache-dir":
        args.cacheDir = argv[++i]!;
        break;
      case "--weight-test":
        args.weightValidation = true;
        // optional argument: path to candidates.json
        if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
          args.candidatesPath = argv[++i]!;
        }
        break;
      case "--test-period-start":
        args.testPeriodStart = argv[++i]!;
        break;
      default:
        if (a.startsWith("--")) {
          console.error(`Unknown flag: ${a}`);
          process.exit(2);
        }
    }
  }
  if (!args.symbols && !args.allSp500) {
    console.error("Provide --symbols A,B,C or --all-sp500");
    process.exit(2);
  }
  return args;
}

function loadCandidates(path: string | null): CandidateWeights[] {
  if (!path) {
    return [
      {
        name: "default",
        description: "ranking.md §8.1 default value-tilted defensive weights",
        source: "default",
        weights: { ...DEFAULT_WEIGHTS },
      },
      {
        name: "equal-weight",
        description: "Academic prior — all categories weighted equally (excluding momentum)",
        source: "academic-prior",
        weights: {
          valuation: 0.20,
          health: 0.20,
          quality: 0.20,
          shareholderReturn: 0.20,
          growth: 0.20,
          momentum: 0,
        },
      },
      {
        name: "quality-tilt",
        description: "Boosts Quality from 15% to 30% (academic prior favoring profitability)",
        source: "academic-prior",
        weights: {
          valuation: 0.30,
          health: 0.20,
          quality: 0.30,
          shareholderReturn: 0.10,
          growth: 0.10,
          momentum: 0,
        },
      },
      {
        name: "value-deep",
        description: "Heavy value tilt — 50% Valuation",
        source: "manual",
        weights: {
          valuation: 0.50,
          health: 0.20,
          quality: 0.10,
          shareholderReturn: 0.10,
          growth: 0.10,
          momentum: 0,
        },
      },
      {
        name: "momentum-on",
        description: "Default + 10% Momentum (testing whether the IC pipeline's marginal momentum signal earns its keep)",
        source: "academic-prior",
        weights: {
          valuation: 0.30,
          health: 0.25,
          quality: 0.15,
          shareholderReturn: 0.15,
          growth: 0.05,
          momentum: 0.10,
        },
      },
    ];
  }
  // Load from file
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as CandidateWeights[];
}

async function main(): Promise<void> {
  const args = parseIcArgs(process.argv.slice(2));
  const symbols = args.allSp500
    ? (await loadSp500Universe()).map((e) => e.symbol)
    : args.symbols!;

  // SPY is the excess-return baseline.
  const baselineSymbols = ["SPY"];

  console.log(`Pulling history for ${symbols.length} symbols + SPY...`);
  const histories = new Map<string, SymbolHistory>();
  let pulled = 0;
  for (const sym of [...symbols, ...baselineSymbols]) {
    try {
      const h = await pullHistory(sym, args.years, {
        cacheDir: args.cacheDir,
        refreshCache: false,
        mergeCache: false,
      });
      histories.set(sym, h);
      pulled += 1;
      if (pulled % 50 === 0) {
        console.log(`  ${pulled}/${symbols.length + baselineSymbols.length}`);
      }
    } catch (err) {
      console.warn(
        `  ${sym}: pull failed — ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log(`History pulled for ${histories.size} symbols.`);

  const dates = monthEnds(args.years);
  const today = new Date().toISOString().slice(0, 10);
  // Only keep dates where the longest horizon's forward window has
  // already closed.
  const maxHorizon = Math.max(...args.horizons);
  const usableDates = dates.filter((d) => addYears(d, maxHorizon) <= today);
  console.log(
    `${usableDates.length} usable backtest dates (max horizon ${maxHorizon}y).`,
  );

  const snapshotsByDate = new Map<string, CompanySnapshot[]>();
  const forwardReturnsByDate = new Map<string, Map<string, number>>();
  const spyReturnsByDate = new Map<string, Map<string, number>>();

  const spyHistory = histories.get("SPY");
  if (!spyHistory) {
    console.error("SPY history missing — cannot compute excess returns.");
    process.exit(1);
  }

  for (const date of usableDates) {
    const universe: CompanySnapshot[] = [];
    const fwdMap = new Map<string, number>();
    for (const sym of symbols) {
      const h = histories.get(sym);
      if (!h) continue;
      const snap = buildSnapshotAtDate(h, date);
      if (!snap) continue;
      universe.push(snap);

      const entryPrice = snap.quote.price;
      for (const horizon of args.horizons) {
        const targetDate = addYears(date, horizon);
        if (targetDate > today) continue;
        const fwd = priceAtOrAfter(h, targetDate);
        if (!fwd) continue;
        const ret = (fwd.close - entryPrice) / entryPrice;
        fwdMap.set(`${sym}|${horizon}`, ret);
      }
    }
    if (universe.length === 0) continue;
    snapshotsByDate.set(date, universe);
    forwardReturnsByDate.set(date, fwdMap);

    // SPY return for the same horizons
    const spyEntry = priceAtOrAfter(spyHistory, date);
    if (!spyEntry) continue;
    const spyMap = new Map<string, number>();
    for (const horizon of args.horizons) {
      const targetDate = addYears(date, horizon);
      const spyExit = priceAtOrAfter(spyHistory, targetDate);
      if (!spyExit) continue;
      spyMap.set(String(horizon), (spyExit.close - spyEntry.close) / spyEntry.close);
    }
    spyReturnsByDate.set(date, spyMap);
  }

  console.log(
    `Built ${snapshotsByDate.size} snapshot universes; building observations...`,
  );

  const observations = buildIcObservations({
    snapshotsByDate,
    forwardReturnsByDate,
    spyReturnsByDate,
    horizons: args.horizons,
  });
  console.log(`Built ${observations.length} IC observations.`);

  // ── Phase 0 — Monte Carlo calibration ───────────────────────────────
  console.log(
    `Running Monte Carlo calibration (${args.iterations} iterations)...`,
  );
  const calibration = runCalibration(observations, {
    iterations: args.iterations,
    seed: 1,
    onProgress: (i, n) => {
      if (i % 20 === 0 || i === n) {
        process.stdout.write(`  Phase 0: ${i}/${n}\r`);
      }
    },
  });
  console.log(`\n  Thresholds derived: ${calibration.thresholds.length}`);

  // ── Real IC computation ─────────────────────────────────────────────
  console.log("Computing IC on real data...");
  const cells = computeIcCells(observations);
  const realCellIcs = new Map<string, number>();
  for (const c of cells) {
    if (c.ic !== null) {
      const key = `${c.superGroup}|${c.horizon}`;
      const prev = realCellIcs.get(key) ?? 0;
      // Aggregate to max |IC| per (superGroup, horizon) for FDR check.
      if (Math.abs(c.ic) > Math.abs(prev)) realCellIcs.set(key, c.ic);
    }
  }
  const fdr = falseDiscoveryCheck(realCellIcs, calibration.thresholds);
  console.log(
    `  FDR check: ${fdr.cellsSurvivingGate1} surviving / ${fdr.expectedByChance.toFixed(1)} expected → ${fdr.verdict}`,
  );

  // ── Apply three-gate filter ─────────────────────────────────────────
  const cellsWithVerdict = applyGatesToAll(cells, calibration);
  const passing = cellsWithVerdict.filter((c) => c.verdict.verdict === "pass");
  console.log(
    `  Three-gate filter: ${passing.length} of ${cells.length} cells passed all three gates.`,
  );

  // ── Render reports ──────────────────────────────────────────────────
  const tmpDir = resolve(process.cwd(), "tmp/backtest-ic");
  mkdirSync(tmpDir, { recursive: true });

  const calibrationFilename = args.archive
    ? `backtest-ic-calibration-${today}.md`
    : "calibration.md";
  const heatmapFilename = args.archive
    ? `backtest-ic-${today}.md`
    : "heatmap.md";

  const calibrationMd = renderCalibrationReport(calibration, fdr);
  const calibrationPath = resolve(tmpDir, "calibration.md");
  writeFileSync(calibrationPath, calibrationMd, "utf-8");
  console.log(`Wrote ${calibrationPath}`);

  const report = buildIcReport(cellsWithVerdict, calibrationFilename);
  const heatmapMd = renderIcReport(report);
  const heatmapPath = resolve(tmpDir, "heatmap.md");
  writeFileSync(heatmapPath, heatmapMd, "utf-8");
  console.log(`Wrote ${heatmapPath}`);

  if (args.archive) {
    const docsDir = resolve(process.cwd(), "docs");
    const calibrationArchivePath = resolve(docsDir, calibrationFilename);
    const heatmapArchivePath = resolve(docsDir, heatmapFilename);
    writeFileSync(calibrationArchivePath, calibrationMd, "utf-8");
    writeFileSync(heatmapArchivePath, heatmapMd, "utf-8");
    console.log(`Archived to ${calibrationArchivePath} and ${heatmapArchivePath}`);
  }

  // Echo the calibration JSON next to the markdown for traceability.
  const calibrationJsonPath = resolve(tmpDir, "calibration.json");
  writeFileSync(
    calibrationJsonPath,
    JSON.stringify(calibration, null, 2),
    "utf-8",
  );

  // ── Optional: weight-validation backtest (§3.11) ────────────────────
  if (args.weightValidation) {
    console.log(
      `\nRunning weight validation (test period start ${args.testPeriodStart})...`,
    );
    const candidates = loadCandidates(args.candidatesPath);
    console.log(`  Candidates: ${candidates.map((c) => c.name).join(", ")}`);
    const wvReport = runWeightValidation(observations, candidates, {
      testPeriodStart: args.testPeriodStart,
      bootstrapResamples: 1000,
      seed: 1,
    });
    const wvFilename = args.archive
      ? `backtest-weight-validation-${today}.md`
      : "weight-validation.md";
    const wvMd = renderWeightValidationReport(wvReport);
    const wvPath = resolve(tmpDir, "weight-validation.md");
    writeFileSync(wvPath, wvMd, "utf-8");
    console.log(`  Wrote ${wvPath}`);
    console.log(`  Adoption verdicts:`);
    for (const v of wvReport.verdicts) {
      console.log(`    - ${v.candidateName}: ${v.verdict} — ${v.reason}`);
    }
    if (args.archive) {
      const docsDir = resolve(process.cwd(), "docs");
      const wvArchivePath = resolve(docsDir, wvFilename);
      writeFileSync(wvArchivePath, wvMd, "utf-8");
      console.log(`  Archived to ${wvArchivePath}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
