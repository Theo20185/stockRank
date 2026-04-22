import type { CompanySnapshot } from "@stockrank/core";

export type CategoryKey =
  | "valuation"
  | "health"
  | "quality"
  | "shareholderReturn"
  | "growth";

export type FactorKey =
  // Valuation (lower = better, inverted)
  | "evToEbitda"
  | "priceToFcf"
  | "peRatio"
  | "priceToBook"
  // Health
  | "debtToEbitda"
  | "currentRatio"
  | "interestCoverage"
  // Quality
  | "roic"
  // Shareholder Return
  | "dividendYield"
  | "buybackYield"
  | "dividendGrowth5Y"
  // Growth
  | "revenueGrowth7Y"
  | "epsGrowth7Y";

export type CategoryWeights = Record<CategoryKey, number>;

export type FactorContribution = {
  key: FactorKey;
  category: CategoryKey;
  rawValue: number | null;
  percentile: number | null; // 0–100 within cohort
};

export type CategoryScores = Record<CategoryKey, number | null>;

export type RankedRow = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  price: number;

  composite: number;
  industryRank: number;
  universeRank: number;
  pctOffYearHigh: number;

  categoryScores: CategoryScores;
  factorDetails: FactorContribution[];
  missingFactors: FactorKey[];

  fairValue: import("./fair-value/types.js").FairValue | null;

  /**
   * True when the company's most recent annual shareholders' equity is
   * negative — typically the result of sustained buybacks exceeding
   * cumulative retained earnings (BKNG, MCD, SBUX, MO, KMB). Important
   * because ROIC and P/B both go null or nonsensical in that case, but
   * the company is otherwise healthy: the missing signals are
   * structural, not a data-coverage gap. UI uses this to label the row
   * distinctly from genuine data gaps.
   */
  negativeEquity: boolean;

  /**
   * True when the stock has at least one usable OTM call AND one usable
   * OTM put after the orchestrator's filters. Set to true by `rank()`
   * (which has no options visibility); the web layer overrides it to
   * false based on the loaded options-summary file. Bucket downgrade
   * rule: an illiquid options chain is itself a quality signal — names
   * without an active options market drop out of Ranked into Watch.
   */
  optionsLiquid: boolean;

  /**
   * Annual dividend per share (= ttm.dividendYield × price). Used by
   * the trade-comparison module to compute dividend P&L on stock-
   * holding legs. Pre-computed here so consumers don't need to thread
   * the source CompanySnapshot through.
   */
  annualDividend: number;

  /**
   * Trend in fair-value-median over the most recent ~2-year window.
   * Set by the web layer from the loaded fv-trend.json artifact (the
   * ranking pipeline itself has no historical-FV data). When
   * "declining", the bucket classifier demotes the row to Watch — a
   * "deteriorating fundamentals" signal. Defaults to "insufficient_data"
   * when no trend information has been attached. See fv-trend.ts in
   * @stockrank/core for the artifact shape.
   */
  fvTrend: import("@stockrank/core").FvTrend;
};

export type TurnaroundReason =
  | "longTermQuality"
  | "ttmTrough"
  | "deepDrawdown";

export type TurnaroundRow = {
  symbol: string;
  name: string;
  industry: string;
  marketCap: number;
  price: number;
  pctOffYearHigh: number;
  reasons: TurnaroundReason[];
  longTermAvgRoic: number | null;
  ttmEpsRelativeTo5YAvg: number | null;
  fairValue: import("./fair-value/types.js").FairValue | null;
};

export type RankedSnapshot = {
  snapshotDate: string;
  weights: CategoryWeights;
  universeSize: number;
  excludedCount: number;
  /** Companies that passed the quality floor — fully scored. */
  rows: RankedRow[];
  /**
   * Companies that FAILED the quality floor — surfaced here as stub
   * RankedRows (categoryScores all null, factorDetails empty,
   * composite/rank zero) so the bucket classifier can place them in
   * Excluded alongside other diagnostic-only rows. Keeps every name in
   * the universe visible in exactly one bucket.
   */
  ineligibleRows: RankedRow[];
  turnaroundWatchlist: TurnaroundRow[];
};

export type RankInput = {
  companies: CompanySnapshot[];
  weights?: Partial<CategoryWeights>;
  snapshotDate: string;
};
