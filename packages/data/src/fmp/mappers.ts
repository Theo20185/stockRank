import type {
  AnnualPeriod,
  CompanySnapshot,
  TtmMetrics,
} from "@stockrank/core";
import { pctOffHigh } from "@stockrank/core";
import type {
  FmpBalanceSheet,
  FmpCashFlow,
  FmpIncomeStatement,
  FmpKeyMetricsAnnual,
  FmpKeyMetricsTtm,
  FmpProfile,
  FmpRatiosAnnual,
  FmpRatiosTtm,
} from "./types.js";
import type { Quote } from "./client.js";

function n(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (Number.isNaN(value) || !Number.isFinite(value)) return null;
  return value;
}

export function mapTtm(
  ratios: FmpRatiosTtm,
  keyMetrics: FmpKeyMetricsTtm,
): TtmMetrics {
  return {
    peRatio: n(ratios.priceToEarningsRatioTTM),
    evToEbitda: n(keyMetrics.evToEBITDATTM ?? null),
    priceToFcf: n(ratios.priceToFreeCashFlowRatioTTM),
    priceToBook: n(ratios.priceToBookRatioTTM),
    dividendYield: n(ratios.dividendYieldTTM),
    currentRatio:
      n(ratios.currentRatioTTM) ?? n(keyMetrics.currentRatioTTM ?? null),
    netDebtToEbitda: n(keyMetrics.netDebtToEBITDATTM ?? null),
    roic: n(keyMetrics.returnOnInvestedCapitalTTM ?? null),
    earningsYield: n(keyMetrics.earningsYieldTTM ?? null),
    fcfYield: n(keyMetrics.freeCashFlowYieldTTM ?? null),
    enterpriseValue: n(keyMetrics.enterpriseValueTTM ?? null),
    investedCapital: n(keyMetrics.investedCapitalTTM ?? null),
    forwardEps: null, // FMP free tier doesn't expose analyst-consensus forward EPS
  };
}

type AnnualInputs = {
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlow[];
  ratios: FmpRatiosAnnual[];
  keyMetrics: FmpKeyMetricsAnnual[];
};

function indexByFiscalYear<T extends { fiscalYear: string }>(
  items: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.fiscalYear, item);
  return map;
}

export function mapAnnualPeriods(inputs: AnnualInputs): AnnualPeriod[] {
  const balanceByYear = indexByFiscalYear(inputs.balance);
  const cashFlowByYear = indexByFiscalYear(inputs.cashFlow);
  const ratiosByYear = indexByFiscalYear(inputs.ratios);
  const keyMetricsByYear = indexByFiscalYear(inputs.keyMetrics);

  return inputs.income.map((income) => {
    const balance = balanceByYear.get(income.fiscalYear);
    const cashFlow = cashFlowByYear.get(income.fiscalYear);
    const ratios = ratiosByYear.get(income.fiscalYear);
    const keyMetrics = keyMetricsByYear.get(income.fiscalYear);
    const dividendsRaw =
      cashFlow?.commonDividendsPaid ?? cashFlow?.netDividendsPaid ?? null;

    return {
      fiscalYear: income.fiscalYear,
      periodEndDate: income.date,
      filingDate: income.filingDate ?? null,
      reportedCurrency: income.reportedCurrency,
      // FMP mapper doesn't have access to historical price data; the
      // production pipeline uses the Yahoo provider which populates
      // this. FMP-sourced rows just leave it null and the FV engine
      // falls back to the legacy placeholder behavior for those.
      priceAtYearEnd: null,
      priceHighInYear: null,
      priceLowInYear: null,
      income: {
        revenue: n(income.revenue),
        grossProfit: n(income.grossProfit),
        operatingIncome: n(income.operatingIncome),
        ebit: n(income.ebit),
        ebitda: n(income.ebitda),
        interestExpense: n(income.interestExpense),
        netIncome: n(income.netIncome),
        epsDiluted: n(income.epsDiluted),
        sharesDiluted: n(income.weightedAverageShsOutDil),
      },
      balance: {
        cash: n(balance?.cashAndShortTermInvestments ?? null),
        totalCurrentAssets: n(balance?.totalCurrentAssets ?? null),
        totalCurrentLiabilities: n(balance?.totalCurrentLiabilities ?? null),
        totalDebt: n(balance?.totalDebt ?? null),
        totalEquity: n(balance?.totalStockholdersEquity ?? null),
      },
      cashFlow: {
        operatingCashFlow: n(
          cashFlow?.netCashProvidedByOperatingActivities ?? null,
        ),
        capex: n(cashFlow?.capitalExpenditure ?? null),
        freeCashFlow: n(cashFlow?.freeCashFlow ?? null),
        // FMP reports outflows as negative; flip sign so the snapshot uses
        // positive amounts for "cash returned to shareholders".
        dividendsPaid:
          dividendsRaw !== null ? Math.abs(n(dividendsRaw) ?? 0) : null,
        buybacks:
          cashFlow?.commonStockRepurchased !== null &&
          cashFlow?.commonStockRepurchased !== undefined
            ? Math.abs(cashFlow.commonStockRepurchased)
            : null,
      },
      ratios: {
        roic: n(keyMetrics?.returnOnInvestedCapital ?? null),
        netDebtToEbitda:
          n(keyMetrics?.netDebtToEBITDA ?? null) ??
          n(ratios?.netDebtToEBITDA ?? null),
        currentRatio:
          n(ratios?.currentRatio ?? null) ??
          n(keyMetrics?.currentRatio ?? null),
      },
    };
  });
}

export type CompanyBundle = {
  profile: FmpProfile;
  quote: Quote;
  ratiosTtm: FmpRatiosTtm;
  keyMetricsTtm: FmpKeyMetricsTtm;
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlow[];
  ratios: FmpRatiosAnnual[];
  keyMetrics: FmpKeyMetricsAnnual[];
  averageVolume: number;
};

export function buildCompanySnapshot(bundle: CompanyBundle): CompanySnapshot {
  const ttm = mapTtm(bundle.ratiosTtm, bundle.keyMetricsTtm);
  const annual = mapAnnualPeriods({
    income: bundle.income,
    balance: bundle.balance,
    cashFlow: bundle.cashFlow,
    ratios: bundle.ratios,
    keyMetrics: bundle.keyMetrics,
  });

  return {
    symbol: bundle.profile.symbol,
    name: bundle.profile.companyName,
    sector: bundle.profile.sector ?? bundle.profile.industry,
    industry: bundle.profile.industry,
    exchange: bundle.profile.exchange,
    marketCap: bundle.profile.marketCap,
    currency: bundle.profile.currency ?? "USD",
    quoteCurrency: bundle.profile.currency ?? "USD",
    quote: {
      price: bundle.quote.price,
      yearHigh: bundle.quote.yearHigh,
      yearLow: bundle.quote.yearLow,
      volume: 0,
      averageVolume: bundle.averageVolume,
    },
    ttm,
    annual,
    pctOffYearHigh: pctOffHigh(bundle.quote.price, bundle.quote.yearHigh),
  };
}
