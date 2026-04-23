import type { AnnualPeriod, QuarterlyPeriod } from "@stockrank/core";
import { fetchCompanyFacts, type FetcherOptions } from "./fetcher.js";
import { mapAnnualPeriods, mapQuarterlyPeriods } from "./mapper.js";

/**
 * Public entry point. Fetches EDGAR companyfacts (cached) and returns
 * both annual and quarterly period arrays in our snapshot schema.
 *
 * Newest-first ordering matches the rest of the snapshot (annual[0]
 * is always the most recent fiscal year).
 */
export async function getEdgarFundamentals(
  symbol: string,
  opts: FetcherOptions = {},
): Promise<{
  annual: AnnualPeriod[];
  quarterly: QuarterlyPeriod[];
}> {
  const facts = await fetchCompanyFacts(symbol, opts);
  const annual = mapAnnualPeriods(facts);
  const quarterly = mapQuarterlyPeriods(facts);
  return { annual, quarterly };
}

export {
  fetchCompanyFacts,
  cacheAgeHours,
  EdgarFetchError,
  EdgarNotFoundError,
  type FetcherOptions,
} from "./fetcher.js";
export {
  mapAnnualPeriods,
  mapQuarterlyPeriods,
  decorateAnnualPeriodsWithPrices,
  decorateQuarterlyPeriodsWithPrices,
  withAnnualRatios,
  withQuarterlyRatios,
  type HistoricalBar,
} from "./mapper.js";
export { cikFor, formatCik } from "./cik-lookup.js";
