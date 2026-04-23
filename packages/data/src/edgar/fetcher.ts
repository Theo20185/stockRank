import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { cikFor, formatCik } from "./cik-lookup.js";
import type { EdgarCompanyFacts } from "./types.js";

/** SEC's fair-access policy requires a User-Agent that identifies the
 * caller. Format: `<App> <contact-email>`. Without it, EDGAR returns
 * 403 immediately. */
const DEFAULT_USER_AGENT = "StockRank brandon.theolet@gmail.com";

/** SEC's published rate limit is 10 req/s per source IP. We pace at
 * one request per ~110 ms to leave headroom for clock skew and
 * concurrent retries. */
const MIN_REQUEST_INTERVAL_MS = 110;

/** Cache TTL — daily refresh re-pulls fundamentals once per day. */
const DEFAULT_CACHE_TTL_HOURS = 24;

const CACHE_ROOT = resolve(process.cwd(), "tmp/edgar-cache");

export type FetcherOptions = {
  /** Override the User-Agent. Tests pass a fixture-friendly value. */
  userAgent?: string;
  /** Force a fresh fetch even when the cache is still warm. */
  refresh?: boolean;
  /** TTL in hours; older cache entries trigger a refetch. */
  cacheTtlHours?: number;
  /** Override the cache directory (tests use a temp dir). */
  cacheDir?: string;
  /** Inject a fetch implementation (tests stub the network). */
  fetchImpl?: typeof fetch;
};

let lastRequestAt = 0;

/** Sleep just long enough to keep us under the SEC rate limit. */
async function paceRequest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) =>
      setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed),
    );
  }
  lastRequestAt = Date.now();
}

function cachePathsFor(symbol: string, opts: FetcherOptions): {
  factsPath: string;
  fetchedAtPath: string;
} {
  const root = opts.cacheDir ?? CACHE_ROOT;
  const dir = join(root, symbol.toUpperCase());
  return {
    factsPath: join(dir, "facts.json"),
    fetchedAtPath: join(dir, "fetched-at.txt"),
  };
}

async function readCacheIfFresh(
  symbol: string,
  opts: FetcherOptions,
): Promise<EdgarCompanyFacts | null> {
  if (opts.refresh) return null;
  const { factsPath, fetchedAtPath } = cachePathsFor(symbol, opts);
  try {
    const ttlMs =
      (opts.cacheTtlHours ?? DEFAULT_CACHE_TTL_HOURS) * 3600 * 1000;
    const fetchedAtRaw = await readFile(fetchedAtPath, "utf8");
    const fetchedAt = new Date(fetchedAtRaw.trim()).getTime();
    if (!Number.isFinite(fetchedAt)) return null;
    if (Date.now() - fetchedAt > ttlMs) return null;
    const factsRaw = await readFile(factsPath, "utf8");
    return JSON.parse(factsRaw) as EdgarCompanyFacts;
  } catch {
    return null;
  }
}

async function writeCache(
  symbol: string,
  facts: EdgarCompanyFacts,
  opts: FetcherOptions,
): Promise<void> {
  const { factsPath, fetchedAtPath } = cachePathsFor(symbol, opts);
  await mkdir(dirname(factsPath), { recursive: true });
  await atomicWriteJson(factsPath, facts);
  await writeFile(fetchedAtPath, new Date().toISOString(), "utf8");
}

async function atomicWriteJson(
  path: string,
  value: unknown,
): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value), "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

/** Custom error so callers can distinguish "this CIK doesn't exist"
 * from a transient network problem. */
export class EdgarNotFoundError extends Error {
  constructor(symbol: string, cik: number) {
    super(`EDGAR: companyfacts not found for ${symbol} (CIK ${cik})`);
    this.name = "EdgarNotFoundError";
  }
}

export class EdgarFetchError extends Error {
  constructor(symbol: string, status: number, body: string) {
    super(
      `EDGAR fetch failed for ${symbol}: HTTP ${status} — ${body.slice(0, 200)}`,
    );
    this.name = "EdgarFetchError";
  }
}

/**
 * Fetch the full XBRL companyfacts panel for `symbol`. Reads from
 * cache when warm, otherwise hits EDGAR with proper rate-limiting and
 * persists the response for next time.
 *
 * Throws:
 *   - `EdgarNotFoundError` when the symbol has no CIK in our lookup
 *     OR EDGAR returns 404 for the (otherwise valid) CIK.
 *   - `EdgarFetchError` for any other non-2xx response.
 */
export async function fetchCompanyFacts(
  symbol: string,
  opts: FetcherOptions = {},
): Promise<EdgarCompanyFacts> {
  const cik = await cikFor(symbol);
  if (cik === null) {
    throw new EdgarNotFoundError(symbol, -1);
  }

  const cached = await readCacheIfFresh(symbol, opts);
  if (cached) return cached;

  const url = `https://data.sec.gov/api/xbrl/companyfacts/${formatCik(cik)}.json`;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const fetchImpl = opts.fetchImpl ?? fetch;

  await paceRequest();
  const res = await fetchImpl(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    throw new EdgarNotFoundError(symbol, cik);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new EdgarFetchError(symbol, res.status, body);
  }

  const facts = (await res.json()) as EdgarCompanyFacts;
  await writeCache(symbol, facts, opts).catch((err) => {
    // Cache write failures are best-effort; surface to stderr but don't
    // block the caller.
    process.stderr.write(
      `[edgar] cache write failed for ${symbol}: ${(err as Error).message}\n`,
    );
  });
  return facts;
}

/** Inspect cache freshness without fetching. Used by validation
 * scripts that want to report on cache health. */
export async function cacheAgeHours(
  symbol: string,
  opts: FetcherOptions = {},
): Promise<number | null> {
  const { fetchedAtPath } = cachePathsFor(symbol, opts);
  try {
    const fetchedAtRaw = await readFile(fetchedAtPath, "utf8");
    const fetchedAt = new Date(fetchedAtRaw.trim()).getTime();
    if (!Number.isFinite(fetchedAt)) return null;
    return (Date.now() - fetchedAt) / 3_600_000;
  } catch {
    return null;
  }
}

/** Test-only: reset the rate-limit clock between assertions. */
export function _resetPaceClock(): void {
  lastRequestAt = 0;
}
