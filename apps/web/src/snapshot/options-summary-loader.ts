import type { OptionsSummary } from "@stockrank/core";

/**
 * Loads the per-snapshot summary of best annualized covered-call and
 * cash-secured-put returns produced by the ingest pipeline. The web
 * RankedTable reads this to populate the Best Call / Best Put columns
 * without having to fetch every per-symbol options JSON up front.
 *
 * Returns null on any failure (missing file, malformed JSON, network
 * error). Treat null as "options data not available yet" — those
 * columns just render "—" for every row, no error surfaced.
 */

const SUMMARY_URL = `${import.meta.env.BASE_URL}data/options-summary.json`;

export async function loadOptionsSummary(
  fetchImpl: typeof fetch = fetch,
): Promise<OptionsSummary | null> {
  try {
    const response = await fetchImpl(SUMMARY_URL);
    if (!response.ok) return null;
    return (await response.json()) as OptionsSummary;
  } catch {
    return null;
  }
}
