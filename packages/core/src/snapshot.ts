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
  /** Quarterly fundamentals (8-12 quarters of trailing data). Drives
   * the back-test's TTM reconstruction — sum of trailing 4 quarters
   * approximates Yahoo's rolling-quarterly TTM at any historical
   * date. Optional for backwards-compat with older snapshots; absent
   * means the back-test falls back to annual-as-TTM-proxy. */
  quarterly?: QuarterlyPeriod[];

  pctOffYearHigh: number;
  /** Percentage the current price sits ABOVE the trailing-52w low.
   * Companion to pctOffYearHigh; together they bracket the year's
   * range on the stock-detail page ("X% off the high · Y% above
   * the low"). Computed from quote.price + quote.yearLow. */
  pctAboveYearLow: number;

  /**
   * Trailing month-end closing prices, sorted oldest → newest. ~13
   * months when fully populated. Drives the §5 Momentum factor in
   * `ranking.md`: 12-1 momentum = monthlyCloses[N-1].close /
   * monthlyCloses[N-13].close − 1, skipping the most recent month
   * to avoid the short-horizon reversal effect.
   *
   * Optional for backwards-compat: snapshots from before this field
   * was added still load. The Momentum factor falls back to a
   * quarterly-price approximation in that case (see ranking.md §5
   * Momentum), with `momentumApprox: true` flagged on the factor
   * detail.
   */
  monthlyCloses?: MonthlyClose[];
};

export type MonthlyClose = {
  /** ISO YYYY-MM-DD date of the month-end bar. */
  date: string;
  /** Close price on that date, in `quoteCurrency`. */
  close: number;
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

  /**
   * Closing price on (or just before) `periodEndDate`. Drives the
   * own-historical fair-value anchors — without it, those anchors
   * collapse to the current price by mathematical construction
   * (TTM_PE × current_EPS = current_price). Null on older snapshots
   * that predate this field; the FV engine falls back to the legacy
   * placeholder behavior in that case.
   */
  priceAtYearEnd: number | null;
  /**
   * Highest intraday close observed during the fiscal year (max of
   * the monthly chart bars' `high` field within
   * [periodEndDate − 365d, periodEndDate]). Capturing the FY range —
   * not just the year-end snapshot — keeps the own-historical anchors
   * from systematically underestimating peak valuations (BBY hit ~$140
   * in Nov 2021 but closed FY22 at $99; year-end-only sampling missed
   * the peak entirely). Null on older snapshots; the FV engine
   * silently degrades to year-end-only when missing.
   */
  priceHighInYear: number | null;
  /** Lowest intraday close in the fiscal year (analogue of priceHighInYear). */
  priceLowInYear: number | null;

  income: AnnualIncome;
  balance: AnnualBalance;
  cashFlow: AnnualCashFlow;
  ratios: AnnualRatios;
};

/**
 * Quarterly fiscal-period record. Same shape as AnnualPeriod but at
 * quarterly cadence. Drives the back-test's TTM reconstruction:
 * trailing-12-month income / cash-flow values are computed by summing
 * the four most recent quarters as of any given historical date —
 * matches what Yahoo's TTM fields provide for the live snapshot.
 *
 * Optional on CompanySnapshot for backwards-compat: snapshots from
 * before this field was added still load; the engine falls back to
 * the annual-as-TTM-proxy when quarterly is empty.
 */
export type QuarterlyPeriod = {
  /** "2026Q1" style label (calendar quarter of period-end date). */
  fiscalQuarter: string;
  periodEndDate: string;
  filingDate: string | null;
  reportedCurrency: string;
  priceAtQuarterEnd: number | null;
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

/** Percentage the current price sits ABOVE the trailing-52w low.
 * Mirror of `pctOffHigh`. Clamps to 0 when price ≤ low or low is
 * non-positive — the UI uses this as a "how far has it bounced off
 * the bottom" indicator alongside the drawdown number. */
export function pctAboveLow(price: number, yearLow: number): number {
  if (yearLow <= 0) return 0;
  if (price <= yearLow) return 0;
  return ((price - yearLow) / yearLow) * 100;
}
