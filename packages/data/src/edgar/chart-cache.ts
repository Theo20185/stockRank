/**
 * Persists Yahoo monthly chart bars per symbol so the historical
 * fv-trend reconstruction can read them without re-fetching Yahoo.
 *
 * The Yahoo provider already fetches 6 years of monthly bars
 * (`interval: "1mo"`) on every ingest run for annual price-decoration.
 * This module piggybacks on that fetch — no extra Yahoo calls —
 * by writing the bars to disk after the provider consumes them.
 *
 * Cache layout mirrors the EDGAR cache:
 *
 *   tmp/chart-cache/
 *     {SYMBOL}/
 *       monthly.json        # array of HistoricalBar
 *       fetched-at.txt      # ISO timestamp
 */

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HistoricalBar } from "./mapper.js";

/** Anchor the cache to the repo root rather than `process.cwd()`. The
 * ingest CLI runs from `packages/data/` (per its workspace script) but
 * other consumers (`scripts/compute-fv-trend.ts`) run from the repo
 * root; both must read/write the same cache directory or producers
 * and consumers diverge. This file lives at
 * `packages/data/src/edgar/chart-cache.ts`, so the repo root is 4
 * directories up. */
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const CACHE_ROOT = resolve(REPO_ROOT, "tmp/chart-cache");

/** Default TTL for cached chart data — same as EDGAR's. */
const DEFAULT_CACHE_TTL_HOURS = 24;

export type ChartCacheOptions = {
  /** Override the cache directory (tests use a temp dir). */
  cacheDir?: string;
  /** TTL in hours; older entries are considered stale. */
  cacheTtlHours?: number;
};

function pathsFor(symbol: string, opts: ChartCacheOptions): {
  barsPath: string;
  fetchedAtPath: string;
} {
  const root = opts.cacheDir ?? CACHE_ROOT;
  const dir = join(root, symbol.toUpperCase());
  return {
    barsPath: join(dir, "monthly.json"),
    fetchedAtPath: join(dir, "fetched-at.txt"),
  };
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value), "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Persist this run's monthly bars for the symbol. Called by the
 * Yahoo provider after the chart fetch succeeds. Best-effort: cache
 * write failures are logged but don't fail the ingest. */
export async function writeMonthlyBars(
  symbol: string,
  bars: HistoricalBar[],
  opts: ChartCacheOptions = {},
): Promise<void> {
  const { barsPath, fetchedAtPath } = pathsFor(symbol, opts);
  try {
    await atomicWriteJson(barsPath, bars);
    await writeFile(fetchedAtPath, new Date().toISOString(), "utf8");
  } catch (err) {
    process.stderr.write(
      `[chart-cache] write failed for ${symbol}: ${(err as Error).message}\n`,
    );
  }
}

/** Read cached monthly bars. Returns null when no cache exists or
 * the fetched-at sidecar is missing. The compute-fv-trend script
 * tolerates a stale cache silently — it just gets fewer historical
 * sparkline samples for any symbol whose chart cache hasn't been
 * refreshed lately. */
export async function readMonthlyBars(
  symbol: string,
  opts: ChartCacheOptions = {},
): Promise<HistoricalBar[] | null> {
  const { barsPath } = pathsFor(symbol, opts);
  try {
    const raw = await readFile(barsPath, "utf8");
    return JSON.parse(raw) as HistoricalBar[];
  } catch {
    return null;
  }
}

/** Hours since the cache was written. Diagnostic only. */
export async function chartCacheAgeHours(
  symbol: string,
  opts: ChartCacheOptions = {},
): Promise<number | null> {
  const { fetchedAtPath } = pathsFor(symbol, opts);
  try {
    const raw = await readFile(fetchedAtPath, "utf8");
    const fetchedAt = new Date(raw.trim()).getTime();
    if (!Number.isFinite(fetchedAt)) return null;
    return (Date.now() - fetchedAt) / 3_600_000;
  } catch {
    return null;
  }
}

export { DEFAULT_CACHE_TTL_HOURS };
