import type { FvTrendArtifact } from "@stockrank/core";
import type { RankedRow } from "@stockrank/ranking";

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

/**
 * Override each row's rank()-time `fvTrend` stub with the artifact's
 * trend. Rows absent from the artifact (or a null artifact — load
 * failure / pre-trend snapshots) keep "insufficient_data".
 *
 * Mutates the rows in place — callers pass freshly ranked rows
 * (App.tsx recomputes them per weights change inside its useMemo),
 * mirroring the optionsLiquid override beside it. Since the H10
 * removal the trend is informational only: it renders in the
 * drill-down panel and the rationale weaknesses, never in bucketing.
 */
export function applyFvTrend(
  rows: RankedRow[],
  artifact: FvTrendArtifact | null,
): void {
  if (!artifact) return;
  for (const row of rows) {
    const entry = artifact.symbols[row.symbol];
    if (entry) row.fvTrend = entry.trend;
  }
}
