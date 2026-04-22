#!/usr/bin/env tsx
/**
 * One-shot analysis: when names FAIL to reach p25 within the horizon,
 * (a) do they actually lose money, or just gain less than we projected?
 * (b) does the fair-value projection itself decrease over that same
 * period (model adapting / fundamentals deteriorating), or stay
 * roughly the same (price chase)?
 *
 * Reads the per-symbol accuracy CSVs (which carry the realized return
 * data) and joins them to the per-symbol engine-validation CSVs (which
 * carry FV at every monthly date) so we can compare FV at T to FV at
 * T+horizon for every miss event.
 *
 * Usage:
 *   npx tsx scripts/analyze-misses.ts
 *
 * Reads from tmp/backtest/ — assumes the most recent --accuracy run
 * already produced the CSVs there.
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

type AccuracyRow = {
  symbol: string;
  date: string;
  horizon: number;
  priceAtT: number;
  fvP25: number | null;
  fvMedianAtT: number | null;
  realizedReturnPct: number | null;
  windowComplete: boolean;
  endpointHitP25: boolean | null;
};

type FvByDate = Map<string, { fvP25: number | null; fvMedian: number | null }>;

const BACKTEST_DIR = resolve(process.cwd(), "tmp/backtest");

function num(v: string): number | null {
  if (v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: string): boolean | null {
  if (v === "") return null;
  return v === "1";
}

async function loadAccuracyRows(): Promise<AccuracyRow[]> {
  const files = (await readdir(BACKTEST_DIR)).filter((f) => f.endsWith("-accuracy.csv"));
  const out: AccuracyRow[] = [];
  for (const file of files) {
    const text = await readFile(resolve(BACKTEST_DIR, file), "utf8");
    const lines = text.split("\n");
    const headers = lines[0]!.split(",");
    const ix = (n: string) => headers.indexOf(n);
    const iSymbol = ix("symbol"), iDate = ix("date"), iHorizon = ix("horizon");
    const iPrice = ix("priceAtT"), iP25 = ix("fvP25"), iMed = ix("fvMedian");
    const iRealized = ix("realizedReturnPct"), iWindow = ix("windowComplete");
    const iHitP25 = ix("endpointHitP25");
    for (const line of lines.slice(1)) {
      if (!line) continue;
      const c = line.split(",");
      out.push({
        symbol: c[iSymbol]!,
        date: c[iDate]!,
        horizon: parseInt(c[iHorizon]!, 10),
        priceAtT: parseFloat(c[iPrice]!),
        fvP25: num(c[iP25]!),
        fvMedianAtT: num(c[iMed]!),
        realizedReturnPct: num(c[iRealized]!),
        windowComplete: bool(c[iWindow]!) ?? false,
        endpointHitP25: bool(c[iHitP25]!),
      });
    }
  }
  return out;
}

async function loadEngineValidationFv(symbol: string): Promise<FvByDate> {
  const path = resolve(BACKTEST_DIR, `${symbol}.csv`);
  const out: FvByDate = new Map();
  try {
    const text = await readFile(path, "utf8");
    const lines = text.split("\n");
    const headers = lines[0]!.split(",");
    const iDate = headers.indexOf("date");
    const iP25 = headers.indexOf("fvP25");
    const iMed = headers.indexOf("fvMedian");
    for (const line of lines.slice(1)) {
      if (!line) continue;
      const c = line.split(",");
      out.set(c[iDate]!, { fvP25: num(c[iP25]!), fvMedian: num(c[iMed]!) });
    }
  } catch {
    // missing file — return empty map
  }
  return out;
}

function addYearsIso(dateIso: string, years: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Given an FV-by-date map, find the FV at-or-after a target date. */
function fvAtOrAfter(map: FvByDate, dateIso: string): { fvP25: number | null; fvMedian: number | null } | null {
  const sorted = [...map.keys()].sort();
  for (const d of sorted) {
    if (d >= dateIso) {
      const v = map.get(d)!;
      if (v.fvP25 !== null) return v; // first non-null
    }
  }
  return null;
}

function describe(label: string, values: number[]): void {
  if (values.length === 0) {
    console.log(`  ${label}: (no data)`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p25 = sorted[Math.floor(sorted.length * 0.25)]!;
  const p75 = sorted[Math.floor(sorted.length * 0.75)]!;
  const negCount = values.filter((v) => v < 0).length;
  const negPct = (negCount / values.length) * 100;
  console.log(
    `  ${label.padEnd(32)} N=${String(values.length).padStart(5)}  mean ${mean.toFixed(1).padStart(7)}%  median ${median.toFixed(1).padStart(7)}%  p25 ${p25.toFixed(1).padStart(7)}%  p75 ${p75.toFixed(1).padStart(7)}%  neg ${negPct.toFixed(0)}%`,
  );
}

async function main() {
  console.log("Loading accuracy rows...");
  const allRows = await loadAccuracyRows();
  console.log(`  ${allRows.length} total accuracy rows across all symbols`);

  // Filter to miss-p25 events: windowComplete + endpointHitP25=false
  const misses = allRows.filter(
    (r) => r.windowComplete && r.endpointHitP25 === false && r.fvP25 !== null,
  );
  const hits = allRows.filter(
    (r) => r.windowComplete && r.endpointHitP25 === true && r.fvP25 !== null,
  );
  console.log(`  ${misses.length} miss-p25 events (price at T+horizon < projected p25)`);
  console.log(`  ${hits.length} hit-p25 events (for comparison)`);
  console.log("");

  // Group misses by symbol so we can load each engine-validation CSV once
  const fvCache = new Map<string, FvByDate>();
  async function getFv(symbol: string): Promise<FvByDate> {
    let m = fvCache.get(symbol);
    if (!m) {
      m = await loadEngineValidationFv(symbol);
      fvCache.set(symbol, m);
    }
    return m;
  }

  // For each miss, also look up FV at horizon-end (T + horizon years)
  type Enriched = AccuracyRow & {
    fvP25AtHorizon: number | null;
    fvMedianAtHorizon: number | null;
    fvP25Change: number | null;
    fvMedianChange: number | null;
  };
  const enrichedMisses: Enriched[] = [];
  for (const r of misses) {
    const fvMap = await getFv(r.symbol);
    const horizonDate = addYearsIso(r.date, r.horizon);
    const fvAtH = fvAtOrAfter(fvMap, horizonDate);
    enrichedMisses.push({
      ...r,
      fvP25AtHorizon: fvAtH?.fvP25 ?? null,
      fvMedianAtHorizon: fvAtH?.fvMedian ?? null,
      fvP25Change: fvAtH?.fvP25 != null && r.fvP25 != null
        ? ((fvAtH.fvP25 - r.fvP25) / r.fvP25) * 100
        : null,
      fvMedianChange: fvAtH?.fvMedian != null && r.fvMedianAtT != null
        ? ((fvAtH.fvMedian - r.fvMedianAtT) / r.fvMedianAtT) * 100
        : null,
    });
  }

  // Per-horizon analysis
  console.log("=".repeat(110));
  console.log("Question 1: when names miss p25, do they LOSE money or just gain less than projected?");
  console.log("=".repeat(110));
  for (const h of [1, 2, 3]) {
    const subMiss = enrichedMisses.filter((r) => r.horizon === h);
    const subHit = hits.filter((r) => r.horizon === h);
    if (subMiss.length === 0 && subHit.length === 0) continue;
    console.log(`\n${h}y horizon:`);
    describe(`  Realized return | misses`, subMiss.map((r) => r.realizedReturnPct!).filter((v) => v !== null) as number[]);
    describe(`  Realized return | hits`, subHit.map((r) => r.realizedReturnPct!).filter((v) => v !== null) as number[]);
  }

  console.log("");
  console.log("=".repeat(110));
  console.log("Question 2: when names miss p25, does the FV projection itself decrease over the same period?");
  console.log("=".repeat(110));
  for (const h of [1, 2, 3]) {
    const sub = enrichedMisses.filter((r) => r.horizon === h && r.fvP25Change !== null);
    if (sub.length === 0) continue;
    console.log(`\n${h}y horizon:`);
    describe(`  FV p25 change (T → T+${h}y)`, sub.map((r) => r.fvP25Change!));
    const subMed = sub.filter((r) => r.fvMedianChange !== null);
    describe(`  FV median change (T → T+${h}y)`, subMed.map((r) => r.fvMedianChange!));
    // Cross-tab: did price drop more than FV, less than FV, or did FV move up?
    const both = sub.filter((r) => r.realizedReturnPct !== null);
    const fvUp = both.filter((r) => r.fvP25Change! > 0);
    const fvDown = both.filter((r) => r.fvP25Change! < 0);
    const fvFlat = both.filter((r) => r.fvP25Change! === 0);
    console.log(`    of which: FV p25 up=${fvUp.length}  down=${fvDown.length}  flat=${fvFlat.length}`);
    if (fvDown.length > 0) {
      const priceVsFv = fvDown.filter((r) => r.realizedReturnPct! < r.fvP25Change!).length;
      console.log(`    when FV declined: price fell MORE than FV in ${priceVsFv}/${fvDown.length} cases (${((priceVsFv/fvDown.length)*100).toFixed(0)}%) — model "gave up too late"`);
    }
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
