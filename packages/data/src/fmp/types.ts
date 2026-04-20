// Raw FMP /stable/ DTOs. Only the fields we read are typed; the API
// returns more, and we deliberately accept (and ignore) unknown fields
// so a future FMP addition doesn't break parsing.

export type FmpProfile = {
  symbol: string;
  companyName: string;
  industry: string;
  sector?: string;
  marketCap: number;
  exchange: string;
  exchangeFullName?: string;
  currency: string;
  beta?: number;
  lastDividend?: number;
};

export type FmpQuote = {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  yearHigh: number;
  yearLow: number;
  exchange: string;
  volume: number;
  averageVolume?: number | null;
};

export type FmpRatiosTtm = {
  symbol: string;
  priceToEarningsRatioTTM?: number | null;
  priceToFreeCashFlowRatioTTM?: number | null;
  priceToBookRatioTTM?: number | null;
  dividendYieldTTM?: number | null;
  currentRatioTTM?: number | null;
};

export type FmpKeyMetricsTtm = {
  symbol: string;
  marketCap?: number | null;
  enterpriseValueTTM?: number | null;
  evToEBITDATTM?: number | null;
  netDebtToEBITDATTM?: number | null;
  currentRatioTTM?: number | null;
  returnOnInvestedCapitalTTM?: number | null;
  earningsYieldTTM?: number | null;
  freeCashFlowYieldTTM?: number | null;
  investedCapitalTTM?: number | null;
};

export type FmpIncomeStatement = {
  date: string;
  symbol: string;
  reportedCurrency: string;
  filingDate?: string | null;
  fiscalYear: string;
  period: string;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  ebit?: number | null;
  ebitda?: number | null;
  interestExpense?: number | null;
  netIncome?: number | null;
  epsDiluted?: number | null;
  weightedAverageShsOutDil?: number | null;
};

export type FmpBalanceSheet = {
  date: string;
  symbol: string;
  reportedCurrency: string;
  fiscalYear: string;
  period: string;
  cashAndShortTermInvestments?: number | null;
  totalCurrentAssets?: number | null;
  totalCurrentLiabilities?: number | null;
  totalDebt?: number | null;
  totalStockholdersEquity?: number | null;
  netDebt?: number | null;
};

export type FmpCashFlow = {
  date: string;
  symbol: string;
  reportedCurrency: string;
  fiscalYear: string;
  period: string;
  netCashProvidedByOperatingActivities?: number | null;
  capitalExpenditure?: number | null;
  freeCashFlow?: number | null;
  commonDividendsPaid?: number | null;
  netDividendsPaid?: number | null;
  commonStockRepurchased?: number | null;
};

export type FmpRatiosAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  period: string;
  currentRatio?: number | null;
  netDebtToEBITDA?: number | null;
};

export type FmpKeyMetricsAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  period: string;
  returnOnInvestedCapital?: number | null;
  netDebtToEBITDA?: number | null;
  currentRatio?: number | null;
};

export type FmpHistoricalPriceBar = {
  symbol: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
