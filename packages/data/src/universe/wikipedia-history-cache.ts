/**
 * Filesystem cache for the S&P 500 changes table.
 *
 * Wikipedia changes are infrequent (a handful per year typically).
 * Default TTL is 7 days — well under the natural change rate.
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

const CACHE_DIR = resolve(REPO_ROOT, "tmp/sp500-history");
const CHANGES_PATH = resolve(CACHE_DIR, "changes.json");
const CONSTITUENTS_PATH = resolve(CACHE_DIR, "current-constituents.json");
const FETCHED_AT_PATH = resolve(CACHE_DIR, "fetched-at.txt");

const DEFAULT_TTL_HOURS = 24 * 7;

export type LoadOptions = {
  /** Force a re-fetch even when the cache is fresh. */
  refresh?: boolean;
  /** Override the TTL (default: 168 hours / 7 days). */
  ttlHours?: number;
};

export type HistoryArtifact = {
  currentConstituents: string[];
  changes: IndexChange[];
  fetchedAt: string;
};

/**
 * Load the changes + current constituents from disk if fresh,
 * otherwise fetch from Wikipedia and refresh the cache.
 */
export async function loadHistoryArtifact(
  opts: LoadOptions = {},
): Promise<HistoryArtifact> {
  const ttl = opts.ttlHours ?? DEFAULT_TTL_HOURS;
  if (!opts.refresh) {
    const cached = await readCacheIfFresh(ttl);
    if (cached) return cached;
  }
  await mkdir(CACHE_DIR, { recursive: true });
  const [constituents, changes] = await Promise.all([
    fetchSp500FromWikipedia(),
    fetchChangesFromWikipedia(),
  ]);
  const fetchedAt = new Date().toISOString();
  await writeFile(
    CONSTITUENTS_PATH,
    JSON.stringify(constituents.map((c) => c.symbol), null, 2),
    "utf-8",
  );
  await writeFile(CHANGES_PATH, JSON.stringify(changes, null, 2), "utf-8");
  await writeFile(FETCHED_AT_PATH, fetchedAt, "utf-8");
  return {
    currentConstituents: constituents.map((c) => c.symbol),
    changes,
    fetchedAt,
  };
}

async function readCacheIfFresh(ttlHours: number): Promise<HistoryArtifact | null> {
  try {
    const fetchedAt = (await readFile(FETCHED_AT_PATH, "utf-8")).trim();
    const ageMs = Date.now() - Date.parse(fetchedAt);
    if (!Number.isFinite(ageMs) || ageMs > ttlHours * 3600 * 1000) {
      return null;
    }
    const [constituentsRaw, changesRaw] = await Promise.all([
      readFile(CONSTITUENTS_PATH, "utf-8"),
      readFile(CHANGES_PATH, "utf-8"),
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
    const stats = await stat(FETCHED_AT_PATH);
    return (Date.now() - stats.mtimeMs) / (3600 * 1000);
  } catch {
    return null;
  }
}
