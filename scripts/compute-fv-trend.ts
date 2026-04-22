#!/usr/bin/env tsx
/**
 * Build the FV-trend signal directly from the dated snapshot archive.
 *
 * Each refresh writes `public/data/snapshot-YYYY-MM-DD.json`. Those
 * archived snapshots carry Yahoo's authoritative TTM ratios as they
 * stood on the snapshot date — no historical reconstruction, no
 * quarterly-sum approximation. Recomputing fair value against the
 * archive therefore uses the same engine and the same data the
 * production page used on that date, so the right-most sparkline
 * sample on the stock-detail page is identical to the FV bar shown
 * directly above it.
 *
 * Trade-off the user accepted: history starts when the archive
 * starts. Older synthetic reconstructions from `tmp/backtest/*.csv`
 * are no longer used by the sparkline — they relied on a different
 * TTM derivation that diverged from production by 30%+ on a
 * meaningful tail of names.
 *
 * Methodology:
 *   - Walk every `snapshot-YYYY-MM-DD.json` in `public/data/`,
 *     sorted ascending.
 *   - For each archive, call `fairValueFor(company, archive.companies)`
 *     once per company. Append (date, price, fvP25, fvMedian, fvP75)
 *     to that symbol's series.
 *   - For each symbol, regress fvMedian vs time on the most recent
 *     `TREND_WINDOW_YEARS`. Slope is normalised to %/yr of the start
 *     value. Below threshold → declining; above → improving; else
 *     stable. Until ≥ MIN_SAMPLES land in the window the symbol is
 *     marked `insufficient_data` (true while the archive is fresh).
 *   - Downsample the in-window samples to one per calendar quarter
 *     for the sparkline payload — same shape the UI already consumes.
 *
 * Usage:
 *   npx tsx scripts/compute-fv-trend.ts
 *   npm run fv-trend
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import { fairValueFor } from "@stockrank/ranking";

const SNAPSHOT_DIR = resolve(process.cwd(), "public/data");
const OUTPUT_PATH = resolve(process.cwd(), "public/data/fv-trend.json");

/** Slope threshold (percent of starting FV per year) for declining /
 * improving classification. Below this in absolute value → "stable". */
const SLOPE_THRESHOLD_PCT = 5;

/** Window for the regression. Sparkline payload uses the same window. */
const TREND_WINDOW_YEARS = 2;
const MIN_SAMPLES = 6;

type FvTrend = "declining" | "stable" | "improving" | "insufficient_data";

type FvTrendSample = {
  date: string;
  price: number;
  fvP25: number | null;
  fvMedian: number | null;
  fvP75: number | null;
};

type SymbolTrendEntry = {
  trend: FvTrend;
  slopePctPerYear: number | null;
  fvMedianStart: number | null;
  fvMedianEnd: number | null;
  totalChangePct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  sampleCount: number;
  quarterly: FvTrendSample[];
};

type FvTrendArtifact = {
  generatedAt: string;
  windowYears: number;
  slopeThresholdPctPerYear: number;
  symbols: Record<string, SymbolTrendEntry>;
};

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

type ArchiveEntry = { date: string; snapshot: Snapshot };

async function loadDatedSnapshots(): Promise<ArchiveEntry[]> {
  const files = (await readdir(SNAPSHOT_DIR))
    .filter((f) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const out: ArchiveEntry[] = [];
  for (const file of files) {
    const date = file.slice("snapshot-".length, "snapshot-".length + 10);
    const text = await readFile(resolve(SNAPSHOT_DIR, file), "utf8");
    out.push({ date, snapshot: JSON.parse(text) as Snapshot });
  }
  return out;
}

function fvSampleFor(
  date: string,
  company: CompanySnapshot,
  universe: CompanySnapshot[],
): FvTrendSample {
  const fv = fairValueFor(company, universe);
  return {
    date,
    price: company.quote.price,
    fvP25: fv.range?.p25 ?? null,
    fvMedian: fv.range?.median ?? null,
    fvP75: fv.range?.p75 ?? null,
  };
}

/**
 * Walk every archive once. Build per-symbol time series. fairValueFor
 * is pure and cheap — one pass over the universe per archive is fine
 * even at hundreds of archives × 500 symbols.
 */
function buildSymbolSeries(archives: ArchiveEntry[]): Map<string, FvTrendSample[]> {
  const series = new Map<string, FvTrendSample[]>();
  for (const { date, snapshot } of archives) {
    for (const company of snapshot.companies) {
      let sample: FvTrendSample;
      try {
        sample = fvSampleFor(date, company, snapshot.companies);
      } catch {
        // A bad single-snapshot fairValueFor must not poison the rest.
        sample = { date, price: company.quote.price, fvP25: null, fvMedian: null, fvP75: null };
      }
      const list = series.get(company.symbol);
      if (list) list.push(sample);
      else series.set(company.symbol, [sample]);
    }
  }
  return series;
}

/**
 * Pick the latest sample in each calendar quarter that falls inside
 * the trend window. Same shape the UI's sparkline already expects.
 */
function quarterlySamples(samples: FvTrendSample[]): FvTrendSample[] {
  if (samples.length === 0) return [];
  const latestDate = samples[samples.length - 1]!.date;
  const latestYear = parseInt(latestDate.slice(0, 4), 10);
  const latestMonth = parseInt(latestDate.slice(5, 7), 10);
  const latestQuarter = Math.ceil(latestMonth / 3);
  const quarters: Array<{ year: number; quarter: number }> = [];
  for (let q = TREND_WINDOW_YEARS * 4; q >= 0; q -= 1) {
    let year = latestYear;
    let quarter = latestQuarter - q;
    while (quarter <= 0) { quarter += 4; year -= 1; }
    quarters.push({ year, quarter });
  }
  const byQuarter = new Map<string, FvTrendSample>();
  for (const r of samples) {
    const y = parseInt(r.date.slice(0, 4), 10);
    const m = parseInt(r.date.slice(5, 7), 10);
    const q = Math.ceil(m / 3);
    const key = `${y}-Q${q}`;
    const existing = byQuarter.get(key);
    if (!existing || r.date > existing.date) byQuarter.set(key, r);
  }
  const out: FvTrendSample[] = [];
  for (const { year, quarter } of quarters) {
    const r = byQuarter.get(`${year}-Q${quarter}`);
    if (r) out.push(r);
  }
  return out;
}

function computeTrend(samples: FvTrendSample[]): SymbolTrendEntry {
  const fvSamples = samples.filter(
    (r): r is FvTrendSample & { fvMedian: number } =>
      r.fvMedian !== null && r.fvMedian > 0,
  );
  const quarterly = quarterlySamples(samples);

  if (fvSamples.length === 0) {
    return {
      trend: "insufficient_data",
      slopePctPerYear: null,
      fvMedianStart: null,
      fvMedianEnd: null,
      totalChangePct: null,
      windowStart: null,
      windowEnd: null,
      sampleCount: 0,
      quarterly,
    };
  }

  const latest = fvSamples[fvSamples.length - 1]!;
  const windowStartIso = (() => {
    const d = new Date(`${latest.date}T00:00:00.000Z`);
    d.setUTCFullYear(d.getUTCFullYear() - TREND_WINDOW_YEARS);
    return d.toISOString().slice(0, 10);
  })();
  const windowed = fvSamples.filter((r) => r.date >= windowStartIso);

  if (windowed.length < MIN_SAMPLES) {
    return {
      trend: "insufficient_data",
      slopePctPerYear: null,
      fvMedianStart: null,
      fvMedianEnd: null,
      totalChangePct: null,
      windowStart: windowed[0]?.date ?? null,
      windowEnd: latest.date,
      sampleCount: windowed.length,
      quarterly,
    };
  }

  const earliestMs = new Date(`${windowed[0]!.date}T00:00:00.000Z`).getTime();
  const xs = windowed.map(
    (r) => (new Date(`${r.date}T00:00:00.000Z`).getTime() - earliestMs) /
      (365.25 * 24 * 3600 * 1000),
  );
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
    sampleCount: windowed.length,
    quarterly,
  };
}

async function main(): Promise<void> {
  const archives = await loadDatedSnapshots();
  if (archives.length === 0) {
    console.error("no dated snapshots found in public/data — nothing to compute");
    process.exit(1);
  }
  console.log(
    `Reading FV history from ${archives.length} dated snapshots ` +
      `(${archives[0]!.date} → ${archives[archives.length - 1]!.date})...`,
  );

  const series = buildSymbolSeries(archives);

  const symbols: Record<string, SymbolTrendEntry> = {};
  const counts = { declining: 0, stable: 0, improving: 0, insufficient_data: 0 };
  for (const [symbol, samples] of series) {
    const entry = computeTrend(samples);
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
  console.log(`  symbols:           ${Object.keys(symbols).length}`);
  console.log(`  declining:         ${counts.declining}`);
  console.log(`  stable:            ${counts.stable}`);
  console.log(`  improving:         ${counts.improving}`);
  console.log(`  insufficient_data: ${counts.insufficient_data}`);
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
