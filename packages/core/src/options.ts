/**
 * Options-chain contract shapes shared across packages. Pure types —
 * no runtime. The OptionsProvider interface and Yahoo implementation
 * live in @stockrank/data; computation (covered-call/put returns,
 * strike snapping) lives in @stockrank/ranking. Both sides import the
 * contract shape from here to avoid a cyclic dep.
 *
 * See docs/specs/options.md for semantics.
 */

export type ContractQuote = {
  /** Yahoo OCC-style symbol, e.g. "DECK270115C00120000". */
  contractSymbol: string;
  /** ISO date (YYYY-MM-DD) of expiration. */
  expiration: string;
  /** Days from chain fetch time to expiration (calendar days, UTC). */
  daysToExpiry: number;
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  volume: number;
  openInterest: number;
  /** Decimal IV, e.g. 0.42 for 42%. */
  impliedVolatility: number | null;
  inTheMoney: boolean;
};

export type ExpirationGroup = {
  /** ISO date (YYYY-MM-DD). */
  expiration: string;
  calls: ContractQuote[];
  puts: ContractQuote[];
};
