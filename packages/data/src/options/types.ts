/**
 * Options-chain provider interface. The concrete shapes (`ContractQuote`,
 * `ExpirationGroup`) live in @stockrank/core so the ranking package can
 * import them without depending on @stockrank/data. See
 * docs/specs/options.md §5–§6.
 *
 * Two-step interface: callers first discover what expirations exist,
 * then fetch contract groups for the ones they want. Mirrors Yahoo's
 * own pattern (one call returns the date list, subsequent calls each
 * return one expiration's contracts) and lets the orchestrator narrow
 * the list before paying for the heavy fetches.
 */

import type { ExpirationGroup } from "@stockrank/core";

export type { ContractQuote, ExpirationGroup } from "@stockrank/core";

export type ExpirationList = {
  symbol: string;
  /** ISO timestamp of the discovery call. */
  fetchedAt: string;
  /** Spot price at fetch time. */
  underlyingPrice: number;
  /** All expirations the provider reports, ascending YYYY-MM-DD. */
  expirationDates: string[];
};

export interface OptionsProvider {
  readonly name: string;
  /** Discover available expirations + spot price for the underlying. */
  listExpirations(symbol: string): Promise<ExpirationList>;
  /** Fetch one expiration's full call+put grid. */
  fetchExpirationGroup(
    symbol: string,
    expirationDate: string,
  ): Promise<ExpirationGroup>;
}
