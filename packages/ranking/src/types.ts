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
  rows: RankedRow[];
  turnaroundWatchlist: TurnaroundRow[];
};

export type RankInput = {
  companies: CompanySnapshot[];
  weights?: Partial<CategoryWeights>;
  snapshotDate: string;
};
