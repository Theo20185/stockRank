import type { FvTrendArtifact } from "@stockrank/core";

/**
 * Loads the per-snapshot FV-trend artifact produced by
 * `npm run fv-trend`. The web layer reads this to mark each ranked
 * row's fvTrend so the bucket classifier can demote declining names
 * to Watch.
 *
 * Returns null on any failure (missing file, malformed JSON, network
 * error). Treat null as "trend signal not available yet" — every
 * row's fvTrend stays at the default "insufficient_data" and no rows
 * get demoted by this signal.
 */

const URL = `${import.meta.env.BASE_URL}data/fv-trend.json`;

export async function loadFvTrend(
  fetchImpl: typeof fetch = fetch,
): Promise<FvTrendArtifact | null> {
  try {
    const response = await fetchImpl(URL);
    if (!response.ok) return null;
    return (await response.json()) as FvTrendArtifact;
  } catch {
    return null;
  }
}
