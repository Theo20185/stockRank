/**
 * Reconstruct what a `CompanySnapshot` would have looked like at a
 * historical date, using EDGAR fundamentals + persisted Yahoo
 * monthly chart bars.
 *
 * Used by `compute-fv-trend` to build a true multi-year sparkline:
 * for each historical quarter end going back ~5 years (capped by
 * EDGAR depth), synthesize a snapshot for every symbol in the
 * universe and run `fairValueFor` per subject against the synthetic
 * historical universe. Result: a per-symbol time series of
 * (date, price, fvP25, fvMedian, fvP75) points that match what the
 * production engine *would have* computed on each date.
 *
 * This deliberately mirrors the back-test's reconstruction logic but
 * uses EDGAR's deep quarterly history instead of Yahoo's 6-quarter cap.
 */

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
import type { HistoricalBar } from "./mapper.js";
import {
  decorateAnnualPeriodsWithPrices,
  decorateQuarterlyPeriodsWithPrices,
  inferSharesScale,
  mapAnnualPeriods,
  mapQuarterlyPeriods,
  rescaleSharesInPeriods,
  withAnnualRatios,
  withQuarterlyRatios,
} from "./mapper.js";
import type { EdgarCompanyFacts } from "./types.js";

/** Days SEC filers typically have to publish a 10-K after fiscal-year
 * end. Used to gate which annuals were *publicly known* at a given
 * historical reconstruction date. */
const ANNUAL_FILING_LAG_DAYS = 90;

/** Days SEC filers typically have to publish a 10-Q after fiscal-quarter
 * end. */
const QUARTERLY_FILING_LAG_DAYS = 45;

/** Profile fields that don't change historically — pulled from the
 * current snapshot once and reused at every reconstructed date.
 *
 * (Sector / industry classifications occasionally change at GICS
 * reviews, and companies rarely change exchanges, but for our
 * sparkline use case the classification at "now" is the right one
 * — that's how the user reads the chart.) */
export type SymbolProfile = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  /** Authoritative current shares outstanding from Yahoo. Used to
   * cross-reference EDGAR's per-period share-count magnitude
   * (some filers report in millions; others raw). */
  authoritativeShares: number;
  /** Reporting + quote currency. For S&P 500 universe both are USD. */
  currency: string;
};

/** Add days to an ISO yyyy-mm-dd. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Close of the most recent monthly bar at-or-before `dateIso`. */
function priceAtOrBefore(
  bars: HistoricalBar[],
  dateIso: string,
): number | null {
  let result: number | null = null;
  for (const b of bars) {
    if (b.date <= dateIso) result = b.close;
    else break;
  }
  return result;
}

/** 52-week high (max bar.high) and low (min bar.low) ending at `dateIso`. */
function trailingYearRange(
  bars: HistoricalBar[],
  dateIso: string,
): { high: number; low: number } {
  const start = addDays(dateIso, -365);
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (b.date < start || b.date > dateIso) continue;
    const h = b.high ?? b.close;
    const l = b.low ?? b.close;
    if (h > high) high = h;
    if (l < low) low = l;
  }
  return high === -Infinity
    ? { high: 0, low: 0 }
    : { high, low };
}

/** Sum the `selector` value across the trailing 4 quarterly periods
 * with periodEndDate ≤ `cutoff`. Returns null if fewer than 4
 * eligible quarters or any selected value is null. */
function trailing4Sum(
  quarters: QuarterlyPeriod[],
  cutoff: string,
  selector: (q: QuarterlyPeriod) => number | null,
): number | null {
  // Quarters arrive newest-first from the mapper; filter then take 4.
  const eligible = quarters.filter((q) => q.periodEndDate <= cutoff);
  if (eligible.length < 4) return null;
  let total = 0;
  for (const q of eligible.slice(0, 4)) {
    const v = selector(q);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/** Most recent value of a balance-sheet field at-or-before `cutoff`. */
function pointInTime<T>(
  quarters: QuarterlyPeriod[],
  annuals: AnnualPeriod[],
  cutoff: string,
  selector: (p: { balance: AnnualBalance }) => T | null,
): T | null {
  // Quarterly balance is more current than annual; prefer it.
  for (const q of quarters) {
    if (q.periodEndDate <= cutoff) {
      const v = selector(q);
      if (v !== null) return v;
    }
  }
  for (const a of annuals) {
    if (a.periodEndDate <= cutoff) {
      const v = selector(a);
      if (v !== null) return v;
    }
  }
  return null;
}

/** Derive TTM metrics from price + reconstructed TTM income / cashflow
 * + most-recent balance + shares-out. Mirrors the live Yahoo TTM
 * derivation but every input is historical-as-of `date`. */
function buildTtmMetrics(
  price: number,
  shares: number | null,
  ttmIncome: AnnualIncome,
  balance: AnnualBalance,
  ttmCashFlow: AnnualCashFlow,
): TtmMetrics {
  const marketCap = shares !== null && shares > 0 ? price * shares : 0;
  const debt = balance.totalDebt ?? 0;
  const cash = balance.cash ?? 0;
  const equity = balance.totalEquity ?? 0;
  const enterpriseValue = marketCap + debt - cash;
  const investedCapital = equity + debt - cash;

  const peRatio =
    ttmIncome.epsDiluted !== null && ttmIncome.epsDiluted > 0
      ? price / ttmIncome.epsDiluted
      : null;
  const evToEbitda =
    ttmIncome.ebitda !== null && ttmIncome.ebitda > 0
      ? enterpriseValue / ttmIncome.ebitda
      : null;
  const fcf = ttmCashFlow.freeCashFlow;
  const priceToFcf =
    fcf !== null && fcf > 0 && marketCap > 0 ? marketCap / fcf : null;
  const priceToBook =
    equity > 0 && shares !== null && shares > 0
      ? price / (equity / shares)
      : null;
  const netDebtToEbitda =
    ttmIncome.ebitda !== null && ttmIncome.ebitda > 0
      ? (debt - cash) / ttmIncome.ebitda
      : null;
  const roic =
    ttmIncome.ebit !== null && investedCapital > 0
      ? (ttmIncome.ebit * (1 - 0.21)) / investedCapital
      : null;
  return {
    peRatio,
    evToEbitda,
    priceToFcf,
    priceToBook,
    dividendYield: null, // not reconstructible from EDGAR alone at past dates
    currentRatio: null,
    netDebtToEbitda,
    roic,
    earningsYield: peRatio !== null && peRatio > 0 ? 1 / peRatio : null,
    fcfYield: fcf !== null && marketCap > 0 ? fcf / marketCap : null,
    enterpriseValue: enterpriseValue > 0 ? enterpriseValue : null,
    investedCapital: investedCapital > 0 ? investedCapital : null,
    forwardEps: null, // not historically reconstructible
  };
}

/** Build a single TTM AnnualIncome panel by summing trailing 4 quarters. */
function reconstructTtmIncome(
  quarters: QuarterlyPeriod[],
  cutoff: string,
): AnnualIncome {
  return {
    revenue: trailing4Sum(quarters, cutoff, (q) => q.income.revenue),
    grossProfit: trailing4Sum(quarters, cutoff, (q) => q.income.grossProfit),
    operatingIncome: trailing4Sum(
      quarters,
      cutoff,
      (q) => q.income.operatingIncome,
    ),
    ebit: trailing4Sum(quarters, cutoff, (q) => q.income.ebit),
    ebitda: trailing4Sum(quarters, cutoff, (q) => q.income.ebitda),
    interestExpense: trailing4Sum(
      quarters,
      cutoff,
      (q) => q.income.interestExpense,
    ),
    netIncome: trailing4Sum(quarters, cutoff, (q) => q.income.netIncome),
    epsDiluted: trailing4Sum(quarters, cutoff, (q) => q.income.epsDiluted),
    sharesDiluted: (() => {
      // Use the most-recent quarter's shares (point-in-time) — summing
      // quarterly shares would multiply the count by 4.
      for (const q of quarters) {
        if (q.periodEndDate <= cutoff && q.income.sharesDiluted !== null) {
          return q.income.sharesDiluted;
        }
      }
      return null;
    })(),
  };
}

function reconstructTtmCashFlow(
  quarters: QuarterlyPeriod[],
  cutoff: string,
): AnnualCashFlow {
  return {
    operatingCashFlow: trailing4Sum(
      quarters,
      cutoff,
      (q) => q.cashFlow.operatingCashFlow,
    ),
    capex: trailing4Sum(quarters, cutoff, (q) => q.cashFlow.capex),
    freeCashFlow: trailing4Sum(quarters, cutoff, (q) => q.cashFlow.freeCashFlow),
    dividendsPaid: trailing4Sum(
      quarters,
      cutoff,
      (q) => q.cashFlow.dividendsPaid,
    ),
    buybacks: trailing4Sum(quarters, cutoff, (q) => q.cashFlow.buybacks),
  };
}

/** TTM ratios get baked into `ttm`; the engine doesn't read these
 * for historical periods. Provide a null-filled default. */
function emptyAnnualRatios(): AnnualRatios {
  return { roic: null, netDebtToEbitda: null, currentRatio: null };
}

/**
 * Synthesize a CompanySnapshot at `date` (yyyy-mm-dd) using the
 * symbol's EDGAR companyfacts and persisted monthly chart bars.
 *
 * Returns null when the symbol has insufficient historical data:
 *   - No price bar at-or-before `date`
 *   - No quarterly fundamentals public as-of `date`
 *   - No annual fundamentals public as-of `date`
 */
export function synthesizeSnapshotAt(
  facts: EdgarCompanyFacts,
  bars: HistoricalBar[],
  date: string,
  profile: SymbolProfile,
): CompanySnapshot | null {
  // Early bailout: need a chart bar at-or-before this date.
  const sortedBars = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const price = priceAtOrBefore(sortedBars, date);
  if (price === null || price <= 0) return null;

  // Build the full EDGAR period series (newest-first), uncapped — we
  // need historical depth here, not the snapshot truncation cap.
  const allAnnual = mapAnnualPeriods(facts, { maxAnnualPeriods: Infinity });
  const allQuarterly = mapQuarterlyPeriods(facts, {
    maxQuarterlyPeriods: Infinity,
  });

  // Apply shares-magnitude rescale before any per-share math.
  const scale =
    allAnnual.length > 0
      ? inferSharesScale(
          allAnnual[0]!.income.sharesDiluted,
          profile.authoritativeShares,
        )
      : 1;
  const annualScaled = rescaleSharesInPeriods(allAnnual, scale);
  const quarterlyScaled = rescaleSharesInPeriods(allQuarterly, scale);

  // Filter to publicly-known-as-of `date`. 10-K filings are typically
  // available 70-90 days after FY end; 10-Q within 45 days of QE.
  const annualCutoff = addDays(date, -ANNUAL_FILING_LAG_DAYS);
  const quarterlyCutoff = addDays(date, -QUARTERLY_FILING_LAG_DAYS);
  const publicAnnual = annualScaled.filter(
    (a) => a.periodEndDate <= annualCutoff,
  );
  const publicQuarterly = quarterlyScaled.filter(
    (q) => q.periodEndDate <= quarterlyCutoff,
  );
  if (publicAnnual.length === 0 && publicQuarterly.length === 0) return null;

  // Decorate annuals with historical FY-window prices from the bars.
  const decoratedAnnual = decorateAnnualPeriodsWithPrices(
    publicAnnual,
    sortedBars,
  ).map(withAnnualRatios);
  const decoratedQuarterly = decorateQuarterlyPeriodsWithPrices(
    publicQuarterly,
    sortedBars,
  ).map(withQuarterlyRatios);

  // Reconstruct TTM income / cashflow at the cutoff date.
  const ttmIncome = reconstructTtmIncome(publicQuarterly, quarterlyCutoff);
  const ttmCashFlow = reconstructTtmCashFlow(publicQuarterly, quarterlyCutoff);

  // Most-recent balance — quarterly preferred, annual fallback.
  const balance: AnnualBalance = {
    cash: pointInTime(
      publicQuarterly,
      publicAnnual,
      quarterlyCutoff,
      (p) => p.balance.cash,
    ),
    totalCurrentAssets: pointInTime(
      publicQuarterly,
      publicAnnual,
      quarterlyCutoff,
      (p) => p.balance.totalCurrentAssets,
    ),
    totalCurrentLiabilities: pointInTime(
      publicQuarterly,
      publicAnnual,
      quarterlyCutoff,
      (p) => p.balance.totalCurrentLiabilities,
    ),
    totalDebt: pointInTime(
      publicQuarterly,
      publicAnnual,
      quarterlyCutoff,
      (p) => p.balance.totalDebt,
    ),
    totalEquity: pointInTime(
      publicQuarterly,
      publicAnnual,
      quarterlyCutoff,
      (p) => p.balance.totalEquity,
    ),
  };

  const sharesAtDate =
    ttmIncome.sharesDiluted ??
    decoratedAnnual[0]?.income.sharesDiluted ??
    null;
  const ttm = buildTtmMetrics(price, sharesAtDate, ttmIncome, balance, ttmCashFlow);
  const range = trailingYearRange(sortedBars, date);
  const yearHigh = range.high > 0 ? range.high : price;
  const yearLow = range.low > 0 ? range.low : price;
  const marketCap =
    sharesAtDate !== null && sharesAtDate > 0 ? price * sharesAtDate : 0;

  // Truncate historical periods to the same caps the live snapshot
  // uses, so the FV engine sees the same window shape it would
  // see in production.
  const annual = decoratedAnnual.slice(0, 7);
  const quarterly = decoratedQuarterly.slice(0, 12);

  // Trailing 14 month-end closes for the Momentum factor — sample
  // one bar per calendar month over the 14 months ending at `date`.
  // Mirrors the live ingest's monthlyCloses shape so backtest IC
  // analysis sees the same momentum input as production.
  const monthlyCloses: { date: string; close: number }[] = [];
  {
    const seenMonths = new Set<string>();
    for (const b of sortedBars) {
      if (b.date > date) break;
      seenMonths.add(b.date.slice(0, 7));
    }
    const months = [...seenMonths].sort().slice(-14);
    for (const yyyymm of months) {
      let last: { date: string; close: number } | null = null;
      for (const b of sortedBars) {
        if (b.date.slice(0, 7) !== yyyymm) continue;
        if (b.date > date) break;
        last = { date: b.date, close: b.close };
      }
      if (last) monthlyCloses.push(last);
    }
  }

  return {
    symbol: profile.symbol,
    name: profile.name,
    sector: profile.sector,
    industry: profile.industry,
    exchange: profile.exchange,
    marketCap,
    currency: profile.currency,
    quoteCurrency: profile.currency,
    quote: {
      price,
      yearHigh,
      yearLow,
      volume: 0,
      averageVolume: 0,
    },
    ttm,
    annual,
    quarterly,
    pctOffYearHigh:
      yearHigh > 0 && price < yearHigh
        ? ((yearHigh - price) / yearHigh) * 100
        : 0,
    pctAboveYearLow:
      yearLow > 0 && price > yearLow
        ? ((price - yearLow) / yearLow) * 100
        : 0,
    monthlyCloses,
  };
}

/**
 * Enumerate quarter-end ISO dates in (start, end]. Default cadence
 * for the historical sparkline.
 */
export function quarterEndsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let year = parseInt(start.slice(0, 4), 10);
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  while (year <= parseInt(end.slice(0, 4), 10)) {
    for (const md of ends) {
      const iso = `${year}-${md}`;
      if (iso > start && iso <= end) out.push(iso);
    }
    year += 1;
  }
  return out;
}
