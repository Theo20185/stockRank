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
  priceAtOrAfter,
  addYears,
  monthEnds,
  type SymbolHistory,
} from "./backtest.js";
import { loadSp500Universe } from "../packages/data/src/universe/loader.js";
import { loadHistoryArtifact } from "../packages/data/src/universe/wikipedia-history-cache.js";
import {
  buildMembershipHistory,
  membersAt,
} from "../packages/data/src/universe/wikipedia-history.js";
import {
  extractDelistedSymbols,
  type DelistedSymbol,
} from "../packages/data/src/universe/delisted-symbols.js";
import {
  fetchCompanyFacts,
  EdgarNotFoundError,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "../packages/data/src/edgar/index.js";
import type { EdgarCompanyFacts } from "../packages/data/src/edgar/types.js";
import type { HistoricalBar } from "../packages/data/src/edgar/mapper.js";
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
  runLegacyAudit,
  renderLegacyAuditReport,
  evaluateUserPicks,
  renderUserPicksReport,
  runPerSuperGroupValidation,
  renderPerSuperGroupReport,
  type PerSuperGroupPreset,
  type UserPick,
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
  /** When true, also run the H11/H12 legacy-rule audit (§3.5). */
  legacyAudit: boolean;
  /** When true, restrict the universe at each backtest date to the
   * S&P 500 members AS OF that date (point-in-time membership from
   * `wikipedia-history`). Defaults false for backwards-compat. */
  pointInTime: boolean;
  /** When true with --point-in-time, force a fresh fetch of the
   * Wikipedia changes table (bypasses the 7-day cache TTL). */
  refreshHistory: boolean;
  /** Optional ISO date — caps the latest backtest snapshot date.
   * Used for regime-specific reruns (e.g., pre-COVID window:
   * `--max-snapshot-date 2018-12-31`). Defaults to today. */
  maxSnapshotDate: string | null;
  /** When true (with --point-in-time), also attempt to fetch and
   * include delisted symbols (companies once in the S&P 500 but no
   * longer there) in the backtest universe at the dates they were
   * members. Phase 2D — fixes the survivorship bias gap. */
  includeDelisted: boolean;
  /** When true, run Phase 3 per-super-group preset validation
   * after the main weight-validation step. */
  superGroupPresets: boolean;
  /** Comma-separated SYM:DATE pairs (e.g., "NVO:2026-03-06,TGT:2026-04-09").
   * When supplied, after building observations we run the user-picks
   * validation. Each date becomes a forced backtest snapshot date if
   * not already in the iteration. */
  userPicks: UserPick[] | null;
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
    legacyAudit: false,
    pointInTime: false,
    refreshHistory: false,
    maxSnapshotDate: null,
    userPicks: null,
    includeDelisted: false,
    superGroupPresets: false,
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
      case "--legacy-rule-audit":
        args.legacyAudit = true;
        break;
      case "--point-in-time":
        args.pointInTime = true;
        break;
      case "--refresh-history":
        args.refreshHistory = true;
        break;
      case "--max-snapshot-date":
        args.maxSnapshotDate = argv[++i]!;
        break;
      case "--include-delisted":
        args.includeDelisted = true;
        break;
      case "--super-group-presets":
        args.superGroupPresets = true;
        break;
      case "--user-picks":
        args.userPicks = argv[++i]!.split(",").map((pair) => {
          const [symbol, snapshotDate] = pair.split(":");
          if (!symbol || !snapshotDate) {
            console.error(`--user-picks: bad format "${pair}", expected SYM:YYYY-MM-DD`);
            process.exit(2);
          }
          return { symbol: symbol.trim(), snapshotDate: snapshotDate.trim() };
        });
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
        description: "ranking.md §8.1 current default (value-deep, 50/20/10/10/10/0 since 2026-04-25)",
        source: "default",
        weights: { ...DEFAULT_WEIGHTS },
      },
      {
        name: "value-tilted-defensive-legacy",
        description: "Prior default before the 2026-04-25 migration (35/25/15/15/10/0)",
        source: "legacy-default",
        weights: {
          valuation: 0.35,
          health: 0.25,
          quality: 0.15,
          shareholderReturn: 0.15,
          growth: 0.10,
          momentum: 0,
        },
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
        name: "momentum-on",
        description: "Default + 10% Momentum (testing whether the IC pipeline's marginal momentum signal earns its keep)",
        source: "academic-prior",
        weights: {
          valuation: 0.40,
          health: 0.20,
          quality: 0.10,
          shareholderReturn: 0.10,
          growth: 0.10,
          momentum: 0.10,
        },
      },
      {
        // Phase 1A — in-Valuation reweighting. value-deep with the
        // four valuation sub-factors weighted EV/EBITDA-heavy per the
        // 2026-04-25 IC heatmap finding that EV/EBITDA had the
        // strongest cross-super-group signal at 3y.
        name: "value-deep-evtilt",
        description: "value-deep with EV/EBITDA-tilted Valuation (60% EV/EBITDA, 20% P/FCF, 10% P/E, 10% P/B)",
        source: "ic-derived",
        weights: { ...DEFAULT_WEIGHTS },
        subFactorWeights: {
          valuation: {
            evToEbitda: 0.6,
            priceToFcf: 0.2,
            peRatio: 0.1,
            priceToBook: 0.1,
          },
        },
      },
      {
        // Phase 2B — combined-screen stacking. value-deep top-decile
        // PLUS a pre-decile screen excluding names whose own EPS
        // history shows a declining trajectory. Tests whether the
        // fundamentalsDirection signal earns its keep.
        name: "value-deep-no-declining-fundamentals",
        description: "value-deep + pre-decile filter excluding fundamentalsDirection='declining'",
        source: "screen-stack",
        weights: { ...DEFAULT_WEIGHTS },
        filter: { excludeFundamentalsDirections: ["declining"] },
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
  const symbols: string[] = args.allSp500
    ? (await loadSp500Universe()).map((e) => e.symbol)
    : args.symbols!;

  // SPY is the excess-return baseline.
  const baselineSymbols = ["SPY"];

  console.log(`Pulling chart history for ${symbols.length} symbols + SPY...`);
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

  // EDGAR fundamentals for deep history (15+ years vs Yahoo's
  // truncated ~5 years). Cache hits are local; misses pace to SEC's
  // 10 req/s rate limit.
  console.log(`Loading EDGAR fundamentals for ${symbols.length} symbols...`);
  const edgarFacts = new Map<string, EdgarCompanyFacts>();
  let edgarLoaded = 0;
  let edgarMissing = 0;
  for (const sym of symbols) {
    try {
      const facts = await fetchCompanyFacts(sym);
      edgarFacts.set(sym, facts);
      edgarLoaded += 1;
    } catch (err) {
      if (err instanceof EdgarNotFoundError) {
        edgarMissing += 1;
      } else {
        console.warn(
          `  ${sym}: EDGAR load failed — ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if ((edgarLoaded + edgarMissing) % 100 === 0) {
      console.log(`  EDGAR: ${edgarLoaded + edgarMissing}/${symbols.length}`);
    }
  }
  console.log(
    `EDGAR loaded: ${edgarLoaded} symbols, ${edgarMissing} missing.`,
  );

  const dates = monthEnds(args.years);
  const today = new Date().toISOString().slice(0, 10);
  // Only keep dates where the longest horizon's forward window has
  // already closed. Optionally cap at --max-snapshot-date for
  // regime-specific reruns (e.g., pre-COVID).
  const maxHorizon = Math.max(...args.horizons);
  const cap = args.maxSnapshotDate ?? today;
  const usableDates = dates.filter(
    (d) => d <= cap && addYears(d, maxHorizon) <= today,
  );
  // When --user-picks is supplied, force-include each pick's date in
  // usableDates EVEN WHEN the forward window hasn't closed yet — the
  // user wants to see "what was the rank at the time I bought," and
  // realized return is informational. The user-picks engine reports
  // null for realized excess on incomplete windows.
  if (args.userPicks) {
    const existing = new Set(usableDates);
    for (const pick of args.userPicks) {
      if (!existing.has(pick.snapshotDate)) {
        usableDates.push(pick.snapshotDate);
      }
    }
    usableDates.sort();
  }
  console.log(
    `${usableDates.length} usable backtest dates (max horizon ${maxHorizon}y${args.maxSnapshotDate ? `, capped at ${args.maxSnapshotDate}` : ""}${args.userPicks ? `, +${args.userPicks.length} user-pick dates (forward windows may be open)` : ""}).`,
  );

  // Point-in-time membership history (optional; off by default).
  // When enabled, the backtest universe at date T is filtered to
  // S&P 500 members as of T — eliminates the survivorship bias
  // that makes today's biased universe under-represent failures.
  let membershipHistory: ReturnType<typeof buildMembershipHistory> | null =
    null;
  let delistedSymbols: DelistedSymbol[] = [];
  if (args.pointInTime) {
    console.log(`Loading point-in-time S&P 500 membership history...`);
    const artifact = await loadHistoryArtifact({
      refresh: args.refreshHistory,
    });
    membershipHistory = buildMembershipHistory(
      artifact.currentConstituents,
      artifact.changes,
    );
    console.log(
      `  ${artifact.changes.length} historical changes loaded; cache fetched ${artifact.fetchedAt}.`,
    );

    if (args.includeDelisted) {
      delistedSymbols = extractDelistedSymbols(
        artifact.changes,
        artifact.currentConstituents,
      );
      const byReason = new Map<string, number>();
      for (const d of delistedSymbols) {
        byReason.set(d.removalReason, (byReason.get(d.removalReason) ?? 0) + 1);
      }
      console.log(
        `  Phase 2D: ${delistedSymbols.length} delisted symbols identified — ${[...byReason].map(([k, v]) => `${k}:${v}`).join(", ")}`,
      );
    }
  }

  // Phase 2D — attempt to fetch chart + EDGAR data for delisted
  // symbols. Successful loads get added to the working symbol set
  // and the membership filter naturally includes them at past dates
  // where they were members.
  if (args.includeDelisted && delistedSymbols.length > 0) {
    console.log(`Fetching data for ${delistedSymbols.length} delisted symbols...`);
    let chartOk = 0;
    let edgarOk = 0;
    let bothOk = 0;
    for (const d of delistedSymbols) {
      // Yahoo chart
      let chartLoaded = false;
      try {
        const h = await pullHistory(d.ticker, args.years, {
          cacheDir: args.cacheDir,
          refreshCache: false,
          mergeCache: false,
        });
        if (h.prices.length > 0) {
          histories.set(d.ticker, h);
          chartOk += 1;
          chartLoaded = true;
        }
      } catch {
        // Quietly skip — many delisted symbols won't have Yahoo data
      }
      // EDGAR fundamentals
      let edgarLoaded = false;
      try {
        const facts = await fetchCompanyFacts(d.ticker);
        edgarFacts.set(d.ticker, facts);
        edgarOk += 1;
        edgarLoaded = true;
      } catch (err) {
        if (!(err instanceof EdgarNotFoundError)) {
          // Real error — log; otherwise quiet
        }
      }
      if (chartLoaded && edgarLoaded) bothOk += 1;
    }
    console.log(
      `  Recovery rates: chart ${chartOk}/${delistedSymbols.length} (${((chartOk / delistedSymbols.length) * 100).toFixed(1)}%), EDGAR ${edgarOk}/${delistedSymbols.length} (${((edgarOk / delistedSymbols.length) * 100).toFixed(1)}%), both ${bothOk}/${delistedSymbols.length}`,
    );
    // Add the recoverable delisted tickers to the working symbol list
    // so the per-date snapshot loop sees them.
    for (const d of delistedSymbols) {
      if (histories.has(d.ticker) && edgarFacts.has(d.ticker)) {
        symbols.push(d.ticker);
      }
    }
    console.log(`  Added ${bothOk} delisted symbols to working universe (now ${symbols.length} total).`);
  }

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
    // When point-in-time is enabled, restrict the per-date universe
    // to companies that were S&P 500 members at this date.
    const ptiMembers = membershipHistory
      ? membersAt(membershipHistory, date)
      : null;
    for (const sym of symbols) {
      if (ptiMembers && !ptiMembers.has(sym)) continue;
      const h = histories.get(sym);
      if (!h) continue;
      const facts = edgarFacts.get(sym);
      if (!facts) continue;
      // Use EDGAR for deep history. Build SymbolProfile from cached
      // Yahoo metadata + EDGAR-derived shares.
      const sharesAuth = currentAuthoritativeShares(h);
      if (sharesAuth === null) continue;
      const profile: SymbolProfile = {
        symbol: sym,
        name: h.meta.name,
        sector: h.meta.sector,
        industry: h.meta.industry,
        exchange: "NYSE",
        authoritativeShares: sharesAuth,
        currency: h.meta.currency,
      };
      const bars: HistoricalBar[] = h.prices.map((p) => ({
        date: p.date,
        close: p.close,
        high: p.high ?? null,
        low: p.low ?? null,
      }));
      const snap = synthesizeSnapshotAt(facts, bars, date, profile);
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
    // For --user-picks mode, also emit "snapshot-only" observations
    // (horizon=0, excessReturn=0) for companies at dates whose forward
    // windows haven't closed yet — needed so the user-picks engine
    // can rank picks at recent dates.
    emitSnapshotOnlyForMissing: !!args.userPicks,
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

  // ── Optional: user-picks validation (Phase 1 C) ─────────────────────
  if (args.userPicks) {
    console.log(
      `\nRunning user-picks validation on ${args.userPicks.length} pick(s)...`,
    );
    // Group observations by snapshot date for the engine.
    const obsByDate = new Map<string, typeof observations>();
    for (const o of observations) {
      const arr = obsByDate.get(o.snapshotDate) ?? [];
      arr.push(o);
      obsByDate.set(o.snapshotDate, arr);
    }
    const upReport = evaluateUserPicks({
      picks: args.userPicks,
      observationsByDate: obsByDate,
      weights: DEFAULT_WEIGHTS,
      weightSchemeName: "default (value-deep, ranking.md §8.1)",
    });
    const upMd = renderUserPicksReport(upReport);
    const upPath = resolve(tmpDir, "user-picks.md");
    writeFileSync(upPath, upMd, "utf-8");
    console.log(`  Wrote ${upPath}`);
    for (const entry of upReport.picks) {
      if (entry.ranking) {
        const r = entry.ranking;
        console.log(
          `  ${entry.pick.symbol} @ ${entry.pick.snapshotDate}: SG rank ${r.rankInSuperGroup}/${r.superGroupSize}, universe rank ${r.rankInUniverse}/${r.universeSize}`,
        );
      } else {
        console.log(
          `  ${entry.pick.symbol} @ ${entry.pick.snapshotDate}: ${entry.notFoundReason}`,
        );
      }
    }
    if (args.archive) {
      const docsDir = resolve(process.cwd(), "docs");
      const upArchivePath = resolve(docsDir, `backtest-user-picks-${today}.md`);
      writeFileSync(upArchivePath, upMd, "utf-8");
      console.log(`  Archived to ${upArchivePath}`);
    }
  }

  // ── Optional: per-super-group preset validation (Phase 3 E) ─────────
  if (args.superGroupPresets) {
    console.log(`\nRunning per-super-group preset validation...`);
    const presets = loadPerSuperGroupPresets();
    console.log(`  ${presets.length} preset candidates: ${presets.map((p) => p.name).join(", ")}`);
    const psgReport = runPerSuperGroupValidation(
      observations,
      presets,
      {
        testPeriodStart: args.testPeriodStart,
        bootstrapResamples: 1000,
        seed: 1,
      },
      DEFAULT_WEIGHTS,
    );
    const psgMd = renderPerSuperGroupReport(psgReport);
    const psgPath = resolve(tmpDir, "per-super-group-validation.md");
    writeFileSync(psgPath, psgMd, "utf-8");
    console.log(`  Wrote ${psgPath}`);
    for (const r of psgReport.results) {
      const v = r.verdict;
      const verdictStr = v?.verdict ?? "no verdict";
      const exStr =
        v?.excessVsDefault3y !== null && v?.excessVsDefault3y !== undefined
          ? ` (${(v.excessVsDefault3y * 100).toFixed(2)} pp vs default)`
          : "";
      console.log(
        `    ${r.preset.name} (${r.preset.targetSuperGroup}, N=${r.cohortSize}): ${verdictStr}${exStr}`,
      );
    }
    if (args.archive) {
      const docsDir = resolve(process.cwd(), "docs");
      const psgArchivePath = resolve(docsDir, `backtest-per-super-group-${today}.md`);
      writeFileSync(psgArchivePath, psgMd, "utf-8");
      console.log(`  Archived to ${psgArchivePath}`);
    }
  }

  // ── Optional: legacy-rule audit (§3.5: H10/H11/H12) ─────────────────
  if (args.legacyAudit) {
    console.log(`\nRunning legacy-rule audit (H11 + H12)...`);
    const auditReport = runLegacyAudit({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: args.horizons,
      bootstrapResamples: 1000,
      seed: 1,
    });
    console.log(`  H11: ${auditReport.verdicts.h11.verdict} — ${auditReport.verdicts.h11.evidence}`);
    console.log(`  H12: ${auditReport.verdicts.h12.verdict} — ${auditReport.verdicts.h12.evidence}`);
    const auditFilename = args.archive
      ? `backtest-legacy-rules-${today}.md`
      : "legacy-rules.md";
    const auditMd = renderLegacyAuditReport(auditReport);
    const auditPath = resolve(tmpDir, "legacy-rules.md");
    writeFileSync(auditPath, auditMd, "utf-8");
    console.log(`  Wrote ${auditPath}`);
    if (args.archive) {
      const docsDir = resolve(process.cwd(), "docs");
      const auditArchivePath = resolve(docsDir, auditFilename);
      writeFileSync(auditArchivePath, auditMd, "utf-8");
      console.log(`  Archived to ${auditArchivePath}`);
    }
  }
}

/**
 * Phase 3 — IC-derived per-super-group preset candidates. Each
 * boosts the categories whose factors had passing IC cells in the
 * 2026-04-25 heatmap (`docs/backtest-ic-2026-04-25.md`). All weights
 * sum to 1.0; redistribution from the lowest-IC categories.
 */
function loadPerSuperGroupPresets(): PerSuperGroupPreset[] {
  return [
    {
      // Utilities passing 3y cells: D/EBITDA +0.581 (strongest cell
      // in the heatmap), EV/EBITDA +0.430. Boost Health (where
      // D/EBITDA lives) and keep Valuation high.
      name: "utilities-health-tilt",
      description:
        "Utilities preset: boost Health to 30% (D/EBITDA +0.58 IC); Valuation stays at 45% (EV/EBITDA +0.43 IC)",
      source: "ic-derived",
      targetSuperGroup: "utilities",
      weights: {
        valuation: 0.45,
        health: 0.30,
        quality: 0.10,
        shareholderReturn: 0.10,
        growth: 0.05,
        momentum: 0.0,
      },
    },
    {
      // Semiconductors & Hardware passing 3y cells: EV/EBITDA +0.388,
      // P/E +0.286, P/FCF +0.224 (3 valuation factors), Accruals
      // -0.231 (Quality factor). Boost Quality from 10% to 25% (the
      // accruals signal is doing real work here); keep Valuation high.
      name: "semis-hardware-quality-tilt",
      description:
        "Semis & Hardware: boost Quality to 25% (Sloan accruals -0.23 IC works here); Valuation 50% unchanged",
      source: "ic-derived",
      targetSuperGroup: "semis-hardware",
      weights: {
        valuation: 0.50,
        health: 0.10,
        quality: 0.25,
        shareholderReturn: 0.05,
        growth: 0.10,
        momentum: 0.0,
      },
    },
    {
      // Consumer Discretionary passing 3y cells: EV/EBITDA +0.293,
      // P/FCF +0.241 (just valuation factors). Default already has
      // 50% Valuation; boost slightly to 55% by reducing Health.
      name: "consumer-discretionary-deep-value",
      description:
        "Consumer Discretionary: boost Valuation to 55% (only valuation factors passed); reduce Health",
      source: "ic-derived",
      targetSuperGroup: "consumer-discretionary",
      weights: {
        valuation: 0.55,
        health: 0.15,
        quality: 0.10,
        shareholderReturn: 0.10,
        growth: 0.10,
        momentum: 0.0,
      },
    },
    {
      // Consumer Staples passing 3y cells: NetIssuance -0.257
      // (Shareholder Return factor). Boost Shareholder Return from
      // 10% to 25% (the anti-dilution signal earns its keep).
      name: "consumer-staples-shareholder-return-tilt",
      description:
        "Consumer Staples: boost Shareholder Return to 25% (NetIssuance -0.26 IC); Valuation reduced",
      source: "ic-derived",
      targetSuperGroup: "consumer-staples",
      weights: {
        valuation: 0.40,
        health: 0.20,
        quality: 0.10,
        shareholderReturn: 0.25,
        growth: 0.05,
        momentum: 0.0,
      },
    },
    {
      // Transportation & Autos passing 3y cells: D/EBITDA -0.442
      // (negative — high debt is BAD here). Boost Health to capture
      // the balance-sheet signal.
      name: "transport-autos-health-tilt",
      description:
        "Transportation & Autos: boost Health to 30% (D/EBITDA -0.44 IC, low debt is the signal)",
      source: "ic-derived",
      targetSuperGroup: "transport-autos",
      weights: {
        valuation: 0.45,
        health: 0.30,
        quality: 0.10,
        shareholderReturn: 0.10,
        growth: 0.05,
        momentum: 0.0,
      },
    },
  ];
}

/**
 * Most recent diluted share count from the cached annual fundamentals
 * — used as the EDGAR shares-magnitude reference. Returns null when
 * the symbol has no cached annual data with a share count.
 */
function currentAuthoritativeShares(h: SymbolHistory): number | null {
  for (const a of h.annual) {
    if (a.income.sharesDiluted !== null && a.income.sharesDiluted > 0) {
      return a.income.sharesDiluted;
    }
  }
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
