import type { ContractQuote } from "@stockrank/core";

/**
 * Computation outputs for the options module per docs/specs/options.md
 * §5. The contract-shape (`ContractQuote`, `ExpirationGroup`) is
 * imported from @stockrank/core; what's defined here is the per-stock
 * view the UI consumes.
 */

export type CoveredCallLabel = "conservative" | "aggressive" | "stretch";
export type CoveredCallAnchor = "p25" | "median" | "p75";

export type CoveredCall = {
  label: CoveredCallLabel;
  anchor: CoveredCallAnchor;
  /** The fair-value anchor price the strike was snapped from. */
  anchorPrice: number;
  contract: ContractQuote;
  /** True when snapped strike differs from anchor by > 5%. */
  snapWarning: boolean;
  /** True when contract has < 30 days to expiry. */
  shortDated: boolean;
  /** Premium-only return as a fraction of current price (not assigned). */
  staticReturnPct: number;
  staticAnnualizedPct: number;
  /** Premium + dividends + (K - P) as a fraction of current price (assigned). */
  assignedReturnPct: number;
  assignedAnnualizedPct: number;
  /** Current price minus premium per docs/specs/options.md §4.3. */
  effectiveCostBasis: number;
  /** Premium as a fraction of current price. */
  effectiveDiscountPct: number;
};

export type CashSecuredPutLabel = "stretch" | "aggressive" | "deep-value";
export type CashSecuredPutAnchor = "p75" | "median" | "p25";

export type CashSecuredPut = {
  label: CashSecuredPutLabel;
  anchor: CashSecuredPutAnchor;
  anchorPrice: number;
  contract: ContractQuote;
  snapWarning: boolean;
  shortDated: boolean;
  /** Premium / strike collateral if the put expires worthless. */
  notAssignedReturnPct: number;
  notAssignedAnnualizedPct: number;
  /** Strike minus premium per docs/specs/options.md §4.2. */
  effectiveCostBasis: number;
  /** Discount of effectiveCostBasis vs current price. */
  effectiveDiscountPct: number;
  inTheMoney: boolean;
};

export type ExpirationView = {
  expiration: string;        // YYYY-MM-DD
  selectionReason: "leap" | "leap-fallback" | "quarterly" | "monthly";
  /** Up to 3 entries; fewer when anchor floors filter strikes out. */
  coveredCalls: CoveredCall[];
  /** Up to 3 entries; fewer when floors filter strikes out. */
  puts: CashSecuredPut[];
  /**
   * Set when puts are suppressed entirely. "above-conservative-tail"
   * fires when the stock is at or above its fair-value p25 — the
   * single-anchor put workflow is anchored to p25, and selling a put
   * above it isn't a value entry. (In practice the ingest only runs
   * options for stocks in the Ranked bucket, which already requires
   * current < p25, so this case is rare; kept for safety.)
   */
  putsSuppressedReason?: "above-conservative-tail";
};

export type OptionsView = {
  symbol: string;
  /** ISO timestamp the chain was fetched. */
  fetchedAt: string;
  /** Underlying spot price used for all return math. */
  currentPrice: number;
  expirations: ExpirationView[];
};
