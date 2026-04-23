import YahooFinance from "yahoo-finance2";
import type {
  AnnualPeriod,
  CompanySnapshot,
  QuarterlyPeriod,
  TtmMetrics,
} from "@stockrank/core";
import { pctOffHigh } from "@stockrank/core";
import type { ErrorReporter, FetchOptions, MarketDataProvider } from "../provider.js";
import { inferReportingCurrency } from "./currency.js";
import {
  decorateAnnualPeriodsWithPrices,
  decorateQuarterlyPeriodsWithPrices,
  EdgarNotFoundError,
  getEdgarFundamentals,
  inferSharesScale,
  rescaleSharesInPeriods,
  type HistoricalBar as EdgarHistoricalBar,
  withAnnualRatios,
  withQuarterlyRatios,
} from "../edgar/index.js";

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
    /** Yahoo's authoritative answer for what currency this company's
     * financial statements are reported in. Differs from the listing
     * currency for ADRs (e.g., NVO listed in USD reports in DKK) but
     * also for cross-border listings (LULU is HQ Canada but reports
     * in USD). When present, this is the truth — the country-based
     * inference is a fallback only. */
    financialCurrency?: string | null;
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

    // Fundamentals come from SEC EDGAR (XBRL companyfacts). Yahoo's
    // fundamentalsTimeSeries caps at ~6 quarters of history, which
    // isn't enough to reconstruct TTM at past dates. EDGAR is the
    // authoritative source — same data Yahoo and FMP both repackage —
    // and reaches back to ~2009 (when XBRL tagging was mandated).
    // Cached per-symbol at tmp/edgar-cache/{SYMBOL}/facts.json.
    // See docs/specs/edgar.md for the spec, fallback chains, and
    // sign-convention notes.
    let edgarAnnual: AnnualPeriod[] = [];
    let edgarQuarterly: QuarterlyPeriod[] = [];
    try {
      const fundamentals = await getEdgarFundamentals(symbol);
      edgarAnnual = fundamentals.annual;
      edgarQuarterly = fundamentals.quarterly;
    } catch (err) {
      const endpoint =
        err instanceof EdgarNotFoundError ? "edgar-not-found" : "edgar";
      reportError(makeError(symbol, endpoint, err));
    }

    // Normalize EDGAR share-count magnitude. Some filers report
    // `WeightedAverageNumberOfDilutedSharesOutstanding` in millions
    // (MCD, WAT, IBKR, OMC, AMCR, BX, TKO …) while others use raw
    // counts (AAPL). EDGAR's `units` claim is always "shares" and
    // doesn't disambiguate. We cross-reference against Yahoo's
    // `defaultKeyStatistics.sharesOutstanding` (always raw count)
    // and rescale the entire EDGAR series by the inferred power of
    // 1000. Fixes the price-consistency check + every per-share
    // calculation downstream (own-historical EV/EBITDA, P/FCF).
    const yahooShares =
      summary.defaultKeyStatistics?.sharesOutstanding ?? 0;
    if (yahooShares > 0 && edgarAnnual.length > 0) {
      const scale = inferSharesScale(
        edgarAnnual[0]!.income.sharesDiluted,
        yahooShares,
      );
      if (scale !== 1) {
        edgarAnnual = rescaleSharesInPeriods(edgarAnnual, scale);
        edgarQuarterly = rescaleSharesInPeriods(edgarQuarterly, scale);
      }
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

    // Historical monthly chart, 6 years back, used to populate the
    // own-historical anchor inputs:
    //   - priceAtYearEnd: close at fiscal-year-end (point sample)
    //   - priceHighInYear / priceLowInYear: max/min intraday prices
    //     during the fiscal year (range samples)
    // Capturing the range — not just the year-end snapshot — keeps
    // the FV engine from systematically underestimating peak
    // valuations (e.g., BBY hit ~$140 in Nov 2021 but closed FY22 at
    // $99). Monthly bars include intraday `high`/`low` per period,
    // so the range is properly captured.
    type HistoricalBar = { date: string; close: number; high: number | null; low: number | null };
    let historicalBars: HistoricalBar[] = [];
    try {
      const longChart = await yahooFinance.chart(yahooSymbol, {
        period1: priceFromMinusYears(options.priceTo, 6),
        period2: options.priceTo,
        interval: "1mo",
      });
      historicalBars = (longChart.quotes ?? [])
        .filter(
          (q): q is typeof q & { close: number; date: Date } =>
            q.close !== null && q.close !== undefined && q.date instanceof Date,
        )
        .map((q) => ({
          date: q.date.toISOString().slice(0, 10),
          close: q.close,
          high: typeof q.high === "number" ? q.high : null,
          low: typeof q.low === "number" ? q.low : null,
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
    // Prefer Yahoo's authoritative financialCurrency when present;
    // fall back to country-based inference. Country-based was wrong
    // for cross-border listings like LULU (HQ Canada, reports in USD)
    // — it would apply spurious CAD→USD conversion to USD-denominated
    // statements, slashing all per-share figures by ~27%.
    const reportingCurrency =
      summary.financialData?.financialCurrency ??
      inferReportingCurrency(profile.country);
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

    // EDGAR returns periods with priceAt* and ratios all null.
    // Decorate with prices from Yahoo's monthly chart, then compute
    // ratios (ROIC, netDebt/EBITDA, current ratio) from the
    // already-extracted income/balance figures.
    const annual = decorateAnnualPeriodsWithPrices(
      edgarAnnual,
      historicalBars as EdgarHistoricalBar[],
    ).map(withAnnualRatios);
    const quarterly = decorateQuarterlyPeriodsWithPrices(
      edgarQuarterly,
      historicalBars as EdgarHistoricalBar[],
    ).map(withQuarterlyRatios);
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

/** Multiply a nullable amount by an FX rate. Pass-through if null. */
function fx(value: number | null, rate: number): number | null {
  return value === null ? null : value * rate;
}

type HistoricalBar = { date: string; close: number; high: number | null; low: number | null };

// EDGAR replaces these mappers — kept for reference of the prior FX
// + ratios behavior; entire block is dead code that the EDGAR mapper
// + price-decoration helpers now own.
//
// Removed: mapAnnualPeriods, mapQuarterlyPeriods, computeAnnualRatios.
// Live equivalents: see packages/data/src/edgar/mapper.ts
//   (mapAnnualPeriods, mapQuarterlyPeriods, decorateAnnualPeriodsWithPrices,
//    decorateQuarterlyPeriodsWithPrices, withAnnualRatios,
//    withQuarterlyRatios).

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
