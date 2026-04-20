import type { CompanySnapshot, SnapshotError } from "@stockrank/core";

export type FetchOptions = {
  /** ISO YYYY-MM-DD start of historical price window. */
  priceFrom: string;
  /** ISO YYYY-MM-DD end of historical price window. */
  priceTo: string;
};

export type ErrorReporter = (error: SnapshotError) => void;

/**
 * Provider-agnostic market-data interface. The orchestrator depends on
 * this; concrete providers (FMP, Yahoo) implement it.
 *
 * Returning `null` means the company couldn't be loaded at all (essential
 * data missing) — the orchestrator should skip the symbol. Per-endpoint
 * partial failures should call `reportError` with detail and return as
 * complete a CompanySnapshot as possible.
 */
export interface MarketDataProvider {
  readonly name: string;
  fetchCompany(
    symbol: string,
    options: FetchOptions,
    reportError: ErrorReporter,
  ): Promise<CompanySnapshot | null>;
}
