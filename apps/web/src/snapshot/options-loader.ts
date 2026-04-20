import type { OptionsView } from "@stockrank/ranking";

/**
 * On-demand options loader for the stock-detail screen. Fetches a
 * per-symbol JSON file produced by `npm run options:fetch SYMBOL`.
 *
 * Per docs/specs/options.md §6:
 *  - 30-minute in-memory cache per symbol so re-opening the panel
 *    doesn't re-fetch.
 *  - 404 (no file produced for this symbol yet) returns null, not
 *    an error — the panel renders a "not yet fetched" state.
 */

export type OptionsLoadResult =
  | { status: "loaded"; view: OptionsView }
  | { status: "not-fetched" };

const CACHE_TTL_MS = 30 * 60 * 1000;
type CacheEntry = { view: OptionsView; at: number };
const cache = new Map<string, CacheEntry>();

function optionsUrlFor(symbol: string): string {
  return `${import.meta.env.BASE_URL}data/options/${encodeURIComponent(symbol)}.json`;
}

export async function loadOptionsView(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<OptionsLoadResult> {
  const cached = cache.get(symbol);
  if (cached && now() - cached.at < CACHE_TTL_MS) {
    return { status: "loaded", view: cached.view };
  }

  const url = optionsUrlFor(symbol);
  const response = await fetchImpl(url);
  if (response.status === 404) {
    return { status: "not-fetched" };
  }
  if (!response.ok) {
    throw new Error(`Failed to load options: HTTP ${response.status} from ${url}`);
  }
  const view = (await response.json()) as OptionsView;
  cache.set(symbol, { view, at: now() });
  return { status: "loaded", view };
}

/** Test-only: wipe the in-memory cache. */
export function _resetOptionsCache(): void {
  cache.clear();
}
