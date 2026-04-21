/**
 * Side-by-side projected-P&L comparison across the four mutually
 * exclusive ways to deploy capital around one stock × one expiration.
 * See docs/specs/trade-comparison.md.
 */

export type ProjectedEndCase = "median" | "p25" | "flat";

export type TradeKey =
  | "buyOutright"
  | "buyWrite"
  | "coveredCall"
  | "cashSecuredPut"
  | "holdCashSpaxx";

export type TradeLeg = {
  /** Per-share capital committed (call: P − bid; put: K; outright/cash: P). */
  initialCapital: number;
  stockPnl: number;
  dividendPnl: number;
  premiumPnl: number;
  spaxxPnl: number;
  /** Sum of the four P&L components. */
  totalPnl: number;
  /** totalPnl / initialCapital. */
  roi: number;
  /** roi × 365/T — the apples-to-apples comparator. */
  roiAnnualized: number;
  /** Option legs only: did the projection put the contract ITM at expiry? */
  assigned?: boolean;
  /** Option legs only: the strike used. */
  strike?: number;
  /** Option legs only: the bid used. */
  bid?: number;
};

export type TradeComparison = {
  symbol: string;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  projectedEndPrice: number;
  projectedEndCase: ProjectedEndCase;
  spaxxRate: number;
  trades: {
    buyOutright: TradeLeg;
    /** Buy + sell call simultaneously. Premium discounts the purchase
     * (capital = P − bid); no SPAXX on premium. The opening trade for
     * a user who doesn't yet own the stock. */
    buyWrite: TradeLeg | null;
    /** Sell a call against an already-held position. No new purchase;
     * capital = P (opportunity cost of the held share). Premium is
     * fresh cash that sits in SPAXX for the holding period. */
    coveredCall: TradeLeg | null;
    cashSecuredPut: TradeLeg | null;
    holdCashSpaxx: TradeLeg;
  };
};
