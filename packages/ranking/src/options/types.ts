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

/**
 * 2026-05-26: the "weekly" slot was removed — only monthly + yearly
 * are emitted now. Legacy committed options JSONs may still contain
 * `selectionReason: "weekly"` from the prior selector; the UI label
 * helper in apps/web/src/lib/format.ts relabels those as Monthly
 * until the next refresh overwrites them.
 */
export type SelectionReason = "monthly" | "yearly";

/**
 * Forward projection of FV anchors + price at the expiration date,
 * computed at refresh time from the trailing 2 years of quarterly FV
 * samples (see `FvTrendSample`). Used (a) to re-anchor strike picks
 * to expectations-at-expiry instead of today, and (b) to surface
 * "projected FV at expiry" / "projected price at expiry" on the UI.
 *
 * Null when the symbol has fewer than 4 valid quarterly samples for
 * one or more of the required fields.
 */
export type ExpirationProjection = {
  /** Days from today to the expiration. */
  daysAhead: number;
  /** Projected FV anchors at expiration. Capped at ±50% of today's
   *  observed value per `projection.ts`. */
  fvP25: number;
  fvMedian: number;
  fvP75: number;
  /** Projected underlying spot at expiration. */
  price: number;
  /** Slope of fvMedian, in % per year of the last observed value. */
  fvSlopePctPerYear: number;
  /** Slope of price, same units. */
  priceSlopePctPerYear: number;
  /** R² of the regression that produced fvMedian (proxy for the FV
   *  confidence — fvP25 / fvP75 share the cohort, so a single R²
   *  represents the FV side). */
  fvRSquared: number;
  /** R² of the regression that produced the price projection. */
  priceRSquared: number;
  /** Bucketed (high|medium|weak) version of fvRSquared. */
  fvConfidence: "high" | "medium" | "weak";
  priceConfidence: "high" | "medium" | "weak";
  /** True when the FV projection was clipped to ±50% of last value. */
  fvCapped: boolean;
  priceCapped: boolean;
  /**
   * True when the chosen regression used a non-default window because
   * the default 8q (2y) fit had R²<0.8. The UI surfaces a "fallback"
   * chip in that case so the user knows the projection was tuned to
   * either a longer history (outlier-dampened) or shorter (recent
   * regime focus).
   */
  fvFallback: boolean;
  priceFallback: boolean;
  /** Quarterly window sizes that produced the FV / price fits. 8 = default. */
  fvWindowSize: number;
  priceWindowSize: number;
};

export type ExpirationView = {
  expiration: string;        // YYYY-MM-DD
  selectionReason: SelectionReason;
  /** At most 1 entry — the single engine-picked covered call. Empty
   *  when no listed strike clears the §3.2 filters. */
  coveredCalls: CoveredCall[];
  /** At most 1 entry — the single engine-picked cash-secured put.
   *  Empty when no listed strike clears the §3.3 filters. */
  puts: CashSecuredPut[];
  /**
   * Full strike chain at this expiration (un-filtered). Powers the
   * portfolio screen's bid/ask lookup for held contracts whose strike
   * doesn't match the engine's picked one. Mirror of the provider's
   * raw response — call/put arrays of ContractQuote.
   */
  chain: {
    calls: ContractQuote[];
    puts: ContractQuote[];
  };
  /**
   * Forward-projection of FV / price at the expiration date. Null
   * when projection couldn't be computed (insufficient samples).
   */
  projection: ExpirationProjection | null;
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
