/**
 * Side-by-side projected-P&L comparison across the four mutually
 * exclusive ways to deploy capital around one stock × one expiration.
 * See docs/specs/trade-comparison.md.
 */

export type ProjectedEndCase = "median" | "p25" | "flat";

export type TradeKey =
  | "buyOutright"
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
    coveredCall: TradeLeg | null;
    cashSecuredPut: TradeLeg | null;
    holdCashSpaxx: TradeLeg;
  };
};
