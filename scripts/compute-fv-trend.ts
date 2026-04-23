#!/usr/bin/env tsx
/**
 * Build the FV-trend signal by reconstructing the snapshot at every
 * historical quarter end (over the past N years) using EDGAR
 * companyfacts + persisted Yahoo monthly chart bars, then running
 * the production FV engine against the synthetic historical
 * universe.
 *
 * Outputs a per-symbol time series of (date, price, fvP25, fvMedian,
 * fvP75) that mirrors what the engine *would have* computed at each
 * date — using the same data source (EDGAR) and the same fairValueFor
 * code path. The rightmost samples come from the daily snapshot
 * archive (most recent days, identical to today's FV bar).
 *
 * Methodology:
 *   1. Enumerate quarter-end dates over the past TREND_WINDOW_YEARS.
 *   2. For each quarter end, synthesize a CompanySnapshot for every
 *      symbol in the universe (sum trailing 4 EDGAR quarters →
 *      historical TTM, point-in-time balance, historical price from
 *      cached monthly bars).
 *   3. Run fairValueFor for each subject against the synthetic
 *      universe. Record (subject, date, p25, median, p75).
 *   4. Append the daily snapshot-archive samples (Apr 20+) for
 *      most-recent fidelity.
 *   5. Fit a linear regression of fvMedian vs time over the most
 *      recent 2-year window and classify the trend.
 *
 * Usage:
 *   npx tsx scripts/compute-fv-trend.ts
 *   npm run fv-trend
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import { fairValueFor } from "@stockrank/ranking";
import {
  EdgarNotFoundError,
  fetchCompanyFacts,
  quarterEndsBetween,
  readMonthlyBars,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "@stockrank/data";

const SNAPSHOT_DIR = resolve(process.cwd(), "public/data");
const OUTPUT_PATH = resolve(process.cwd(), "public/data/fv-trend.json");

const SLOPE_THRESHOLD_PCT = 5;
const TREND_WINDOW_YEARS = 2;
const MIN_SAMPLES = 6;

/** How far back to reconstruct historical samples. EDGAR caps us at
 * ~10y for most filers; we go 3y to keep compute time reasonable
 * while still giving plenty of trend depth. */
const HISTORICAL_RECONSTRUCTION_YEARS = 3;

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

function classifyTrend(slope: number | null): FvTrend {
  if (slope === null) return "insufficient_data";
  if (slope < -SLOPE_THRESHOLD_PCT) return "declining";
  if (slope > SLOPE_THRESHOLD_PCT) return "improving";
  return "stable";
}

async function loadDatedSnapshots(): Promise<
  Array<{ date: string; snapshot: Snapshot }>
> {
  const files = (await readdir(SNAPSHOT_DIR))
    .filter((f) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const out: Array<{ date: string; snapshot: Snapshot }> = [];
  for (const file of files) {
    const date = file.slice(9, 19);
    const text = await readFile(resolve(SNAPSHOT_DIR, file), "utf8");
    out.push({ date, snapshot: JSON.parse(text) as Snapshot });
  }
  return out;
}

/** Build a SymbolProfile for every symbol in the latest snapshot. */
function profilesFromSnapshot(
  snapshot: Snapshot,
): Map<string, SymbolProfile> {
  const out = new Map<string, SymbolProfile>();
  for (const c of snapshot.companies) {
    const annualShares = c.annual[0]?.income.sharesDiluted ?? null;
    const marketCap = c.marketCap;
    // Authoritative shares = marketCap / price (Yahoo's
    // sharesOutstanding implied). Fall back to the snapshot's annual
    // shares for symbols where the implied calc would divide by zero.
    const implied =
      marketCap > 0 && c.quote.price > 0 ? marketCap / c.quote.price : null;
    const authoritativeShares = implied ?? annualShares ?? 0;
    out.set(c.symbol, {
      symbol: c.symbol,
      name: c.name,
      sector: c.sector,
      industry: c.industry,
      exchange: c.exchange,
      currency: c.currency,
      authoritativeShares,
    });
  }
  return out;
}

async function loadAllEdgarFacts(
  profiles: Map<string, SymbolProfile>,
): Promise<Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>> {
  const out = new Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>();
  let loaded = 0;
  let missing = 0;
  for (const symbol of profiles.keys()) {
    try {
      // Cache-only: 24h TTL — if cache empty, fetchCompanyFacts will
      // hit Yahoo, which we want to avoid in a script run. Use a
      // generous TTL so stale-but-existent caches still work.
      const facts = await fetchCompanyFacts(symbol, {
        cacheTtlHours: 24 * 365,
      });
      out.set(symbol, facts);
      loaded += 1;
    } catch (err) {
      if (err instanceof EdgarNotFoundError) {
        missing += 1;
      } else {
        process.stderr.write(
          `[fv-trend] EDGAR fetch failed for ${symbol}: ${
            (err as Error).message
          }\n`,
        );
        missing += 1;
      }
    }
  }
  console.log(
    `Loaded EDGAR facts for ${loaded} symbols (${missing} missing/failed).`,
  );
  return out;
}

async function loadAllChartBars(
  profiles: Map<string, SymbolProfile>,
): Promise<Map<string, Awaited<ReturnType<typeof readMonthlyBars>>>> {
  const out = new Map<string, Awaited<ReturnType<typeof readMonthlyBars>>>();
  let loaded = 0;
  let missing = 0;
  for (const symbol of profiles.keys()) {
    const bars = await readMonthlyBars(symbol);
    if (bars && bars.length > 0) {
      out.set(symbol, bars);
      loaded += 1;
    } else {
      missing += 1;
    }
  }
  console.log(
    `Loaded chart bars for ${loaded} symbols (${missing} missing — re-run ingest to populate).`,
  );
  return out;
}

/** Build the synthetic universe at a single historical date by
 * reconstructing every symbol's snapshot. Symbols missing data at
 * this date are silently dropped. */
function synthesizeUniverseAt(
  date: string,
  profiles: Map<string, SymbolProfile>,
  allFacts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>,
  allBars: Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>,
): CompanySnapshot[] {
  const out: CompanySnapshot[] = [];
  for (const [symbol, profile] of profiles) {
    const facts = allFacts.get(symbol);
    const bars = allBars.get(symbol);
    if (!facts || !bars) continue;
    const snap = synthesizeSnapshotAt(facts, bars, date, profile);
    if (snap) out.push(snap);
  }
  return out;
}

/** Walk historical quarter ends, synthesize the universe at each,
 * run fairValueFor per subject. Yields per-symbol historical samples. */
function reconstructHistoricalSamples(
  todayIso: string,
  profiles: Map<string, SymbolProfile>,
  allFacts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>,
  allBars: Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>,
): Map<string, FvTrendSample[]> {
  const startIso = (() => {
    const d = new Date(`${todayIso}T00:00:00.000Z`);
    d.setUTCFullYear(d.getUTCFullYear() - HISTORICAL_RECONSTRUCTION_YEARS);
    return d.toISOString().slice(0, 10);
  })();
  const dates = quarterEndsBetween(startIso, todayIso);
  console.log(
    `Reconstructing FV at ${dates.length} historical quarter ends ` +
      `(${dates[0]} → ${dates[dates.length - 1]})…`,
  );

  const series = new Map<string, FvTrendSample[]>();
  for (const date of dates) {
    const universe = synthesizeUniverseAt(date, profiles, allFacts, allBars);
    if (universe.length === 0) continue;
    for (const subject of universe) {
      let sample: FvTrendSample;
      try {
        const fv = fairValueFor(subject, universe);
        sample = {
          date,
          price: subject.quote.price,
          fvP25: fv.range?.p25 ?? null,
          fvMedian: fv.range?.median ?? null,
          fvP75: fv.range?.p75 ?? null,
        };
      } catch {
        sample = {
          date,
          price: subject.quote.price,
          fvP25: null,
          fvMedian: null,
          fvP75: null,
        };
      }
      const list = series.get(subject.symbol);
      if (list) list.push(sample);
      else series.set(subject.symbol, [sample]);
    }
  }
  return series;
}

/** Append exactly ONE "today" sample per symbol — the latest dated
 * snapshot only. Per the design rule: "the only daily data is the
 * present snapshot, everything else should be from quarterly
 * filings." Older dated archives are NOT consumed; the historical
 * reconstruction (quarter ends) covers history.
 *
 * Dedupes by date so a today-sample on a calendar quarter end
 * supersedes the reconstructed sample on that day (the archive uses
 * Yahoo's authoritative current TTM, more accurate than recon).
 *
 * Exported for testability. */
export function appendTodaySample(
  series: Map<string, FvTrendSample[]>,
  archive: { date: string; snapshot: Snapshot },
): void {
  const { date, snapshot } = archive;
  for (const company of snapshot.companies) {
    let sample: FvTrendSample;
    try {
      const fv = fairValueFor(company, snapshot.companies);
      sample = {
        date,
        price: company.quote.price,
        fvP25: fv.range?.p25 ?? null,
        fvMedian: fv.range?.median ?? null,
        fvP75: fv.range?.p75 ?? null,
      };
    } catch {
      sample = {
        date,
        price: company.quote.price,
        fvP25: null,
        fvMedian: null,
        fvP75: null,
      };
    }
    const list = series.get(company.symbol) ?? [];
    const filtered = list.filter((s) => s.date !== date);
    filtered.push(sample);
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    series.set(company.symbol, filtered);
  }
}

function computeTrend(samples: FvTrendSample[]): SymbolTrendEntry {
  const fvSamples = samples.filter(
    (r): r is FvTrendSample & { fvMedian: number } =>
      r.fvMedian !== null && r.fvMedian > 0,
  );

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
      quarterly: samples,
    };
  }

  const latest = fvSamples[fvSamples.length - 1]!;
  const windowStartIso = (() => {
    const d = new Date(`${latest.date}T00:00:00.000Z`);
    d.setUTCFullYear(d.getUTCFullYear() - TREND_WINDOW_YEARS);
    return d.toISOString().slice(0, 10);
  })();
  const windowed = fvSamples.filter((r) => r.date >= windowStartIso);
  const sparkline = samples.filter((r) => r.date >= windowStartIso);

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
      quarterly: sparkline,
    };
  }

  const earliestMs = new Date(`${windowed[0]!.date}T00:00:00.000Z`).getTime();
  const xs = windowed.map(
    (r) =>
      (new Date(`${r.date}T00:00:00.000Z`).getTime() - earliestMs) /
      (365.25 * 24 * 3600 * 1000),
  );
  const ys = windowed.map((r) => r.fvMedian);
  const slope = linearSlope(xs, ys);
  const start = ys[0]!;
  const end = ys[ys.length - 1]!;
  const slopePct = slope !== null && start > 0 ? (slope / start) * 100 : null;

  return {
    trend: classifyTrend(slopePct),
    slopePctPerYear: slopePct,
    fvMedianStart: start,
    fvMedianEnd: end,
    totalChangePct: ((end - start) / start) * 100,
    windowStart: windowed[0]!.date,
    windowEnd: latest.date,
    sampleCount: windowed.length,
    quarterly: sparkline,
  };
}

async function main(): Promise<void> {
  const archives = await loadDatedSnapshots();
  if (archives.length === 0) {
    console.error("no dated snapshots found in public/data — aborting");
    process.exit(1);
  }
  const latest = archives[archives.length - 1]!;
  console.log(
    `Latest snapshot: ${latest.date} (${latest.snapshot.companies.length} companies)`,
  );

  const profiles = profilesFromSnapshot(latest.snapshot);
  const allFacts = await loadAllEdgarFacts(profiles);
  const allBars = await loadAllChartBars(profiles);

  const series = reconstructHistoricalSamples(
    latest.date,
    profiles,
    allFacts,
    allBars as Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>,
  );

  // Only the latest dated snapshot ("today") gets injected. Older
  // dated archives are intentionally not consumed — historical
  // samples come from quarterly EDGAR reconstruction, not from
  // bunched-up daily snapshots.
  appendTodaySample(series, latest);

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
