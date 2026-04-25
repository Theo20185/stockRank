import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOOKUP_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./cik-lookup.json",
);

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);
const SEC_FALLBACK_CACHE_PATH = resolve(
  REPO_ROOT,
  "tmp",
  "sec-company-tickers.json",
);
const SEC_FALLBACK_TTL_HOURS = 24 * 7; // weekly refresh
const SEC_FALLBACK_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_USER_AGENT = "StockRank brandon.theolet@gmail.com";

let cache: Record<string, number> | null = null;
let secFallbackCache: Map<string, number> | null = null;

async function loadLookup(): Promise<Record<string, number>> {
  if (cache) return cache;
  const raw = await readFile(LOOKUP_PATH, "utf8");
  cache = JSON.parse(raw) as Record<string, number>;
  return cache;
}

/** SEC's authoritative company-ticker → CIK table. Cached at
 * `tmp/sec-company-tickers.json` with a weekly TTL. Used as a
 * fallback for `cikFor` when the local S&P-500-baked lookup misses
 * — recovers CIKs for delisted-but-still-active filers (cap-change
 * removals, foreign ADRs, smaller-cap names not in S&P 500). */
async function loadSecFallback(opts?: { fetchImpl?: typeof fetch }): Promise<Map<string, number>> {
  if (secFallbackCache) return secFallbackCache;

  // Read cache if fresh.
  let parsed: SecTickersResponse | null = null;
  try {
    const stats = await stat(SEC_FALLBACK_CACHE_PATH);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < SEC_FALLBACK_TTL_HOURS * 3600 * 1000) {
      const raw = await readFile(SEC_FALLBACK_CACHE_PATH, "utf-8");
      parsed = JSON.parse(raw) as SecTickersResponse;
    }
  } catch {
    // Cache miss / not present — fetch fresh below.
  }

  if (!parsed) {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const res = await fetchImpl(SEC_FALLBACK_URL, {
      headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(
        `SEC company_tickers fetch failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
    parsed = (await res.json()) as SecTickersResponse;
    await mkdir(dirname(SEC_FALLBACK_CACHE_PATH), { recursive: true });
    await writeFile(
      SEC_FALLBACK_CACHE_PATH,
      JSON.stringify(parsed),
      "utf-8",
    );
  }

  // Build the ticker → CIK map. SEC's table uses ticker forms with
  // dashes (BRK-B not BRK.B) and uppercases everything.
  const map = new Map<string, number>();
  for (const row of Object.values(parsed)) {
    map.set(row.ticker.toUpperCase(), row.cik_str);
  }
  secFallbackCache = map;
  return map;
}

type SecTickersResponse = Record<
  string,
  { cik_str: number; ticker: string; title: string }
>;

/**
 * Resolve a ticker to a CIK. Tries the local baked S&P 500 lookup
 * first; on miss, falls back to SEC's authoritative
 * `company_tickers.json` (cached locally with weekly TTL). Returns
 * null only when neither source has the ticker.
 *
 * The fallback recovers CIKs for delisted-but-still-active filers
 * (e.g., S&P 500 cap-change removals where the company still trades),
 * which the local table doesn't cover. Phase 2D.1 work
 * (docs/specs/backtest-actions-2026-04-25-phase2.md §2). For
 * bankruptcies / fully-inactive filers the SEC table also won't
 * have them; use a hand-curated map or accept the gap.
 */
export async function cikFor(symbol: string): Promise<number | null> {
  const lookup = await loadLookup();
  const cik = lookup[symbol];
  if (cik !== undefined) return cik;
  // Fallback to SEC's broader table.
  try {
    const fallback = await loadSecFallback();
    // Try the symbol directly + the dash-normalized form (BRK.B → BRK-B).
    const variants = [
      symbol.toUpperCase(),
      symbol.replace(/\./g, "-").toUpperCase(),
      symbol.replace(/\./g, "").toUpperCase(),
    ];
    for (const v of variants) {
      const fallbackCik = fallback.get(v);
      if (fallbackCik !== undefined) return fallbackCik;
    }
    return null;
  } catch {
    // SEC fetch failed (rate limit, network) — degrade gracefully
    // back to the local-lookup-only behavior.
    return null;
  }
}

/** 10-digit zero-padded CIK string for use in the EDGAR URL. */
export function formatCik(cik: number): string {
  return `CIK${String(cik).padStart(10, "0")}`;
}

/** Reset the in-memory cache. Tests use this to avoid leakage. */
export function _resetLookupCache(): void {
  cache = null;
  secFallbackCache = null;
}
