import YahooFinance from "yahoo-finance2";
import type {
  AnnualBalance,
  AnnualCashFlow,
  AnnualIncome,
  AnnualPeriod,
  AnnualRatios,
  CompanySnapshot,
  QuarterlyPeriod,
  TtmMetrics,
} from "@stockrank/core";
import { pctOffHigh } from "@stockrank/core";
import type { ErrorReporter, FetchOptions, MarketDataProvider } from "../provider.js";
import { inferReportingCurrency } from "./currency.js";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** Cache FX rates for the lifetime of an ingest run — avoids re-fetching the
 * same DKK→USD rate for every Danish issuer. Keyed `${from}${to}=X`. */
const fxCache = new Map<string, number>();

async function getFxRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const key = `${from}${to}=X`;
  const cached = fxCache.get(key);
  if (cached !== undefined) return cached;
  const fx = await yahooFinance.quote(key);
  const rate = (fx as { regularMarketPrice?: number }).regularMarketPrice;
  if (typeof rate !== "number" || rate <= 0) {
    throw new Error(`getFxRate: no rate for ${key}`);
  }
  fxCache.set(key, rate);
  return rate;
}

// Yahoo's quoteSummary still works for current snapshot fields (profile,
// price, key stats, financialData) but their statement submodules
// (incomeStatementHistory, balanceSheetHistory, cashflowStatementHistory)
// have returned empty data since Nov 2024. We use fundamentalsTimeSeries
// for the annual history instead.
const QUOTE_SUMMARY_MODULES = [
  "assetProfile",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "price",
] as const;

type YahooQuoteSummary = {
  assetProfile?: { sector?: string; industry?: string; country?: string };
  summaryDetail?: {
    marketCap?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    averageVolume?: number;
    trailingPE?: number;
    dividendYield?: number;
    priceToSalesTrailing12Months?: number;
    currency?: string;
  };
  defaultKeyStatistics?: {
    enterpriseValue?: number | null;
    enterpriseToEbitda?: number | null;
    priceToBook?: number | null;
    sharesOutstanding?: number | null;
    bookValue?: number | null;
    trailingEps?: number | null;
    forwardEps?: number | null;
  };
  financialData?: {
    currentPrice?: number | null;
    ebitda?: number | null;
    totalCash?: number | null;
    totalDebt?: number | null;
    totalRevenue?: number | null;
    quickRatio?: number | null;
    currentRatio?: number | null;
    debtToEquity?: number | null;
    returnOnEquity?: number | null;
    returnOnAssets?: number | null;
    freeCashflow?: number | null;
    operatingCashflow?: number | null;
    grossMargins?: number | null;
    profitMargins?: number | null;
  };
  price?: {
    longName?: string;
    shortName?: string;
    exchangeName?: string;
    regularMarketPrice?: number;
    currency?: string;
    currencySymbol?: string;
  };
};

// fundamentalsTimeSeries returns rows shaped like this; the actual list is
// huge. We declare only the fields we read.
type YahooFundamentalsRow = {
  date: string | Date;
  periodType?: string;
  TYPE?: string;
  totalRevenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  EBIT?: number | null;
  EBITDA?: number | null;
  normalizedEBITDA?: number | null;
  interestExpense?: number | null;
  netIncome?: number | null;
  dilutedEPS?: number | null;
  dilutedAverageShares?: number | null;
  cashAndCashEquivalents?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  totalDebt?: number | null;
  longTermDebt?: number | null;
  currentDebt?: number | null;
  stockholdersEquity?: number | null;
  netDebt?: number | null;
  operatingCashFlow?: number | null;
  capitalExpenditure?: number | null;
  freeCashFlow?: number | null;
  cashDividendsPaid?: number | null;
  repurchaseOfCapitalStock?: number | null;
  reconciledDepreciation?: number | null;
};

/**
 * Yahoo uses `-` instead of `.` for share-class delimiters: `BRK-B` not
 * `BRK.B`, `BF-B` not `BF.B`. The canonical S&P 500 list uses dots, so we
 * translate at the API boundary while keeping the canonical symbol on the
 * snapshot.
 */
export function toYahooSymbol(symbol: string): string {
  return symbol.replace(/\./g, "-");
}

export class YahooProvider implements MarketDataProvider {
  readonly name = "yahoo";

  async fetchCompany(
    symbol: string,
    options: FetchOptions,
    reportError: ErrorReporter,
  ): Promise<CompanySnapshot | null> {
    const yahooSymbol = toYahooSymbol(symbol);

    let summary: YahooQuoteSummary;
    try {
      summary = (await yahooFinance.quoteSummary(yahooSymbol, {
        modules: [...QUOTE_SUMMARY_MODULES],
      })) as unknown as YahooQuoteSummary;
    } catch (err) {
      reportError(makeError(symbol, "quoteSummary", err));
      return null;
    }

    const profile = summary.assetProfile;
    const price = summary.price;
    if (!profile || !price || price.regularMarketPrice === undefined) {
      reportError({
        symbol,
        endpoint: "quoteSummary",
        message: "essential profile/price fields missing",
      });
      return null;
    }

    let fundamentals: YahooFundamentalsRow[] = [];
    try {
      const result = await yahooFinance.fundamentalsTimeSeries(yahooSymbol, {
        period1: priceFromMinusYears(options.priceTo, 5),
        type: "annual",
        module: "all",
      });
      fundamentals = (result as unknown as YahooFundamentalsRow[]) ?? [];
    } catch (err) {
      reportError(makeError(symbol, "fundamentalsTimeSeries", err));
    }

    // Quarterly fundamentals — needed by the back-test to reconstruct
    // TTM (sum of trailing 4 quarters) at any historical date,
    // matching what Yahoo's defaultKeyStatistics provides as TTM for
    // the live snapshot. Without this the back-test uses annual[0] as
    // a TTM proxy, which can differ materially when the most recent
    // quarter swings away from the prior fiscal year's run-rate.
    let fundamentalsQuarterly: YahooFundamentalsRow[] = [];
    try {
      const result = await yahooFinance.fundamentalsTimeSeries(yahooSymbol, {
        period1: priceFromMinusYears(options.priceTo, 5),
        type: "quarterly",
        module: "all",
      });
      fundamentalsQuarterly = (result as unknown as YahooFundamentalsRow[]) ?? [];
    } catch (err) {
      reportError(makeError(symbol, "fundamentalsTimeSeries-quarterly", err));
    }

    let priceBars: Array<{ close: number; volume: number }> = [];
    try {
      const chart = await yahooFinance.chart(yahooSymbol, {
        period1: options.priceFrom,
        period2: options.priceTo,
        interval: "1d",
      });
      priceBars = (chart.quotes ?? [])
        .filter(
          (q): q is typeof q & { close: number; volume: number } =>
            q.close !== null && q.volume !== null && q.close !== undefined,
        )
        .map((q) => ({ close: q.close, volume: q.volume }));
    } catch (err) {
      reportError(makeError(symbol, "chart", err));
    }

    // Historical monthly chart, 6 years back, used to populate
    // priceAtYearEnd on each annual period. Without this, the FV
    // engine's own-historical anchors collapse to current price by
    // mathematical construction (TTM_PE × current_EPS = price).
    // Monthly granularity is plenty for year-end lookups; daily would
    // 30× the response size without adding signal.
    let historicalCloses: Array<{ date: string; close: number }> = [];
    try {
      const longChart = await yahooFinance.chart(yahooSymbol, {
        period1: priceFromMinusYears(options.priceTo, 6),
        period2: options.priceTo,
        interval: "1mo",
      });
      historicalCloses = (longChart.quotes ?? [])
        .filter(
          (q): q is typeof q & { close: number; date: Date } =>
            q.close !== null && q.close !== undefined && q.date instanceof Date,
        )
        .map((q) => ({
          date: q.date.toISOString().slice(0, 10),
          close: q.close,
        }));
    } catch (err) {
      reportError(makeError(symbol, "chart-historical", err));
    }

    const summaryDetail = summary.summaryDetail;
    const averageVolume =
      priceBars.length > 0
        ? Math.round(priceBars.reduce((s, b) => s + b.volume, 0) / priceBars.length)
        : (summaryDetail?.averageVolume ?? 0);

    const yearHigh =
      summaryDetail?.fiftyTwoWeekHigh ??
      (priceBars.length ? Math.max(...priceBars.map((b) => b.close)) : 0);
    const yearLow =
      summaryDetail?.fiftyTwoWeekLow ??
      (priceBars.length ? Math.min(...priceBars.map((b) => b.close)) : 0);
    const currentPrice = price.regularMarketPrice;
    const marketCap = summaryDetail?.marketCap ?? 0;

    // Yahoo serves the listing's quote currency directly but reports the
    // financial statements in the issuer's home currency for foreign ADRs
    // (and silently labels everything as USD). We infer the reporting
    // currency from `assetProfile.country` and FX-convert statement values
    // so the snapshot is internally consistent.
    const quoteCurrency =
      summaryDetail?.currency ?? price.currency ?? "USD";
    const reportingCurrency = inferReportingCurrency(profile.country);
    let fxRate = 1;
    if (reportingCurrency !== quoteCurrency) {
      try {
        fxRate = await getFxRate(reportingCurrency, quoteCurrency);
      } catch (err) {
        reportError(makeError(symbol, "fx-rate", err));
        // Fall back to fxRate=1 (no conversion); downstream values stay in
        // reporting currency. The snapshot still gets written; the user can
        // see the issue via the recorded error.
      }
    }

    const annual = mapAnnualPeriods(fundamentals, fxRate, historicalCloses);
    const quarterly = mapQuarterlyPeriods(fundamentalsQuarterly, fxRate, historicalCloses);
    const ttm = mapTtm(summary, currentPrice, annual[0], fxRate);

    // Cross-check spot price against marketCap / latest share count.
    // Yahoo occasionally serves names (BKNG observed 2026-04) where
    // per-share fields (price, EPS, shareCount-from-key-stats) are scaled
    // by an old phantom-split factor while aggregates (marketCap, NI) are
    // real. The fundamentalsTimeSeries share count tracks the real number,
    // so marketCap/sharesDiluted is a trustworthy implied price. >50%
    // deviation almost certainly means upstream data is corrupt — exclude
    // rather than poison downstream fair-value math.
    const recentShares = annual[0]?.income.sharesDiluted ?? null;
    if (
      recentShares !== null &&
      recentShares > 0 &&
      marketCap > 0 &&
      currentPrice > 0
    ) {
      const impliedPrice = marketCap / recentShares;
      const deviation = Math.abs(impliedPrice - currentPrice) / currentPrice;
      if (deviation > 0.5) {
        reportError({
          symbol,
          endpoint: "price-consistency",
          message: `quote.price $${currentPrice.toFixed(2)} disagrees with marketCap/sharesDiluted $${impliedPrice.toFixed(2)} (${Math.round(deviation * 100)}% off); excluding`,
        });
        return null;
      }
    }

    return {
      symbol,
      name: price.longName ?? price.shortName ?? symbol,
      sector: profile.sector ?? "Unknown",
      industry: profile.industry ?? "Unknown",
      exchange: price.exchangeName ?? "Unknown",
      marketCap,
      currency: quoteCurrency, // post-conversion: snapshot is in this currency
      quoteCurrency,
      quote: {
        price: currentPrice,
        yearHigh,
        yearLow,
        volume: 0,
        averageVolume,
      },
      ttm,
      annual,
      quarterly,
      pctOffYearHigh: pctOffHigh(currentPrice, yearHigh),
    };
  }
}

function makeError(symbol: string, endpoint: string, err: unknown) {
  return {
    symbol,
    endpoint,
    message: err instanceof Error ? err.message : String(err),
  };
}

function n(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function priceFromMinusYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function fiscalYearOf(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return String(d.getUTCFullYear());
}

function fiscalQuarterOf(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const q = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `${d.getUTCFullYear()}Q${q}`;
}

/** Multiply a nullable amount by an FX rate. Pass-through if null. */
function fx(value: number | null, rate: number): number | null {
  return value === null ? null : value * rate;
}

function mapAnnualPeriods(
  rows: YahooFundamentalsRow[],
  fxRate: number,
  historicalCloses: Array<{ date: string; close: number }> = [],
): AnnualPeriod[] {
  // fundamentalsTimeSeries returns rows oldest-first. Sort newest-first for
  // consistency with the rest of the codebase.
  const sorted = [...rows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Sort historical chart oldest-first so we can walk forward to find
  // the close at-or-before each period-end.
  const closesAsc = [...historicalCloses].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  function closeAtOrBefore(targetIso: string): number | null {
    let result: number | null = null;
    for (const q of closesAsc) {
      if (q.date <= targetIso) result = q.close;
      else break;
    }
    return result;
  }

  return sorted.map((row) => {
    const ebit = fx(n(row.EBIT) ?? n(row.operatingIncome), fxRate);
    const depreciation = fx(n(row.reconciledDepreciation), fxRate);
    const ebitda =
      fx(n(row.EBITDA), fxRate) ??
      fx(n(row.normalizedEBITDA), fxRate) ??
      (ebit !== null && depreciation !== null ? ebit + depreciation : ebit);

    const totalDebt =
      fx(n(row.totalDebt), fxRate) ??
      (() => {
        const long = n(row.longTermDebt) ?? 0;
        const current = n(row.currentDebt) ?? 0;
        const sum = long + current;
        return sum > 0 ? sum * fxRate : null;
      })();
    const cash = fx(n(row.cashAndCashEquivalents), fxRate);

    const ratios = computeAnnualRatios({
      ebit,
      ebitda,
      totalDebt,
      cash,
      equity: fx(n(row.stockholdersEquity), fxRate),
      currentAssets: fx(n(row.currentAssets), fxRate),
      currentLiabilities: fx(n(row.currentLiabilities), fxRate),
    });

    const periodEndDate = new Date(row.date).toISOString().slice(0, 10);
    const period: AnnualPeriod = {
      fiscalYear: fiscalYearOf(row.date),
      periodEndDate,
      filingDate: null,
      // After FX conversion every numeric value is in the quote currency
      // (USD for ADR listings). The literal "USD" here is loose — to be
      // strictly correct we'd carry the actual quote currency, but for our
      // S&P 500 + selected ADR universe this is true.
      reportedCurrency: "USD",
      // Close at or just before the period-end date, looked up from the
      // historical monthly chart fetched alongside the fundamentals.
      // FX rate doesn't apply: chart prices are already in the listing's
      // quote currency. Null when the chart didn't reach far enough back
      // (rare — only the oldest period of a long history).
      priceAtYearEnd: closeAtOrBefore(periodEndDate),
      income: {
        revenue: fx(n(row.totalRevenue), fxRate),
        grossProfit: fx(n(row.grossProfit), fxRate),
        operatingIncome: fx(n(row.operatingIncome), fxRate),
        ebit,
        ebitda,
        interestExpense: fx(n(row.interestExpense), fxRate),
        netIncome: fx(n(row.netIncome), fxRate),
        epsDiluted: fx(n(row.dilutedEPS), fxRate),
        sharesDiluted: n(row.dilutedAverageShares), // count, no FX
      } satisfies AnnualIncome,
      balance: {
        cash,
        totalCurrentAssets: fx(n(row.currentAssets), fxRate),
        totalCurrentLiabilities: fx(n(row.currentLiabilities), fxRate),
        totalDebt,
        totalEquity: fx(n(row.stockholdersEquity), fxRate),
      } satisfies AnnualBalance,
      cashFlow: {
        operatingCashFlow: fx(n(row.operatingCashFlow), fxRate),
        capex: fx(n(row.capitalExpenditure), fxRate),
        freeCashFlow: fx(n(row.freeCashFlow), fxRate),
        dividendsPaid:
          row.cashDividendsPaid !== null && row.cashDividendsPaid !== undefined
            ? Math.abs(row.cashDividendsPaid) * fxRate
            : null,
        buybacks:
          row.repurchaseOfCapitalStock !== null && row.repurchaseOfCapitalStock !== undefined
            ? Math.abs(row.repurchaseOfCapitalStock) * fxRate
            : null,
      } satisfies AnnualCashFlow,
      ratios,
    };
    return period;
  });
}

/**
 * Same shape as mapAnnualPeriods but at quarterly cadence. Yahoo's
 * `fundamentalsTimeSeries` with type="quarterly" returns the same
 * row shape as annual, just one entry per fiscal quarter. The
 * mapping is mechanical — the back-test sums these to reconstruct
 * TTM at any historical date.
 */
function mapQuarterlyPeriods(
  rows: YahooFundamentalsRow[],
  fxRate: number,
  historicalCloses: Array<{ date: string; close: number }> = [],
): QuarterlyPeriod[] {
  const sorted = [...rows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const closesAsc = [...historicalCloses].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  function closeAtOrBefore(targetIso: string): number | null {
    let result: number | null = null;
    for (const q of closesAsc) {
      if (q.date <= targetIso) result = q.close;
      else break;
    }
    return result;
  }

  return sorted.map((row) => {
    const ebit = fx(n(row.EBIT) ?? n(row.operatingIncome), fxRate);
    const depreciation = fx(n(row.reconciledDepreciation), fxRate);
    const ebitda =
      fx(n(row.EBITDA), fxRate) ??
      fx(n(row.normalizedEBITDA), fxRate) ??
      (ebit !== null && depreciation !== null ? ebit + depreciation : ebit);
    const totalDebt =
      fx(n(row.totalDebt), fxRate) ??
      (() => {
        const long = n(row.longTermDebt) ?? 0;
        const current = n(row.currentDebt) ?? 0;
        const sum = long + current;
        return sum > 0 ? sum * fxRate : null;
      })();
    const cash = fx(n(row.cashAndCashEquivalents), fxRate);
    const ratios = computeAnnualRatios({
      ebit,
      ebitda,
      totalDebt,
      cash,
      equity: fx(n(row.stockholdersEquity), fxRate),
      currentAssets: fx(n(row.currentAssets), fxRate),
      currentLiabilities: fx(n(row.currentLiabilities), fxRate),
    });
    const periodEndDate = new Date(row.date).toISOString().slice(0, 10);
    return {
      fiscalQuarter: fiscalQuarterOf(row.date),
      periodEndDate,
      filingDate: null,
      reportedCurrency: "USD",
      priceAtQuarterEnd: closeAtOrBefore(periodEndDate),
      income: {
        revenue: fx(n(row.totalRevenue), fxRate),
        grossProfit: fx(n(row.grossProfit), fxRate),
        operatingIncome: fx(n(row.operatingIncome), fxRate),
        ebit,
        ebitda,
        interestExpense: fx(n(row.interestExpense), fxRate),
        netIncome: fx(n(row.netIncome), fxRate),
        epsDiluted: fx(n(row.dilutedEPS), fxRate),
        sharesDiluted: n(row.dilutedAverageShares),
      } satisfies AnnualIncome,
      balance: {
        cash,
        totalCurrentAssets: fx(n(row.currentAssets), fxRate),
        totalCurrentLiabilities: fx(n(row.currentLiabilities), fxRate),
        totalDebt,
        totalEquity: fx(n(row.stockholdersEquity), fxRate),
      } satisfies AnnualBalance,
      cashFlow: {
        operatingCashFlow: fx(n(row.operatingCashFlow), fxRate),
        capex: fx(n(row.capitalExpenditure), fxRate),
        freeCashFlow: fx(n(row.freeCashFlow), fxRate),
        dividendsPaid:
          row.cashDividendsPaid !== null && row.cashDividendsPaid !== undefined
            ? Math.abs(row.cashDividendsPaid) * fxRate
            : null,
        buybacks:
          row.repurchaseOfCapitalStock !== null && row.repurchaseOfCapitalStock !== undefined
            ? Math.abs(row.repurchaseOfCapitalStock) * fxRate
            : null,
      } satisfies AnnualCashFlow,
      ratios,
    };
  });
}

function computeAnnualRatios(input: {
  ebit: number | null;
  ebitda: number | null;
  totalDebt: number | null;
  cash: number | null;
  equity: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
}): AnnualRatios {
  const netDebt =
    input.totalDebt !== null && input.cash !== null
      ? input.totalDebt - input.cash
      : null;
  const netDebtToEbitda =
    netDebt !== null && input.ebitda !== null && input.ebitda > 0
      ? netDebt / input.ebitda
      : null;
  const currentRatio =
    input.currentAssets !== null &&
    input.currentLiabilities !== null &&
    input.currentLiabilities > 0
      ? input.currentAssets / input.currentLiabilities
      : null;
  // ROIC ≈ EBIT × (1 - 0.21 effective tax) / Invested Capital.
  // Flat 21% tax assumption since per-period tax rate isn't always present.
  const investedCapital =
    input.equity !== null && input.totalDebt !== null && input.cash !== null
      ? input.equity + input.totalDebt - input.cash
      : null;
  const roic =
    input.ebit !== null && investedCapital !== null && investedCapital > 0
      ? (input.ebit * (1 - 0.21)) / investedCapital
      : null;
  return { roic, netDebtToEbitda, currentRatio };
}

function mapTtm(
  summary: YahooQuoteSummary,
  currentPrice: number,
  mostRecent: AnnualPeriod | undefined,
  fxRate: number,
): TtmMetrics {
  const fd = summary.financialData;
  const dks = summary.defaultKeyStatistics;
  const sd = summary.summaryDetail;

  // financialData fields are in reporting currency (verified empirically for
  // ADRs); enterpriseValue and marketCap are in quote currency. Apply FX
  // only where needed.
  const ttmEbitda = fx(n(fd?.ebitda ?? null), fxRate);
  const totalDebt = fx(n(fd?.totalDebt ?? null), fxRate);
  const totalCash = fx(n(fd?.totalCash ?? null), fxRate);
  const ev = n(dks?.enterpriseValue ?? null); // already in quote currency
  const fcf = fx(n(fd?.freeCashflow ?? null), fxRate);
  const marketCap = n(sd?.marketCap ?? null); // already in quote currency

  const trailingPE = n(sd?.trailingPE ?? null);
  const peRatio =
    trailingPE !== null && trailingPE > 0
      ? trailingPE
      : dks?.trailingEps && dks.trailingEps > 0
        ? currentPrice / dks.trailingEps
        : null;

  const priceToFcf =
    fcf !== null && fcf > 0 && marketCap !== null && marketCap > 0
      ? marketCap / fcf
      : null;

  const netDebtToEbitda =
    totalDebt !== null && totalCash !== null && ttmEbitda !== null && ttmEbitda > 0
      ? (totalDebt - totalCash) / ttmEbitda
      : null;

  const investedCapital =
    mostRecent?.balance.totalEquity !== null &&
    mostRecent?.balance.totalEquity !== undefined &&
    totalDebt !== null
      ? mostRecent.balance.totalEquity + totalDebt - (totalCash ?? 0)
      : null;

  const recentEbit = mostRecent?.income.ebit ?? null;
  const roic =
    recentEbit !== null && investedCapital !== null && investedCapital > 0
      ? (recentEbit * (1 - 0.21)) / investedCapital
      : null;

  return {
    peRatio,
    evToEbitda: n(dks?.enterpriseToEbitda ?? null),
    priceToFcf,
    priceToBook: n(dks?.priceToBook ?? null),
    dividendYield: n(sd?.dividendYield ?? null),
    currentRatio: n(fd?.currentRatio ?? null),
    netDebtToEbitda,
    roic,
    earningsYield: peRatio !== null && peRatio > 0 ? 1 / peRatio : null,
    fcfYield:
      fcf !== null && marketCap !== null && marketCap > 0
        ? fcf / marketCap
        : null,
    enterpriseValue: ev,
    investedCapital,
    forwardEps: n(dks?.forwardEps ?? null),
  };
}
