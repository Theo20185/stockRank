#!/usr/bin/env tsx
/**
 * Extract FV-trend signal from the back-test's per-symbol CSVs and
 * write a compact `public/data/fv-trend.json` artifact for the web app
 * to consume.
 *
 * Per the miss-analysis finding: when names miss the projected p25
 * tail, ~96% of the time both their price AND their fair-value
 * projection have declined together. So a downward FV trend is itself
 * a "fundamentals deteriorating" signal — the web app demotes such
 * names to the Watch bucket so we avoid them until the trend reverses.
 *
 * Methodology:
 *   - For each symbol, read its per-symbol back-test CSV (which has
 *     monthly FV values over ~3-4 years).
 *   - Filter to rows with non-null fvMedian (early dates lack enough
 *     annual history for FV to compute).
 *   - Take the most recent ~2 years of monthly samples.
 *   - Fit a simple linear regression of fvMedian vs time (in years).
 *   - Slope expressed as %/year of the starting value:
 *       slope < -SLOPE_THRESHOLD_PCT/yr → "declining"
 *       slope > +SLOPE_THRESHOLD_PCT/yr → "improving"
 *       else                            → "stable"
 *
 * Usage:
 *   npx tsx scripts/compute-fv-trend.ts
 *   npm run fv-trend
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const BACKTEST_DIR = resolve(process.cwd(), "tmp/backtest");
const OUTPUT_PATH = resolve(process.cwd(), "public/data/fv-trend.json");

/** Slope threshold (percent of starting FV per year) for declining /
 * improving classification. Below this in absolute value → "stable".
 * 5%/yr means a 10% drop over a 2-year window — a meaningful trend
 * but not a tiny noise artifact. */
const SLOPE_THRESHOLD_PCT = 5;

/** How far back to sample. 2 years at monthly frequency = 24 points,
 * comfortably above the 6-point minimum for a stable slope estimate. */
const TREND_WINDOW_YEARS = 2;
const MIN_SAMPLES = 6;

type FvTrend = "declining" | "stable" | "improving" | "insufficient_data";

type SymbolTrendEntry = {
  trend: FvTrend;
  slopePctPerYear: number | null;
  fvMedianStart: number | null;
  fvMedianEnd: number | null;
  totalChangePct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  samples: number;
};

type FvTrendArtifact = {
  generatedAt: string;
  windowYears: number;
  slopeThresholdPctPerYear: number;
  symbols: Record<string, SymbolTrendEntry>;
};

function num(v: string): number | null {
  if (v === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Linear regression slope of y vs x. Returns slope in y-units per
 * x-unit. Caller normalizes to %/yr by dividing by start value × 100. */
function linearSlope(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

function classifyTrend(slopePctPerYear: number | null): FvTrend {
  if (slopePctPerYear === null) return "insufficient_data";
  if (slopePctPerYear < -SLOPE_THRESHOLD_PCT) return "declining";
  if (slopePctPerYear > SLOPE_THRESHOLD_PCT) return "improving";
  return "stable";
}

async function readPerSymbolCsv(symbol: string): Promise<Array<{ date: string; fvMedian: number }>> {
  const path = resolve(BACKTEST_DIR, `${symbol}.csv`);
  try {
    const text = await readFile(path, "utf8");
    const lines = text.split("\n");
    const headers = lines[0]!.split(",");
    const iDate = headers.indexOf("date");
    const iMed = headers.indexOf("fvMedian");
    const out: Array<{ date: string; fvMedian: number }> = [];
    for (const line of lines.slice(1)) {
      if (!line) continue;
      const c = line.split(",");
      const m = num(c[iMed]!);
      if (m === null || m <= 0) continue;
      out.push({ date: c[iDate]!, fvMedian: m });
    }
    return out;
  } catch {
    return [];
  }
}

function computeTrend(rows: Array<{ date: string; fvMedian: number }>): SymbolTrendEntry {
  if (rows.length === 0) {
    return {
      trend: "insufficient_data",
      slopePctPerYear: null,
      fvMedianStart: null,
      fvMedianEnd: null,
      totalChangePct: null,
      windowStart: null,
      windowEnd: null,
      samples: 0,
    };
  }
  // Take the most recent TREND_WINDOW_YEARS of data
  const latest = rows[rows.length - 1]!;
  const windowStartIso = (() => {
    const d = new Date(`${latest.date}T00:00:00.000Z`);
    d.setUTCFullYear(d.getUTCFullYear() - TREND_WINDOW_YEARS);
    return d.toISOString().slice(0, 10);
  })();
  const windowed = rows.filter((r) => r.date >= windowStartIso);

  if (windowed.length < MIN_SAMPLES) {
    return {
      trend: "insufficient_data",
      slopePctPerYear: null,
      fvMedianStart: null,
      fvMedianEnd: null,
      totalChangePct: null,
      windowStart: windowed[0]?.date ?? null,
      windowEnd: latest.date,
      samples: windowed.length,
    };
  }

  // x in years from earliest sample, y = fvMedian
  const earliestDate = new Date(`${windowed[0]!.date}T00:00:00.000Z`).getTime();
  const xs = windowed.map((r) => (new Date(`${r.date}T00:00:00.000Z`).getTime() - earliestDate) / (365.25 * 24 * 3600 * 1000));
  const ys = windowed.map((r) => r.fvMedian);
  const slope = linearSlope(xs, ys);
  const start = ys[0]!;
  const end = ys[ys.length - 1]!;
  const slopePctPerYear = slope !== null && start > 0 ? (slope / start) * 100 : null;

  return {
    trend: classifyTrend(slopePctPerYear),
    slopePctPerYear,
    fvMedianStart: start,
    fvMedianEnd: end,
    totalChangePct: ((end - start) / start) * 100,
    windowStart: windowed[0]!.date,
    windowEnd: latest.date,
    samples: windowed.length,
  };
}

async function main(): Promise<void> {
  const files = (await readdir(BACKTEST_DIR)).filter(
    (f) => f.endsWith(".csv") && !f.endsWith("-accuracy.csv"),
  );
  console.log(`Reading FV history from ${files.length} per-symbol back-test CSVs...`);

  const symbols: Record<string, SymbolTrendEntry> = {};
  let counts = { declining: 0, stable: 0, improving: 0, insufficient_data: 0 };
  for (const file of files) {
    const symbol = file.replace(/\.csv$/, "");
    const rows = await readPerSymbolCsv(symbol);
    const entry = computeTrend(rows);
    symbols[symbol] = entry;
    counts[entry.trend] += 1;
  }

  const artifact: FvTrendArtifact = {
    generatedAt: new Date().toISOString(),
    windowYears: TREND_WINDOW_YEARS,
    slopeThresholdPctPerYear: SLOPE_THRESHOLD_PCT,
    symbols,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(artifact, null, 2), "utf8");
  console.log(`\nwrote ${OUTPUT_PATH}`);
  console.log(`  declining:         ${counts.declining}`);
  console.log(`  stable:            ${counts.stable}`);
  console.log(`  improving:         ${counts.improving}`);
  console.log(`  insufficient_data: ${counts.insufficient_data}`);
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
