/**
 * Filesystem cache for the S&P 500 changes table.
 *
 * Wikipedia changes are infrequent (a handful per year typically).
 * Default TTL is 7 days — well under the natural change rate.
 *
 * Failure policy (added 2026-08-20 after a Wikipedia page-layout
 * change killed a PIT backtest run): when the live fetch fails and a
 * cache exists — however stale — return the stale artifact with a
 * loud warning instead of throwing. Historical membership at date T
 * is reconstructed by walking changes backward from the artifact's
 * own constituents, so it only requires the (constituents, changes)
 * pair to be internally consistent; events after the artifact's
 * fetch date cannot alter memberships at earlier dates. A stale
 * artifact is therefore strictly better than a dead run. The stale
 * fetched-at is left untouched so the next run retries the live
 * fetch.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchChangesFromWikipedia,
  type IndexChange,
} from "./wikipedia-history.js";
import { fetchSp500FromWikipedia } from "./wikipedia.js";

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

const DEFAULT_CACHE_DIR = resolve(REPO_ROOT, "tmp/sp500-history");

const DEFAULT_TTL_HOURS = 24 * 7;

export type LoadOptions = {
  /** Force a re-fetch even when the cache is fresh. */
  refresh?: boolean;
  /** Override the TTL (default: 168 hours / 7 days). */
  ttlHours?: number;
  /** Override the cache directory (tests). */
  cacheDir?: string;
  /** Override the live fetchers (tests). */
  fetchers?: {
    constituents: () => Promise<Array<{ symbol: string }>>;
    changes: () => Promise<IndexChange[]>;
  };
};

export type HistoryArtifact = {
  currentConstituents: string[];
  changes: IndexChange[];
  fetchedAt: string;
};

type CachePaths = { changes: string; constituents: string; fetchedAt: string };

function pathsFor(cacheDir: string): CachePaths {
  return {
    changes: resolve(cacheDir, "changes.json"),
    constituents: resolve(cacheDir, "current-constituents.json"),
    fetchedAt: resolve(cacheDir, "fetched-at.txt"),
  };
}

/**
 * Load the changes + current constituents from disk if fresh,
 * otherwise fetch from Wikipedia and refresh the cache. On live-fetch
 * failure, fall back to any existing cache (see failure policy above);
 * throw only when there is nothing to fall back to.
 */
export async function loadHistoryArtifact(
  opts: LoadOptions = {},
): Promise<HistoryArtifact> {
  const ttl = opts.ttlHours ?? DEFAULT_TTL_HOURS;
  const cacheDir = opts.cacheDir ?? DEFAULT_CACHE_DIR;
  const paths = pathsFor(cacheDir);
  const fetchers = opts.fetchers ?? {
    constituents: fetchSp500FromWikipedia,
    changes: fetchChangesFromWikipedia,
  };

  if (!opts.refresh) {
    const cached = await readCache(paths, ttl);
    if (cached) return cached;
  }
  await mkdir(cacheDir, { recursive: true });
  let constituents: Array<{ symbol: string }>;
  let changes: IndexChange[];
  try {
    [constituents, changes] = await Promise.all([
      fetchers.constituents(),
      fetchers.changes(),
    ]);
  } catch (err) {
    const stale = await readCache(paths, Infinity);
    if (stale) {
      const ageHours = Math.round(
        (Date.now() - Date.parse(stale.fetchedAt)) / 3600000,
      );
      console.warn(
        `WARNING: live S&P 500 membership fetch failed (${err instanceof Error ? err.message : err}); ` +
          `falling back to STALE cache fetched ${stale.fetchedAt} (~${ageHours}h old). ` +
          `Historical reconstruction stays self-consistent; membership changes after that date are missing.`,
      );
      return stale;
    }
    throw err;
  }
  const fetchedAt = new Date().toISOString();
  await writeFile(
    paths.constituents,
    JSON.stringify(constituents.map((c) => c.symbol), null, 2),
    "utf-8",
  );
  await writeFile(paths.changes, JSON.stringify(changes, null, 2), "utf-8");
  await writeFile(paths.fetchedAt, fetchedAt, "utf-8");
  return {
    currentConstituents: constituents.map((c) => c.symbol),
    changes,
    fetchedAt,
  };
}

async function readCache(
  paths: CachePaths,
  ttlHours: number,
): Promise<HistoryArtifact | null> {
  try {
    const fetchedAt = (await readFile(paths.fetchedAt, "utf-8")).trim();
    const ageMs = Date.now() - Date.parse(fetchedAt);
    if (!Number.isFinite(ageMs) || ageMs > ttlHours * 3600 * 1000) {
      return null;
    }
    const [constituentsRaw, changesRaw] = await Promise.all([
      readFile(paths.constituents, "utf-8"),
      readFile(paths.changes, "utf-8"),
    ]);
    return {
      currentConstituents: JSON.parse(constituentsRaw) as string[],
      changes: JSON.parse(changesRaw) as IndexChange[],
      fetchedAt,
    };
  } catch {
    return null;
  }
}

/** Inspect cache age without fetching — useful for diagnostics. */
export async function cacheAgeHours(): Promise<number | null> {
  try {
    const stats = await stat(pathsFor(DEFAULT_CACHE_DIR).fetchedAt);
    return (Date.now() - stats.mtimeMs) / (3600 * 1000);
  } catch {
    return null;
  }
}
