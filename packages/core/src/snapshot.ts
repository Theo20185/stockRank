export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type SnapshotSource = "fmp-stable" | "yahoo-finance";

export type Snapshot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshotDate: string;
  generatedAt: string;
  source: SnapshotSource;
  universeName: "sp500";
  companies: CompanySnapshot[];
  errors: SnapshotError[];
  /**
   * Pre-baked default-weights ranking. The web UI uses this on first load
   * before the user touches the weight sliders; once the user changes
   * weights, ranking re-runs in the browser against the same `companies`.
   *
   * Embedded as `unknown` here so @stockrank/core doesn't depend on the
   * ranking package; ingest stamps it in with the actual `RankedSnapshot`
   * type from @stockrank/ranking.
   */
  ranking?: unknown;
};

export type CompanySnapshot = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  marketCap: number;

  /**
   * ISO 4217 reporting currency (e.g., "USD", "DKK"). For US-domiciled
   * issuers this matches `quoteCurrency`; for foreign ADRs they may differ
   * (e.g., NVO reports in DKK but trades in USD). Downstream code that
   * mixes price-derived and statement-derived figures must check both.
   */
  currency: string;
  /** Currency the listing is priced in. */
  quoteCurrency: string;

  quote: QuoteSnapshot;
  ttm: TtmMetrics;
  annual: AnnualPeriod[];

  pctOffYearHigh: number;
};

export type QuoteSnapshot = {
  price: number;
  yearHigh: number;
  yearLow: number;
  volume: number;
  averageVolume: number;
};

export type TtmMetrics = {
  peRatio: number | null;
  evToEbitda: number | null;
  priceToFcf: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  currentRatio: number | null;
  netDebtToEbitda: number | null;
  roic: number | null;
  earningsYield: number | null;
  fcfYield: number | null;
  enterpriseValue: number | null;
  investedCapital: number | null;
  /**
   * Analyst-consensus next-year EPS. Used by the fair-value engine to
   * cross-check whether a TTM EPS spike is sustainable (forward agrees)
   * or a one-time gain (forward falls back). Null when the provider
   * doesn't expose it (e.g., FMP free tier) or there's no coverage.
   */
  forwardEps: number | null;
};

export type AnnualPeriod = {
  fiscalYear: string;
  periodEndDate: string;
  filingDate: string | null;
  reportedCurrency: string;

  income: AnnualIncome;
  balance: AnnualBalance;
  cashFlow: AnnualCashFlow;
  ratios: AnnualRatios;
};

export type AnnualIncome = {
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebit: number | null;
  ebitda: number | null;
  interestExpense: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  sharesDiluted: number | null;
};

export type AnnualBalance = {
  cash: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
};

export type AnnualCashFlow = {
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  buybacks: number | null;
};

export type AnnualRatios = {
  roic: number | null;
  netDebtToEbitda: number | null;
  currentRatio: number | null;
};

export type SnapshotError = {
  symbol: string;
  endpoint: string;
  message: string;
};

export function pctOffHigh(price: number, yearHigh: number): number {
  if (yearHigh <= 0) return 0;
  if (price >= yearHigh) return 0;
  return ((yearHigh - price) / yearHigh) * 100;
}
