#!/usr/bin/env tsx
/**
 * Single-name back-test for the fair-value engine + outlier rule.
 *
 * For each symbol, walks month-end snapshots over the last N years and
 * recomputes fair value as it would have looked given only the data
 * known at that date (annual fundamentals filtered by period-end +
 * 90-day reporting lag; historical price from Yahoo's chart API). For
 * each snapshot, computes fair value WITH and WITHOUT the TTM-EPS
 * outlier rule so the rule's contribution is visible.
 *
 * Outputs per-symbol CSV (one row per month-end) plus a per-symbol
 * Markdown report and a combined summary, all under tmp/backtest/.
 *
 * Usage:
 *   npm run backtest -- --symbols EIX,INCY,TGT,NVO,INTC
 *   npm run backtest -- --symbols EIX --years 6
 *
 * Caveats (called out in each report):
 *   - Restatement bias: today's `fundamentalsTimeSeries` rows include
 *     restatements not known at the original period.
 *   - Forward EPS not historically available — outlier rule's
 *     forward-corroboration check runs with `forward=null`, mapping to
 *     the conservative "no forward, treat spike as one-time" branch.
 *   - Peer industry classification taken from today's snapshot (no
 *     historical reclassification); peer market caps recomputed as-of
 *     each date.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import YahooFinance from "yahoo-finance2";
import type {
  AnnualPeriod,
  CompanySnapshot,
  Snapshot,
} from "@stockrank/core";
import {
  bootstrapMeanCi,
  classifyRow,
  fairValueFor,
  groupBy,
  mean,
  mulberry32,
  rank,
  wilsonInterval,
} from "@stockrank/ranking";
import type {
  CategoryScores,
  FairValue,
  Interval,
  RankedRow,
} from "@stockrank/ranking";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Reporting lag: SEC requires accelerated filers to file 10-K within
// 60 days of fiscal year-end and 10-Q within 40 days. We use slight
// buffers to reflect that actual filings can slip a few days. Earlier
// the constant was a single 90 days for both — overly conservative
// for the live snapshot's most recent quarter (Yahoo serves data as
// soon as it's filed, so 90d delay caused a back-test/production
// mismatch on the latest sample).
const ANNUAL_REPORTING_LAG_DAYS = 70;
const QUARTERLY_REPORTING_LAG_DAYS = 45;
const DEFAULT_YEARS = 4;
const PEER_GROUP_SIZE = 10;

type Args = {
  symbols: string[];
  years: number;
  outDir: string;
  snapshotPath: string;
  optionsSummaryPath: string;
  /** Map of subject symbol → manual peer list. Use for foreign ADRs and
   * other names not in the S&P 500 snapshot. Format: SYM:PEER1,PEER2 */
  peerOverrides: Record<string, string[]>;
  /** When true, after the existing engine-validation runs, also compute
   * forward-accuracy metrics per docs/specs/backtest.md §3. */
  accuracy: boolean;
  /** Forward-window horizons in years for the accuracy report. */
  horizons: number[];
  /** When true, also write the accuracy report to docs/ for posterity. */
  archive: boolean;
  /** Hypothetical assumed-options-premium yield (annualized %) to add to
   * gate-off Candidate realized returns. Only used to render an extra
   * "with overlay" section in accuracy.md — clearly labeled as hypothetical
   * because historical options chains aren't available. 0 (default) skips
   * the overlay section entirely. */
  optionsOverlayPct: number;
  /** When true, ignore --symbols and run the back-test against every
   * company in the loaded snapshot. Pre-pulls all unique histories
   * (subjects + their peers, deduped) to avoid the per-subject re-fetch. */
  allSp500: boolean;
  /** When true, ignore the on-disk Yahoo response cache and re-fetch
   * everything. Updated responses are written back to the cache.
   * Default false: cache is read-through, fetched-only-if-missing. */
  refreshCache: boolean;
  /** When true, fetch fresh from Yahoo BUT merge the new response
   * with the existing cache instead of overwriting. Used by
   * `npm run refresh-all` to update the cache without losing
   * historical dates that have aged out of Yahoo's rolling window
   * (e.g., fundamentals older than 5y). Mutually exclusive with
   * refreshCache (which overwrites). */
  mergeCache: boolean;
  /** Override the cache directory. Default: tmp/backtest-cache/ */
  cacheDir: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    symbols: [],
    years: DEFAULT_YEARS,
    outDir: resolve(process.cwd(), "tmp/backtest"),
    snapshotPath: resolve(process.cwd(), "public/data/snapshot-latest.json"),
    optionsSummaryPath: resolve(process.cwd(), "public/data/options-summary.json"),
    peerOverrides: {},
    accuracy: false,
    horizons: [1, 2, 3, 5],
    archive: false,
    optionsOverlayPct: 0,
    allSp500: false,
    refreshCache: false,
    mergeCache: false,
    cacheDir: resolve(process.cwd(), "tmp/backtest-cache"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--symbols") {
      if (!next) throw new Error("--symbols requires a comma-separated list");
      out.symbols = next.split(",").map((s) => s.trim().toUpperCase());
      i += 1;
    } else if (a === "--years") {
      if (!next) throw new Error("--years requires a number");
      out.years = parseInt(next, 10);
      i += 1;
    } else if (a === "--out") {
      if (!next) throw new Error("--out requires a path");
      out.outDir = resolve(next);
      i += 1;
    } else if (a === "--snapshot") {
      if (!next) throw new Error("--snapshot requires a path");
      out.snapshotPath = resolve(next);
      i += 1;
    } else if (a === "--options-summary") {
      if (!next) throw new Error("--options-summary requires a path");
      out.optionsSummaryPath = resolve(next);
      i += 1;
    } else if (a === "--peers") {
      // Repeatable: --peers NVO:LLY,JNJ,MRK,PFE,ABBV
      if (!next || !next.includes(":")) {
        throw new Error("--peers requires SYM:PEER1,PEER2 format");
      }
      const [subject, peerList] = next.split(":");
      out.peerOverrides[subject!.toUpperCase()] = peerList!
        .split(",")
        .map((s) => s.trim().toUpperCase());
      i += 1;
    } else if (a === "--accuracy") {
      out.accuracy = true;
    } else if (a === "--horizons") {
      if (!next) throw new Error("--horizons requires a comma-separated list of years");
      out.horizons = next.split(",").map((s) => {
        const n = parseInt(s.trim(), 10);
        if (!Number.isFinite(n) || n <= 0) throw new Error(`--horizons: invalid value "${s}"`);
        return n;
      });
      i += 1;
    } else if (a === "--archive") {
      out.archive = true;
    } else if (a === "--options-overlay-pct") {
      if (!next) throw new Error("--options-overlay-pct requires a number (annualized %)");
      const n = parseFloat(next);
      if (!Number.isFinite(n) || n < 0) throw new Error(`--options-overlay-pct: invalid value "${next}"`);
      out.optionsOverlayPct = n;
      i += 1;
    } else if (a === "--all-sp500") {
      out.allSp500 = true;
    } else if (a === "--refresh-cache") {
      out.refreshCache = true;
    } else if (a === "--merge-cache") {
      out.mergeCache = true;
    } else if (a === "--cache-dir") {
      if (!next) throw new Error("--cache-dir requires a path");
      out.cacheDir = resolve(next);
      i += 1;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (out.symbols.length === 0 && !out.allSp500) {
    throw new Error("usage: backtest (--symbols SYM[,SYM...] | --all-sp500) [--years N] [--peers SYM:P1,P2] [--accuracy] [--horizons 1,2,3,5] [--archive] [--options-overlay-pct N] [--refresh-cache | --merge-cache] [--cache-dir PATH]");
  }
  if (out.refreshCache && out.mergeCache) {
    throw new Error("--refresh-cache and --merge-cache are mutually exclusive (one overwrites, the other appends)");
  }
  return out;
}

// ─── Data fetch (with disk cache) ───────────────────────────────────────

type SymbolHistory = {
  symbol: string;
  meta: { name: string; sector: string; industry: string; currency: string };
  annual: AnnualPeriod[];
  /** Per-quarter fundamentals; drives TTM reconstruction in
   * buildSnapshotAtDate. May be empty on older caches; the snapshot
   * builder falls back to annual-as-TTM-proxy in that case. */
  quarterly: AnnualPeriod[];
  prices: Array<{ date: string; close: number; high?: number; low?: number }>;
};

/** Always pull this much chart history regardless of `--years`. The
 * fundamentals call is internally capped at ~5y by Yahoo anyway, so we
 * pull a 15y chart window so the cache is reusable across analyses with
 * different `--years` settings. */
const CACHE_CHART_YEARS = 15;

type CacheLayout = {
  fundamentals: string;
  fundamentalsQuarterly: string;
  chart: string;
  profile: string;
};

function cachePathsFor(cacheDir: string, symbol: string): CacheLayout {
  const root = resolve(cacheDir, symbol);
  return {
    fundamentals: resolve(root, "fundamentals.json"),
    fundamentalsQuarterly: resolve(root, "fundamentals-quarterly.json"),
    chart: resolve(root, "chart.json"),
    profile: resolve(root, "profile.json"),
  };
}

async function readCachedJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeCachedJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data), "utf8");
}

type FetchOptions = {
  cacheDir: string;
  refreshCache: boolean;
  mergeCache: boolean;
};

/**
 * Normalize a Yahoo date field (sometimes Date, sometimes ISO string
 * depending on whether the value came from a fresh fetch or a cache
 * round-trip) to an ISO yyyy-mm-dd key for merge comparisons.
 */
function toIsoDateKey(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

/**
 * Union by date — keep every period present in either old or fresh,
 * with fresh winning on conflicts (since Yahoo may have restated an
 * old period). Sort most-recent-first to match Yahoo's typical order.
 */
function mergeFundamentals(
  oldRows: Array<Record<string, unknown>> | null,
  fresh: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  if (!oldRows || oldRows.length === 0) return fresh;
  const map = new Map<string, Record<string, unknown>>();
  for (const row of oldRows) map.set(toIsoDateKey(row.date), row);
  for (const row of fresh) map.set(toIsoDateKey(row.date), row);
  return [...map.values()].sort(
    (a, b) => toIsoDateKey(b.date).localeCompare(toIsoDateKey(a.date)),
  );
}

type RawChartQuote = { date: Date | string; close: number | null; adjclose?: number | null; high?: number | null; low?: number | null };
type RawChart = { quotes?: RawChartQuote[] };

/**
 * Union chart quotes by date. Fresh wins on conflicts (adjclose gets
 * re-computed on every dividend/split event, so the fresh series is
 * the more accurate history). Oldest-first in the output to match
 * Yahoo's chart ordering.
 */
function mergeChart(oldChart: RawChart | null, fresh: RawChart): RawChart {
  if (!oldChart || !oldChart.quotes || oldChart.quotes.length === 0) return fresh;
  const map = new Map<string, RawChartQuote>();
  for (const q of oldChart.quotes) map.set(toIsoDateKey(q.date), q);
  for (const q of fresh.quotes ?? []) map.set(toIsoDateKey(q.date), q);
  const merged = [...map.values()].sort(
    (a, b) => toIsoDateKey(a.date).localeCompare(toIsoDateKey(b.date)),
  );
  return { ...fresh, quotes: merged };
}

/**
 * Pulls the three Yahoo endpoints for a symbol and maps to SymbolHistory.
 * On cache hit the network is skipped entirely; on miss (or refresh) the
 * raw API responses are persisted under <cacheDir>/<SYM>/{fundamentals,
 * chart, profile}.json so analysis-side iteration doesn't trigger
 * re-fetches.
 */
async function pullHistory(
  symbol: string,
  _years: number,
  options: FetchOptions,
): Promise<SymbolHistory> {
  const today = new Date();
  const period1 = new Date(today.getFullYear() - CACHE_CHART_YEARS, 0, 1);
  const yahooSymbol = symbol.replace(/\./g, "-");
  const paths = cachePathsFor(options.cacheDir, symbol);

  // The cache-policy logic is the same for all three endpoints:
  //   refreshCache  → ignore cache, fetch fresh, overwrite
  //   mergeCache    → preserve old cache, fetch fresh, write the union
  //                   (so old dates aged out of Yahoo's window stick)
  //   default       → read cache if present, fetch only on miss

  // ---- Fundamentals (annual time series) ----
  let fundamentalsRaw: Array<Record<string, unknown>> | null;
  if (options.refreshCache) {
    fundamentalsRaw = null;
  } else if (options.mergeCache) {
    // Skip the cache-read for fetch-decision (we always fetch in merge
    // mode), but the merge step below reads the old cache.
    fundamentalsRaw = null;
  } else {
    fundamentalsRaw = await readCachedJson<Array<Record<string, unknown>>>(paths.fundamentals);
  }
  if (!fundamentalsRaw) {
    const fresh = (await yf.fundamentalsTimeSeries(yahooSymbol, {
      period1: period1.toISOString().slice(0, 10),
      type: "annual",
      module: "all",
    })) as unknown as Array<Record<string, unknown>>;
    if (options.mergeCache) {
      const oldCache = await readCachedJson<Array<Record<string, unknown>>>(paths.fundamentals);
      fundamentalsRaw = mergeFundamentals(oldCache, fresh);
    } else {
      fundamentalsRaw = fresh;
    }
    await writeCachedJson(paths.fundamentals, fundamentalsRaw);
  }

  // ---- Fundamentals (quarterly time series) ----
  // Same cache-policy logic as annual. Quarterly is required for the
  // back-test's TTM reconstruction (sum of trailing 4 quarters);
  // without it, buildSnapshotAtDate falls back to annual-as-TTM-proxy.
  let fundamentalsQuarterlyRaw: Array<Record<string, unknown>> | null;
  if (options.refreshCache || options.mergeCache) {
    fundamentalsQuarterlyRaw = null;
  } else {
    fundamentalsQuarterlyRaw = await readCachedJson<Array<Record<string, unknown>>>(paths.fundamentalsQuarterly);
  }
  if (!fundamentalsQuarterlyRaw) {
    try {
      const fresh = (await yf.fundamentalsTimeSeries(yahooSymbol, {
        period1: period1.toISOString().slice(0, 10),
        type: "quarterly",
        module: "all",
      })) as unknown as Array<Record<string, unknown>>;
      if (options.mergeCache) {
        const oldCache = await readCachedJson<Array<Record<string, unknown>>>(paths.fundamentalsQuarterly);
        fundamentalsQuarterlyRaw = mergeFundamentals(oldCache, fresh);
      } else {
        fundamentalsQuarterlyRaw = fresh;
      }
      await writeCachedJson(paths.fundamentalsQuarterly, fundamentalsQuarterlyRaw);
    } catch {
      // Quarterly fetch is optional — back-test gracefully falls back
      // to annual-as-TTM-proxy when this is empty.
      fundamentalsQuarterlyRaw = [];
    }
  }

  // ---- Chart (daily prices, adjusted close) ----
  let chartRaw: RawChart | null;
  if (options.refreshCache || options.mergeCache) {
    chartRaw = null;
  } else {
    chartRaw = await readCachedJson<RawChart>(paths.chart);
  }
  if (!chartRaw) {
    const fresh = (await yf.chart(yahooSymbol, {
      period1,
      period2: today,
      interval: "1d",
    })) as unknown as RawChart;
    if (options.mergeCache) {
      const oldCache = await readCachedJson<RawChart>(paths.chart);
      chartRaw = mergeChart(oldCache, fresh);
    } else {
      chartRaw = fresh;
    }
    await writeCachedJson(paths.chart, chartRaw);
  }

  // ---- Profile (asset profile + price) ----
  // No merge needed — profile is metadata, not a time series. Always
  // overwrite when fetching.
  type RawProfile = {
    assetProfile?: { sector?: string; industry?: string };
    price?: { longName?: string; shortName?: string; currency?: string };
  };
  let profileRaw: RawProfile | null;
  if (options.refreshCache || options.mergeCache) {
    profileRaw = null;
  } else {
    profileRaw = await readCachedJson<RawProfile>(paths.profile);
  }
  if (!profileRaw) {
    profileRaw = (await yf.quoteSummary(yahooSymbol, {
      modules: ["assetProfile", "price"],
    })) as unknown as RawProfile;
    await writeCachedJson(paths.profile, profileRaw);
  }

  // ---- Map cached/fetched responses to SymbolHistory ----
  // q.date can be a Date object (fresh fetch) or an ISO string (cache
  // hit, since JSON serialization converts Date → string). Handle both.
  const prices = (chartRaw.quotes ?? [])
    .filter((q): q is RawChartQuote & { close: number } => q.close != null)
    .map((q) => {
      const dateIso = q.date instanceof Date
        ? q.date.toISOString().slice(0, 10)
        : String(q.date).slice(0, 10);
      // Capture high/low when present so buildSnapshotAtDate can
      // populate priceHighInYear / priceLowInYear on each annual
      // period. Daily chart bars from Yahoo include intraday
      // high/low; cache round-trip preserves them as numbers.
      return {
        date: dateIso,
        close: q.adjclose ?? q.close,
        ...(q.high != null ? { high: q.high } : {}),
        ...(q.low != null ? { low: q.low } : {}),
      };
    });

  const annual = fundamentalsRaw
    .map((row) => mapAnnualRow(row))
    .filter((r): r is AnnualPeriod => r !== null)
    .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1));

  const quarterly = (fundamentalsQuarterlyRaw ?? [])
    .map((row) => mapAnnualRow(row))
    .filter((r): r is AnnualPeriod => r !== null)
    .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1));

  return {
    symbol,
    meta: {
      name: profileRaw.price?.longName ?? profileRaw.price?.shortName ?? symbol,
      sector: profileRaw.assetProfile?.sector ?? "Unknown",
      industry: profileRaw.assetProfile?.industry ?? "Unknown",
      currency: profileRaw.price?.currency ?? "USD",
    },
    annual,
    quarterly,
    prices,
  };
}

function n(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function mapAnnualRow(row: Record<string, unknown>): AnnualPeriod | null {
  const date = row["date"];
  const periodEndDate =
    date instanceof Date ? date.toISOString().slice(0, 10)
    : typeof date === "string" ? date.slice(0, 10)
    : null;
  if (!periodEndDate) return null;
  const ebit = n(row["EBIT"]) ?? n(row["operatingIncome"]);
  const ebitda = n(row["EBITDA"])
    ?? n(row["normalizedEBITDA"])
    ?? (ebit !== null && n(row["reconciledDepreciation"]) !== null
      ? ebit + (n(row["reconciledDepreciation"])!)
      : null);
  return {
    fiscalYear: periodEndDate.slice(0, 4),
    periodEndDate,
    filingDate: null,
    reportedCurrency: "USD",
    // Populated later in buildSnapshotAtDate where the price chart is
    // available; the raw mapping from Yahoo's fundamentalsTimeSeries
    // doesn't carry historical price.
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: n(row["totalRevenue"]),
      grossProfit: n(row["grossProfit"]),
      operatingIncome: n(row["operatingIncome"]),
      ebit,
      ebitda,
      interestExpense: n(row["interestExpense"]),
      netIncome: n(row["netIncome"]),
      epsDiluted: n(row["dilutedEPS"]),
      sharesDiluted: n(row["dilutedAverageShares"]),
    },
    balance: {
      cash: n(row["cashAndCashEquivalents"]),
      totalCurrentAssets: n(row["currentAssets"]),
      totalCurrentLiabilities: n(row["currentLiabilities"]),
      totalDebt: n(row["totalDebt"]),
      totalEquity: n(row["stockholdersEquity"]),
    },
    cashFlow: {
      operatingCashFlow: n(row["operatingCashFlow"]),
      capex: n(row["capitalExpenditure"]),
      freeCashFlow: n(row["freeCashFlow"]),
      dividendsPaid: n(row["cashDividendsPaid"]),
      buybacks: n(row["repurchaseOfCapitalStock"]),
    },
    ratios: { roic: null, netDebtToEbitda: null, currentRatio: null },
  };
}

// ─── Point-in-time simulation ────────────────────────────────────────────

function priceAtOrBefore(history: SymbolHistory, dateIso: string): number | null {
  // prices are date-ascending; walk down to find last close <= date
  for (let i = history.prices.length - 1; i >= 0; i -= 1) {
    if (history.prices[i]!.date <= dateIso) return history.prices[i]!.close;
  }
  return null;
}

function annualPublicAsOf(history: SymbolHistory, dateIso: string): AnnualPeriod[] {
  const cutoff = addDays(dateIso, -ANNUAL_REPORTING_LAG_DAYS);
  return history.annual.filter((p) => p.periodEndDate <= cutoff);
}

function quarterlyPublicAsOf(history: SymbolHistory, dateIso: string): AnnualPeriod[] {
  const cutoff = addDays(dateIso, -QUARTERLY_REPORTING_LAG_DAYS);
  return history.quarterly.filter((p) => p.periodEndDate <= cutoff);
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Reconstruct trailing-12-month aggregates from the four most-recent
 * public quarters. Income and cash-flow values are summed; balance-
 * sheet values are point-in-time (use the most recent quarter's value).
 *
 * Returns null if fewer than 4 quarters of usable data — caller falls
 * back to annual-as-TTM-proxy.
 */
type TtmAggregate = {
  income: AnnualPeriod["income"];
  balance: AnnualPeriod["balance"];
  cashFlow: AnnualPeriod["cashFlow"];
};
function reconstructTtmFromQuarters(quarterly: AnnualPeriod[]): TtmAggregate | null {
  // newest first
  const sorted = [...quarterly].sort((a, b) =>
    a.periodEndDate < b.periodEndDate ? 1 : -1,
  );
  if (sorted.length < 4) return null;
  const trailing = sorted.slice(0, 4);
  // Sum a nullable income/CF field across the 4 quarters; null if any
  // quarter is missing the field (partial data → fall back).
  const sumIncome = (k: keyof AnnualPeriod["income"]): number | null => {
    let total = 0;
    let havePartial = false;
    for (const q of trailing) {
      const v = q.income[k];
      if (v === null || v === undefined) { havePartial = true; continue; }
      total += v;
    }
    return havePartial ? null : total;
  };
  const sumCashFlow = (k: keyof AnnualPeriod["cashFlow"]): number | null => {
    let total = 0;
    let havePartial = false;
    for (const q of trailing) {
      const v = q.cashFlow[k];
      if (v === null || v === undefined) { havePartial = true; continue; }
      total += v;
    }
    return havePartial ? null : total;
  };
  return {
    income: {
      revenue: sumIncome("revenue"),
      grossProfit: sumIncome("grossProfit"),
      operatingIncome: sumIncome("operatingIncome"),
      ebit: sumIncome("ebit"),
      ebitda: sumIncome("ebitda"),
      interestExpense: sumIncome("interestExpense"),
      netIncome: sumIncome("netIncome"),
      epsDiluted: sumIncome("epsDiluted"),
      // Shares are point-in-time, not summed.
      sharesDiluted: trailing[0]!.income.sharesDiluted,
    },
    balance: trailing[0]!.balance,
    cashFlow: {
      operatingCashFlow: sumCashFlow("operatingCashFlow"),
      capex: sumCashFlow("capex"),
      freeCashFlow: sumCashFlow("freeCashFlow"),
      dividendsPaid: sumCashFlow("dividendsPaid"),
      buybacks: sumCashFlow("buybacks"),
    },
  };
}

function buildSnapshotAtDate(
  history: SymbolHistory,
  dateIso: string,
): CompanySnapshot | null {
  const annualPublic = annualPublicAsOf(history, dateIso);
  if (annualPublic.length === 0) return null;
  const price = priceAtOrBefore(history, dateIso);
  if (price === null) return null;
  // Populate priceAtYearEnd / priceHighInYear / priceLowInYear on
  // each annual period from the chart cache so the FV engine's
  // own-historical anchors capture both the year-end snapshot AND
  // the in-year range (3 sample points per period instead of 1).
  const annual = annualPublic.map((p) => {
    const fyEnd = p.periodEndDate;
    const fyStartDate = new Date(`${fyEnd}T00:00:00.000Z`);
    fyStartDate.setUTCFullYear(fyStartDate.getUTCFullYear() - 1);
    const fyStart = fyStartDate.toISOString().slice(0, 10);
    let high: number | null = null;
    let low: number | null = null;
    for (const bar of history.prices) {
      if (bar.date < fyStart || bar.date > fyEnd) continue;
      const barHigh = bar.high ?? bar.close;
      const barLow = bar.low ?? bar.close;
      if (high === null || barHigh > high) high = barHigh;
      if (low === null || barLow < low) low = barLow;
    }
    return {
      ...p,
      priceAtYearEnd: priceAtOrBefore(history, fyEnd),
      priceHighInYear: high,
      priceLowInYear: low,
    };
  });

  // TTM via quarterly reconstruction (sum trailing 4 quarters for
  // income + cash flow, point-in-time for balance) when quarterly
  // data is available; otherwise fall back to annual[0] as the
  // TTM proxy. This matches what Yahoo's defaultKeyStatistics
  // provides for the live snapshot, eliminating the
  // back-test-vs-production divergence on TTM-derived ratios.
  const quarterlyPublic = quarterlyPublicAsOf(history, dateIso);
  const ttmFromQ = reconstructTtmFromQuarters(quarterlyPublic);
  const recent = annual[0]!;
  // `ttmRecent` is the TTM-shape source (income/balance/cashflow)
  // used to compute the spot ratios below. It either uses real
  // trailing-12-month aggregates (preferred) or falls back to
  // annual[0]. Both produce the same SHAPE — the difference is the
  // numerical aggregation window.
  const ttmRecent = ttmFromQ ?? {
    income: recent.income,
    balance: recent.balance,
    cashFlow: recent.cashFlow,
  };

  const shares = ttmRecent.income.sharesDiluted ?? null;
  const marketCap = shares !== null ? shares * price : 0;
  const eps = ttmRecent.income.epsDiluted ?? null;
  const ebitda = ttmRecent.income.ebitda ?? null;
  const fcf = ttmRecent.cashFlow.freeCashFlow ?? null;
  const equity = ttmRecent.balance.totalEquity ?? null;
  const debt = ttmRecent.balance.totalDebt ?? null;
  const cash = ttmRecent.balance.cash ?? null;
  const netIncome = ttmRecent.income.netIncome ?? null;
  const dividendsPaid = ttmRecent.cashFlow.dividendsPaid ?? null;
  const tca = ttmRecent.balance.totalCurrentAssets ?? null;
  const tcl = ttmRecent.balance.totalCurrentLiabilities ?? null;
  const investedCapital = (equity ?? 0) + (debt ?? 0) - (cash ?? 0);

  const peRatio = eps !== null && eps > 0 ? price / eps : null;
  const evToEbitda =
    ebitda !== null && ebitda > 0
      ? (marketCap + (debt ?? 0) - (cash ?? 0)) / ebitda
      : null;
  const priceToFcf =
    fcf !== null && fcf > 0 && shares !== null && shares > 0
      ? price / (fcf / shares)
      : null;
  const priceToBook =
    equity !== null && equity > 0 && shares !== null && shares > 0
      ? price / (equity / shares)
      : null;

  // Compute the four ratios that Yahoo provides on its `defaultKeyStatistics`
  // module live but that we can't ask for at a historical date. Used to be
  // hardcoded to null, which had a hidden consequence: ROIC is the SOLE
  // factor in the Quality category, so a null ROIC nulls Quality entirely,
  // which sets missingCategoryCount ≥ 1, which makes classifyRow return
  // "watch" instead of "ranked" — so candidateGateOff was *structurally*
  // false for every back-test snapshot. These approximations match the
  // standard textbook formulas; they'll diverge slightly from Yahoo's
  // proprietary methodology but are within tolerance for ranking purposes.
  const roic = netIncome !== null && investedCapital > 0 ? netIncome / investedCapital : null;
  const dividendYield = dividendsPaid !== null && marketCap > 0 ? dividendsPaid / marketCap : null;
  const currentRatio = tca !== null && tcl !== null && tcl > 0 ? tca / tcl : null;
  const netDebtToEbitda = ebitda !== null && ebitda > 0 ? ((debt ?? 0) - (cash ?? 0)) / ebitda : null;

  return {
    symbol: history.symbol,
    name: history.meta.name,
    sector: history.meta.sector,
    industry: history.meta.industry,
    exchange: "NYSE",
    marketCap,
    currency: history.meta.currency,
    quoteCurrency: history.meta.currency,
    quote: { price, yearHigh: price, yearLow: price, volume: 0, averageVolume: 0 },
    ttm: {
      peRatio,
      evToEbitda,
      priceToFcf,
      priceToBook,
      dividendYield,
      currentRatio,
      netDebtToEbitda,
      roic,
      earningsYield: peRatio ? 1 / peRatio : null,
      fcfYield: priceToFcf ? 1 / priceToFcf : null,
      enterpriseValue: marketCap + (debt ?? 0) - (cash ?? 0),
      investedCapital,
      forwardEps: null,
    },
    annual,
    pctOffYearHigh: 0,
  };
}

// ─── Month-end iterator ──────────────────────────────────────────────────

function monthEnds(years: number): string[] {
  const out: string[] = [];
  const today = new Date();
  const cursor = new Date(today.getFullYear() - years, today.getMonth(), 1);
  while (cursor < today) {
    // last day of cursor's month
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    out.push(lastDay.toISOString().slice(0, 10));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// ─── Per-symbol back-test ────────────────────────────────────────────────

type BacktestRow = {
  date: string;
  actualPrice: number;
  fvP25: number | null;
  fvMedian: number | null;
  fvP75: number | null;
  upsideToP25Pct: number | null;
  fvNaiveP25: number | null;
  fvNaiveMedian: number | null;
  fvNaiveP75: number | null;
  outlierFired: boolean;
  ebitdaNormalized: boolean;
  peerCohortDivergent: boolean;
  confidence: "high" | "medium" | "low" | null;
  ruleEffect: number | null;  // (fvNaive.median - fv.median) — positive when rule pulled FV down
  // Bucket classification at this date. Two views per spec §6 #4:
  //  - candidateGateOff: would be a Candidate ignoring options-liquidity
  //  - candidateTodayLiquid: same AND symbol passes today's options-liquid gate
  candidateGateOff: boolean;
  // candidateTodayLiquid is filled in later (in computeAccuracyRows) since
  // it depends on a today-liquid set that's loaded once per run, not per-symbol.
};

/**
 * Compute one BacktestRow for a single (subject, date) pair given
 * the pre-built universe at that date. Pure-ish — depends on the FV
 * engine and the bucket classifier, no I/O.
 */
function backtestRowAt(
  date: string,
  subject: CompanySnapshot,
  universe: CompanySnapshot[],
  rankedAtDate: ReturnType<typeof rank>,
): BacktestRow {
  const fv = fairValueFor(subject, universe);
  const fvNaive = fairValueFor(subject, universe, { skipOutlierRule: true });
  const ruleEffect = fv.range && fvNaive.range
    ? fvNaive.range.median - fv.range.median
    : null;

  // Reuse the per-date rank() output (computed once for the whole
  // universe) instead of re-ranking per subject — saves N×N work.
  const rankedRow = [...rankedAtDate.rows, ...rankedAtDate.ineligibleRows]
    .find((r) => r.symbol === subject.symbol);
  let candidateGateOff = false;
  if (rankedRow) {
    const augmented: RankedRow = {
      ...rankedRow,
      fairValue: fv,
      optionsLiquid: true, // gate-off — see spec Decision 4
    };
    candidateGateOff = classifyRow(augmented) === "ranked";
  }

  return {
    date,
    actualPrice: subject.quote.price,
    fvP25: fv.range?.p25 ?? null,
    fvMedian: fv.range?.median ?? null,
    fvP75: fv.range?.p75 ?? null,
    upsideToP25Pct: fv.upsideToP25Pct,
    fvNaiveP25: fvNaive.range?.p25 ?? null,
    fvNaiveMedian: fvNaive.range?.median ?? null,
    fvNaiveP75: fvNaive.range?.p75 ?? null,
    outlierFired: fv.ttmTreatment === "normalized",
    ebitdaNormalized: fv.ebitdaTreatment === "normalized",
    peerCohortDivergent: fv.peerCohortDivergent,
    confidence: fv.range ? fv.confidence : null,
    ruleEffect,
    candidateGateOff,
  };
}

// ─── Output ──────────────────────────────────────────────────────────────

function rowsToCsv(rows: BacktestRow[]): string {
  const headers = [
    "date",
    "actualPrice",
    "fvP25",
    "fvMedian",
    "fvP75",
    "upsideToP25Pct",
    "fvNaiveP25",
    "fvNaiveMedian",
    "fvNaiveP75",
    "outlierFired",
    "ebitdaNormalized",
    "peerCohortDivergent",
    "confidence",
    "ruleEffect",
    "candidateGateOff",
  ];
  const fmt = (v: number | null | boolean | string) =>
    v === null ? "" : typeof v === "boolean" ? (v ? "1" : "0")
    : typeof v === "string" ? v : v.toFixed(2);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.date,
      fmt(r.actualPrice),
      fmt(r.fvP25), fmt(r.fvMedian), fmt(r.fvP75),
      fmt(r.upsideToP25Pct),
      fmt(r.fvNaiveP25), fmt(r.fvNaiveMedian), fmt(r.fvNaiveP75),
      fmt(r.outlierFired),
      fmt(r.ebitdaNormalized),
      fmt(r.peerCohortDivergent),
      fmt(r.confidence),
      fmt(r.ruleEffect),
      fmt(r.candidateGateOff),
    ].join(","));
  }
  return lines.join("\n");
}

function symbolReport(
  symbol: string,
  history: SymbolHistory,
  peers: string[],
  rows: BacktestRow[],
): string {
  const firedCount = rows.filter((r) => r.outlierFired).length;
  const firedPct = rows.length > 0 ? (firedCount / rows.length) * 100 : 0;
  const meanRuleEffect = rows
    .filter((r) => r.ruleEffect !== null)
    .map((r) => r.ruleEffect!);
  const avgEffect = meanRuleEffect.length > 0
    ? meanRuleEffect.reduce((s, v) => s + v, 0) / meanRuleEffect.length
    : 0;
  const maxEffect = meanRuleEffect.length > 0 ? Math.max(...meanRuleEffect) : 0;

  // Sample timeline — pick 6 evenly spaced points
  const sampleIdxs = rows.length === 0
    ? []
    : Array.from({ length: Math.min(8, rows.length) }, (_, i) =>
        Math.floor((i / Math.max(1, Math.min(8, rows.length) - 1)) * (rows.length - 1)));
  const samples = Array.from(new Set(sampleIdxs)).map((i) => rows[i]!);

  const fmt = (v: number | null) => (v === null ? "—" : `$${v.toFixed(2)}`);
  const pct = (v: number | null) =>
    v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const sampleTable = samples
    .map((s) => `| ${s.date} | ${fmt(s.actualPrice)} | ${fmt(s.fvP25)} | ${fmt(s.fvMedian)} | ${fmt(s.fvP75)} | ${pct(s.upsideToP25Pct)} | ${s.outlierFired ? "✓" : ""} | ${fmt(s.fvNaiveMedian)} |`)
    .join("\n");

  return `## ${symbol} — ${history.meta.name}

- Industry: ${history.meta.industry}
- Peer cohort (${peers.length}): ${peers.join(", ")}
- Snapshots: ${rows.length} month-ends over the back-test window
- Outlier rule fired: ${firedCount} / ${rows.length} snapshots (${firedPct.toFixed(0)}%)
- Average rule effect on FV median: ${avgEffect >= 0 ? "+" : ""}$${avgEffect.toFixed(2)} (positive = rule pulled FV down vs naive)
- Maximum rule effect (single snapshot): $${maxEffect.toFixed(2)}

### Sample timeline

| Date | Price | FV p25 | FV median | FV p75 | Upside p25 | Outlier | Naive median |
|---|---|---|---|---|---|---|---|
${sampleTable}

`;
}

// ─── Accuracy mode (Phase 2 — see docs/specs/backtest.md) ───────────────

/**
 * One row per (symbol × snapshot date × forward horizon). Long format
 * per spec §6 #1. windowComplete=false rows are kept (so per-symbol
 * CSVs are inspectable) but excluded from aggregations.
 */
type AccuracyRow = {
  symbol: string;
  date: string;
  horizon: number;
  // From the source BacktestRow
  priceAtT: number;
  fvP25: number | null;
  fvMedian: number | null;
  fvP75: number | null;
  upsideToP25Pct: number | null;
  confidence: "high" | "medium" | "low" | null;
  outlierFired: boolean;
  ebitdaNormalized: boolean;
  peerCohortDivergent: boolean;
  candidateGateOff: boolean;
  candidateTodayLiquid: boolean;
  // Forward window
  windowComplete: boolean;
  priceAtHorizon: number | null;
  peakInWindow: number | null;
  troughInWindow: number | null;
  realizedReturnPct: number | null;
  // Three baselines: SPY (cap-weight S&P 500), RSP (equal-weight S&P 500
  // — strips Mag7 concentration), VTV (Vanguard Value — style benchmark).
  // The gap between excessVsSpy and excessVsRsp tells us how much of the
  // model's underperformance is "Mag7 dominated the index" vs everything
  // else. Beating VTV means the stock-picking generates real alpha over
  // a buy-the-style ETF.
  spyReturnPct: number | null;
  excessVsSpyPct: number | null;
  rspReturnPct: number | null;
  excessVsRspPct: number | null;
  vtvReturnPct: number | null;
  excessVsVtvPct: number | null;
  // Hits
  endpointHitP25: boolean | null;
  endpointHitMedian: boolean | null;
  endpointHitP75: boolean | null;
  peakHitP25: boolean | null;
  peakHitMedian: boolean | null;
  peakHitP75: boolean | null;
};

function loadTodayLiquidSet(path: string): Set<string> {
  try {
    const raw = readFileSync(path, "utf8");
    const summary = JSON.parse(raw) as {
      symbols: Record<string, { bestCallAnnualized: number | null; bestPutAnnualized: number | null }>;
    };
    const out = new Set<string>();
    for (const [sym, info] of Object.entries(summary.symbols)) {
      if (info.bestCallAnnualized !== null && info.bestPutAnnualized !== null) {
        out.add(sym);
      }
    }
    return out;
  } catch {
    return new Set();
  }
}

function priceAtOrAfter(history: SymbolHistory, dateIso: string): { date: string; close: number } | null {
  for (const p of history.prices) {
    if (p.date >= dateIso) return p;
  }
  return null;
}

function priceWindowExtremes(
  history: SymbolHistory,
  startIso: string,
  endIso: string,
): { peak: number; trough: number } | null {
  let peak = -Infinity;
  let trough = Infinity;
  for (const p of history.prices) {
    if (p.date < startIso || p.date > endIso) continue;
    if (p.close > peak) peak = p.close;
    if (p.close < trough) trough = p.close;
  }
  if (peak === -Infinity) return null;
  return { peak, trough };
}

function addYears(dateIso: string, years: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeAccuracyRows(
  symbol: string,
  source: BacktestRow[],
  subjectHistory: SymbolHistory,
  baselines: { spy: SymbolHistory; rsp: SymbolHistory | null; vtv: SymbolHistory | null },
  todayLiquidSet: Set<string>,
  horizons: number[],
): AccuracyRow[] {
  const today = todayIsoUtc();
  const out: AccuracyRow[] = [];
  const isTodayLiquid = todayLiquidSet.has(symbol);

  function baselineExcess(
    history: SymbolHistory | null,
    startDate: string,
    endDate: string,
    realizedPct: number | null,
  ): { ret: number | null; excess: number | null } {
    if (!history || realizedPct === null) return { ret: null, excess: null };
    const start = priceAtOrAfter(history, startDate);
    const end = priceAtOrAfter(history, endDate);
    if (!start || !end || start.close <= 0) return { ret: null, excess: null };
    const ret = ((end.close - start.close) / start.close) * 100;
    return { ret, excess: realizedPct - ret };
  }

  for (const r of source) {
    const spyAtT = priceAtOrAfter(baselines.spy, r.date);
    if (!spyAtT) continue;

    for (const horizon of horizons) {
      const horizonDate = addYears(r.date, horizon);
      const windowComplete = horizonDate <= today;

      let priceAtHorizon: number | null = null;
      let peakInWindow: number | null = null;
      let troughInWindow: number | null = null;
      let realizedReturnPct: number | null = null;
      let spyReturnPct: number | null = null;
      let excessVsSpyPct: number | null = null;
      let rspReturnPct: number | null = null;
      let excessVsRspPct: number | null = null;
      let vtvReturnPct: number | null = null;
      let excessVsVtvPct: number | null = null;
      let endpointHitP25: boolean | null = null;
      let endpointHitMedian: boolean | null = null;
      let endpointHitP75: boolean | null = null;
      let peakHitP25: boolean | null = null;
      let peakHitMedian: boolean | null = null;
      let peakHitP75: boolean | null = null;

      if (windowComplete) {
        const subjectAt = priceAtOrAfter(subjectHistory, horizonDate);
        const extremes = priceWindowExtremes(subjectHistory, r.date, horizonDate);
        if (subjectAt && extremes) {
          priceAtHorizon = subjectAt.close;
          peakInWindow = extremes.peak;
          troughInWindow = extremes.trough;
          realizedReturnPct = ((subjectAt.close - r.actualPrice) / r.actualPrice) * 100;

          const spy = baselineExcess(baselines.spy, r.date, horizonDate, realizedReturnPct);
          spyReturnPct = spy.ret;
          excessVsSpyPct = spy.excess;
          const rsp = baselineExcess(baselines.rsp, r.date, horizonDate, realizedReturnPct);
          rspReturnPct = rsp.ret;
          excessVsRspPct = rsp.excess;
          const vtv = baselineExcess(baselines.vtv, r.date, horizonDate, realizedReturnPct);
          vtvReturnPct = vtv.ret;
          excessVsVtvPct = vtv.excess;

          if (r.fvP25 !== null) {
            endpointHitP25 = subjectAt.close >= r.fvP25;
            peakHitP25 = extremes.peak >= r.fvP25;
          }
          if (r.fvMedian !== null) {
            endpointHitMedian = subjectAt.close >= r.fvMedian;
            peakHitMedian = extremes.peak >= r.fvMedian;
          }
          if (r.fvP75 !== null) {
            endpointHitP75 = subjectAt.close >= r.fvP75;
            peakHitP75 = extremes.peak >= r.fvP75;
          }
        }
      }

      out.push({
        symbol,
        date: r.date,
        horizon,
        priceAtT: r.actualPrice,
        fvP25: r.fvP25,
        fvMedian: r.fvMedian,
        fvP75: r.fvP75,
        upsideToP25Pct: r.upsideToP25Pct,
        confidence: r.confidence,
        outlierFired: r.outlierFired,
        ebitdaNormalized: r.ebitdaNormalized,
        peerCohortDivergent: r.peerCohortDivergent,
        candidateGateOff: r.candidateGateOff,
        candidateTodayLiquid: r.candidateGateOff && isTodayLiquid,
        windowComplete,
        priceAtHorizon,
        peakInWindow,
        troughInWindow,
        realizedReturnPct,
        spyReturnPct,
        excessVsSpyPct,
        rspReturnPct,
        excessVsRspPct,
        vtvReturnPct,
        excessVsVtvPct,
        endpointHitP25,
        endpointHitMedian,
        endpointHitP75,
        peakHitP25,
        peakHitMedian,
        peakHitP75,
      });
    }
  }
  return out;
}

function accuracyToCsv(rows: AccuracyRow[]): string {
  const headers = [
    "symbol", "date", "horizon",
    "priceAtT", "fvP25", "fvMedian", "fvP75", "upsideToP25Pct",
    "confidence", "outlierFired", "ebitdaNormalized", "peerCohortDivergent",
    "candidateGateOff", "candidateTodayLiquid", "windowComplete",
    "priceAtHorizon", "peakInWindow", "troughInWindow",
    "realizedReturnPct",
    "spyReturnPct", "excessVsSpyPct",
    "rspReturnPct", "excessVsRspPct",
    "vtvReturnPct", "excessVsVtvPct",
    "endpointHitP25", "endpointHitMedian", "endpointHitP75",
    "peakHitP25", "peakHitMedian", "peakHitP75",
  ];
  const fmt = (v: number | null | boolean | string) =>
    v === null ? ""
    : typeof v === "boolean" ? (v ? "1" : "0")
    : typeof v === "string" ? v
    : v.toFixed(4);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.symbol, r.date, r.horizon.toString(),
      fmt(r.priceAtT), fmt(r.fvP25), fmt(r.fvMedian), fmt(r.fvP75),
      fmt(r.upsideToP25Pct),
      fmt(r.confidence), fmt(r.outlierFired), fmt(r.ebitdaNormalized), fmt(r.peerCohortDivergent),
      fmt(r.candidateGateOff), fmt(r.candidateTodayLiquid), fmt(r.windowComplete),
      fmt(r.priceAtHorizon), fmt(r.peakInWindow), fmt(r.troughInWindow),
      fmt(r.realizedReturnPct),
      fmt(r.spyReturnPct), fmt(r.excessVsSpyPct),
      fmt(r.rspReturnPct), fmt(r.excessVsRspPct),
      fmt(r.vtvReturnPct), fmt(r.excessVsVtvPct),
      fmt(r.endpointHitP25), fmt(r.endpointHitMedian), fmt(r.endpointHitP75),
      fmt(r.peakHitP25), fmt(r.peakHitMedian), fmt(r.peakHitP75),
    ].join(","));
  }
  return lines.join("\n");
}

// ─── Aggregation ─────────────────────────────────────────────────────────

const MIN_SAMPLE_SIZE = 30;

type Aggregate = {
  n: number;
  endpointHitP25: number | null;
  endpointHitP25Ci: Interval | null;
  endpointHitMedian: number | null;
  endpointHitMedianCi: Interval | null;
  endpointHitP75: number | null;
  endpointHitP75Ci: Interval | null;
  meanRealized: number | null;
  meanRealizedCi: Interval | null;
  meanExcessVsSpy: number | null;
  meanExcessVsSpyCi: Interval | null;
  meanExcessVsRsp: number | null;
  meanExcessVsRspCi: Interval | null;
  meanExcessVsVtv: number | null;
  meanExcessVsVtvCi: Interval | null;
};

function aggregate(rows: AccuracyRow[]): Aggregate {
  const eligible = rows.filter((r) => r.windowComplete);
  const n = eligible.length;
  if (n === 0) return emptyAggregate();

  const hitRate = (pluck: (r: AccuracyRow) => boolean | null) => {
    const valid = eligible.map(pluck).filter((v): v is boolean => v !== null);
    if (valid.length < MIN_SAMPLE_SIZE) return { rate: null as number | null, ci: null as Interval | null };
    const successes = valid.filter((v) => v).length;
    return { rate: successes / valid.length, ci: wilsonInterval(successes, valid.length) };
  };

  const meanWithCi = (pluck: (r: AccuracyRow) => number | null) => {
    const vals = eligible.map(pluck).filter((v): v is number => v !== null);
    if (vals.length < MIN_SAMPLE_SIZE) return { m: null as number | null, ci: null as Interval | null };
    return { m: mean(vals), ci: bootstrapMeanCi(vals, 1000, 0.05, mulberry32(42)) };
  };

  const p25 = hitRate((r) => r.endpointHitP25);
  const med = hitRate((r) => r.endpointHitMedian);
  const p75 = hitRate((r) => r.endpointHitP75);
  const realized = meanWithCi((r) => r.realizedReturnPct);
  const spy = meanWithCi((r) => r.excessVsSpyPct);
  const rsp = meanWithCi((r) => r.excessVsRspPct);
  const vtv = meanWithCi((r) => r.excessVsVtvPct);

  return {
    n,
    endpointHitP25: p25.rate,
    endpointHitP25Ci: p25.ci,
    endpointHitMedian: med.rate,
    endpointHitMedianCi: med.ci,
    endpointHitP75: p75.rate,
    endpointHitP75Ci: p75.ci,
    meanRealized: realized.m,
    meanRealizedCi: realized.ci,
    meanExcessVsSpy: spy.m,
    meanExcessVsSpyCi: spy.ci,
    meanExcessVsRsp: rsp.m,
    meanExcessVsRspCi: rsp.ci,
    meanExcessVsVtv: vtv.m,
    meanExcessVsVtvCi: vtv.ci,
  };
}

function emptyAggregate(): Aggregate {
  return {
    n: 0,
    endpointHitP25: null, endpointHitP25Ci: null,
    endpointHitMedian: null, endpointHitMedianCi: null,
    endpointHitP75: null, endpointHitP75Ci: null,
    meanRealized: null, meanRealizedCi: null,
    meanExcessVsSpy: null, meanExcessVsSpyCi: null,
    meanExcessVsRsp: null, meanExcessVsRspCi: null,
    meanExcessVsVtv: null, meanExcessVsVtvCi: null,
  };
}

/**
 * Per spec §3.8, the headline number deduplicates to one snapshot per
 * (symbol, calendar year) — picks the FIRST snapshot in each year that
 * has a complete forward window for ALL horizons in this run. Mechanical
 * rule, no cherry-picking. Returns the same shape (long: per snapshot
 * per horizon).
 */
function dedupeYearly(rows: AccuracyRow[], _horizons: number[]): AccuracyRow[] {
  // PER-HORIZON dedup. Each (symbol, year, horizon) contributes one
  // observation — the FIRST date in the year that's a gate-off
  // Candidate (preferred), falling back to the first FV-valid date.
  // The dedup runs separately per horizon because Candidate dates that
  // complete a 1y window may not complete a 3y window (T+3y > today),
  // so requiring "all horizons complete" would always exclude recent
  // Candidates from H3 verdicts entirely.
  //
  // Conceptual interpretation per horizon: "for symbol X in year Y,
  // what's the first action the strategy would have taken that year
  // (Candidate entry if any, otherwise hold), and what was the
  // realized N-year forward return on that action?"
  const out: AccuracyRow[] = [];
  const byHorizon = groupBy(rows, (r) => r.horizon);
  for (const [, horizonRows] of byHorizon) {
    const bySymbolYear = groupBy(horizonRows, (r) => `${r.symbol}|${r.date.slice(0, 4)}`);
    for (const [, group] of bySymbolYear) {
      const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
      // Pass 1: first Candidate date with windowComplete + FV.
      let chosen: AccuracyRow | null = null;
      for (const r of sorted) {
        if (r.windowComplete && r.fvP25 !== null && r.candidateGateOff) {
          chosen = r;
          break;
        }
      }
      // Pass 2: fall back to first FV-valid date with windowComplete.
      if (!chosen) {
        for (const r of sorted) {
          if (r.windowComplete && r.fvP25 !== null) {
            chosen = r;
            break;
          }
        }
      }
      if (chosen) out.push(chosen);
    }
  }
  return out;
}

// ─── Report rendering ────────────────────────────────────────────────────

const HEADLINE_HORIZONS = (rows: AccuracyRow[]): number[] =>
  [...new Set(rows.map((r) => r.horizon))].sort((a, b) => a - b);

function fmtRate(rate: number | null, ci: Interval | null): string {
  if (rate === null) return "—";
  const ciStr = ci ? ` (${(ci.lo * 100).toFixed(0)}–${(ci.hi * 100).toFixed(0)}%)` : "";
  return `${(rate * 100).toFixed(0)}%${ciStr}`;
}

function fmtMean(m: number | null, ci: Interval | null): string {
  if (m === null) return "—";
  const ciStr = ci ? ` (${ci.lo.toFixed(1)}…${ci.hi.toFixed(1)})` : "";
  const sign = m >= 0 ? "+" : "";
  return `${sign}${m.toFixed(1)}%${ciStr}`;
}

function aggregateTable(label: string, rows: AccuracyRow[]): string {
  const horizons = HEADLINE_HORIZONS(rows);
  const lines: string[] = [];
  lines.push(`### ${label}`);
  lines.push("");
  lines.push("| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const h of horizons) {
    const sub = rows.filter((r) => r.horizon === h);
    const a = aggregate(sub);
    lines.push(`| ${h}y | ${a.n} | ${fmtRate(a.endpointHitP25, a.endpointHitP25Ci)} | ${fmtRate(a.endpointHitMedian, a.endpointHitMedianCi)} | ${fmtRate(a.endpointHitP75, a.endpointHitP75Ci)} | ${fmtMean(a.meanRealized, a.meanRealizedCi)} | ${fmtMean(a.meanExcessVsSpy, a.meanExcessVsSpyCi)} | ${fmtMean(a.meanExcessVsRsp, a.meanExcessVsRspCi)} | ${fmtMean(a.meanExcessVsVtv, a.meanExcessVsVtvCi)} |`);
  }
  return lines.join("\n") + "\n";
}

function stratifiedTable(
  label: string,
  rows: AccuracyRow[],
  bucketKey: (r: AccuracyRow) => string,
  bucketOrder?: string[],
): string {
  const horizons = HEADLINE_HORIZONS(rows);
  const lines: string[] = [];
  lines.push(`### ${label}`);
  lines.push("");
  lines.push("| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  const grouped = groupBy(rows, bucketKey);
  const keys = bucketOrder
    ? bucketOrder.filter((k) => grouped.has(k))
    : [...grouped.keys()].sort();
  for (const k of keys) {
    const stratumRows = grouped.get(k)!;
    for (const h of horizons) {
      const sub = stratumRows.filter((r) => r.horizon === h);
      const a = aggregate(sub);
      lines.push(`| ${k} | ${h}y | ${a.n} | ${fmtRate(a.endpointHitP25, a.endpointHitP25Ci)} | ${fmtRate(a.endpointHitMedian, a.endpointHitMedianCi)} | ${fmtMean(a.meanRealized, a.meanRealizedCi)} | ${fmtMean(a.meanExcessVsSpy, a.meanExcessVsSpyCi)} | ${fmtMean(a.meanExcessVsRsp, a.meanExcessVsRspCi)} | ${fmtMean(a.meanExcessVsVtv, a.meanExcessVsVtvCi)} |`);
    }
  }
  return lines.join("\n") + "\n";
}

// ─── Hypothesis verdicts (H1–H6 in spec) ─────────────────────────────────

type Verdict = "pass" | "fail" | "inconclusive";

type HypothesisResult = { id: string; statement: string; verdict: Verdict; evidence: string };

function verdictForHitRate(
  agg: Aggregate,
  threshold: number,
  pluckCi: (a: Aggregate) => Interval | null,
  pluckRate: (a: Aggregate) => number | null,
): Verdict {
  const ci = pluckCi(agg);
  const rate = pluckRate(agg);
  if (rate === null || ci === null) return "inconclusive";
  if (ci.lo >= threshold) return "pass";
  if (ci.hi < threshold) return "fail";
  return "inconclusive";
}

function verdictForExcess(
  meanExcess: number | null,
  ci: Interval | null,
): Verdict {
  if (meanExcess === null || ci === null) return "inconclusive";
  if (ci.lo > 0) return "pass";
  if (ci.hi < 0) return "fail";
  return "inconclusive";
}

function evaluateHypotheses(yearly: AccuracyRow[]): HypothesisResult[] {
  const results: HypothesisResult[] = [];

  // H1: positive-p25-upside names hit p25 within 3y at ≥ 60%
  const positiveUpside3y = yearly.filter(
    (r) => r.horizon === 3 && r.upsideToP25Pct !== null && r.upsideToP25Pct > 0,
  );
  const h1Agg = aggregate(positiveUpside3y);
  const h1Verdict = verdictForHitRate(
    h1Agg, 0.60,
    (a) => a.endpointHitP25Ci, (a) => a.endpointHitP25,
  );
  results.push({
    id: "H1",
    statement: "Names with positive p25 upside reach p25 within 3y at ≥ 60%",
    verdict: h1Verdict,
    evidence: `n=${h1Agg.n}, hit p25 = ${fmtRate(h1Agg.endpointHitP25, h1Agg.endpointHitP25Ci)} (threshold: 60%)`,
  });

  // H2: positive-median names reach median within 3y (any positive rate)
  const positiveMedian3y = yearly.filter(
    (r) => r.horizon === 3 && r.fvMedian !== null && r.priceAtT < r.fvMedian,
  );
  const h2Agg = aggregate(positiveMedian3y);
  const h2Verdict = verdictForHitRate(
    h2Agg, 0.50,
    (a) => a.endpointHitMedianCi, (a) => a.endpointHitMedian,
  );
  results.push({
    id: "H2",
    statement: "Names with positive median upside reach median within 3y at ≥ 50%",
    verdict: h2Verdict,
    evidence: `n=${h2Agg.n}, hit median = ${fmtRate(h2Agg.endpointHitMedian, h2Agg.endpointHitMedianCi)} (threshold: 50%)`,
  });

  // H3 fans out across three baselines AND every requested horizon, so
  // we can tell how much of the model's excess return is "we beat the
  // cap-weighted index" vs the tougher tests "we beat the equal-
  // weighted version (no Mag7 concentration tailwind)" and "we beat
  // the value style itself" — and at which time horizons each holds.
  const horizonsInData = HEADLINE_HORIZONS(yearly);
  for (const h of horizonsInData) {
    const candidates = yearly.filter((r) => r.horizon === h && r.candidateGateOff);
    const agg = aggregate(candidates);
    results.push({
      id: `H3-SPY-${h}y`,
      statement: `Candidates (gate-off) beat SPY (cap-weight) over ${h}y on average`,
      verdict: verdictForExcess(agg.meanExcessVsSpy, agg.meanExcessVsSpyCi),
      evidence: `n=${agg.n}, mean excess vs SPY = ${fmtMean(agg.meanExcessVsSpy, agg.meanExcessVsSpyCi)}`,
    });
    results.push({
      id: `H3-RSP-${h}y`,
      statement: `Candidates (gate-off) beat RSP (equal-weight S&P 500) over ${h}y on average`,
      verdict: verdictForExcess(agg.meanExcessVsRsp, agg.meanExcessVsRspCi),
      evidence: `n=${agg.n}, mean excess vs RSP = ${fmtMean(agg.meanExcessVsRsp, agg.meanExcessVsRspCi)}`,
    });
    results.push({
      id: `H3-VTV-${h}y`,
      statement: `Candidates (gate-off) beat VTV (Vanguard Value) over ${h}y on average`,
      verdict: verdictForExcess(agg.meanExcessVsVtv, agg.meanExcessVsVtvCi),
      evidence: `n=${agg.n}, mean excess vs VTV = ${fmtMean(agg.meanExcessVsVtv, agg.meanExcessVsVtvCi)}`,
    });
  }

  // H4: snapshots where outlier rule fired have BETTER mean excess than naive
  const fired3y = yearly.filter((r) => r.horizon === 3 && r.outlierFired);
  const notFired3y = yearly.filter((r) => r.horizon === 3 && !r.outlierFired);
  const firedAgg = aggregate(fired3y);
  const notFiredAgg = aggregate(notFired3y);
  let h4Verdict: Verdict = "inconclusive";
  let h4Evidence = `fired: n=${firedAgg.n}, excess=${fmtMean(firedAgg.meanExcessVsSpy, firedAgg.meanExcessVsSpyCi)}; not-fired: n=${notFiredAgg.n}, excess=${fmtMean(notFiredAgg.meanExcessVsSpy, notFiredAgg.meanExcessVsSpyCi)}`;
  if (firedAgg.meanExcessVsSpy !== null && notFiredAgg.meanExcessVsSpy !== null) {
    if (firedAgg.meanExcessVsSpyCi && notFiredAgg.meanExcessVsSpyCi) {
      if (firedAgg.meanExcessVsSpy >= notFiredAgg.meanExcessVsSpy) h4Verdict = "pass";
      else h4Verdict = "fail";
    }
  }
  results.push({
    id: "H4",
    statement: "Outlier-rule-fired snapshots have ≥ excess return (vs SPY) as not-fired snapshots (3y)",
    verdict: h4Verdict,
    evidence: h4Evidence,
  });

  // H5: high-confidence rows have a tighter realized-return distribution (smaller CI width)
  const highConf3y = yearly.filter((r) => r.horizon === 3 && r.confidence === "high");
  const lowConf3y = yearly.filter((r) => r.horizon === 3 && r.confidence === "low");
  const highAgg = aggregate(highConf3y);
  const lowAgg = aggregate(lowConf3y);
  let h5Verdict: Verdict = "inconclusive";
  let h5Evidence = `high: n=${highAgg.n}, realized=${fmtMean(highAgg.meanRealized, highAgg.meanRealizedCi)}; low: n=${lowAgg.n}, realized=${fmtMean(lowAgg.meanRealized, lowAgg.meanRealizedCi)}`;
  if (highAgg.meanRealizedCi && lowAgg.meanRealizedCi) {
    const highWidth = highAgg.meanRealizedCi.hi - highAgg.meanRealizedCi.lo;
    const lowWidth = lowAgg.meanRealizedCi.hi - lowAgg.meanRealizedCi.lo;
    if (highWidth < lowWidth) h5Verdict = "pass";
    else h5Verdict = "fail";
  }
  results.push({
    id: "H5",
    statement: "High-confidence snapshots have a tighter realized-return CI than low-confidence (3y)",
    verdict: h5Verdict,
    evidence: h5Evidence,
  });

  // H6: divergent-cohort flagged names have WORSE accuracy than non-divergent
  const divergent3y = yearly.filter((r) => r.horizon === 3 && r.peerCohortDivergent);
  const stable3y = yearly.filter((r) => r.horizon === 3 && !r.peerCohortDivergent);
  const divAgg = aggregate(divergent3y);
  const stableAgg = aggregate(stable3y);
  let h6Verdict: Verdict = "inconclusive";
  let h6Evidence = `divergent: n=${divAgg.n}, hit p25=${fmtRate(divAgg.endpointHitP25, divAgg.endpointHitP25Ci)}; stable: n=${stableAgg.n}, hit p25=${fmtRate(stableAgg.endpointHitP25, stableAgg.endpointHitP25Ci)}`;
  if (divAgg.endpointHitP25 !== null && stableAgg.endpointHitP25 !== null) {
    if (divAgg.endpointHitP25 < stableAgg.endpointHitP25) h6Verdict = "pass";
    else h6Verdict = "fail";
  }
  results.push({
    id: "H6",
    statement: "Peer-cohort-divergent snapshots have worse p25 accuracy than non-divergent (3y)",
    verdict: h6Verdict,
    evidence: h6Evidence,
  });

  return results;
}

/**
 * Apply a hypothetical options-overlay yield to a row's realized
 * return: realizedReturn += overlayAnnualPct × horizonYears, with the
 * three excess fields recomputed against the unchanged baseline
 * returns. Used to render a "with overlay" section that estimates
 * strategy P&L when historical options data isn't available.
 *
 * Applied to ALL snapshots with non-null realized return — the
 * interpretation is "what would performance look like if we ran a
 * disciplined covered-call/CSP overlay on these names." Filtering to
 * gate-off Candidates would be more strategy-aligned but produces
 * empty tables on small/curated universes where the Candidate
 * classifier rarely fires; once a Phase 2b run uses the full S&P 500
 * universe, the per-stratum tables already show the Candidate-only
 * view, so this section's universal application is the more useful
 * complement.
 */
function applyOverlay(rows: AccuracyRow[], overlayAnnualPct: number): AccuracyRow[] {
  if (overlayAnnualPct <= 0) return rows;
  return rows.map((r) => {
    if (r.realizedReturnPct === null) return r;
    const bump = overlayAnnualPct * r.horizon;
    const newRealized = r.realizedReturnPct + bump;
    return {
      ...r,
      realizedReturnPct: newRealized,
      excessVsSpyPct: r.spyReturnPct === null ? null : newRealized - r.spyReturnPct,
      excessVsRspPct: r.rspReturnPct === null ? null : newRealized - r.rspReturnPct,
      excessVsVtvPct: r.vtvReturnPct === null ? null : newRealized - r.vtvReturnPct,
    };
  });
}

function renderAccuracyReport(
  allRows: AccuracyRow[],
  horizons: number[],
  symbolsLabel: string,
  years: number,
  optionsOverlayPct: number,
): string {
  const yearly = dedupeYearly(allRows, horizons);
  const verdicts = evaluateHypotheses(yearly);

  const lines: string[] = [];
  lines.push("# Back-test accuracy report");
  lines.push("");
  lines.push(`Generated ${todayIsoUtc()} by \`scripts/backtest.ts --accuracy\`. Universe: ${symbolsLabel}. Window: ${years}y of monthly snapshots.`);
  lines.push("");
  lines.push("> **Survivorship-bias caveat.** This run uses today's S&P 500 universe. Names that went bankrupt, were acquired, or got dropped from the index are silently excluded. Realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr in S&P over multi-year windows). Treat absolute hit rates as ceilings, not point estimates.");
  lines.push("");
  lines.push("> **Forward-EPS unavailable.** The outlier rule's forward-corroboration check runs with `forward = null` historically, mapping to the conservative branch (treat spike as one-time). Real-time accuracy may be modestly different.");
  lines.push("");
  lines.push("## Hypothesis verdicts");
  lines.push("");
  for (const v of verdicts) {
    const badge = v.verdict === "pass" ? "✓ pass" : v.verdict === "fail" ? "✗ fail" : "? inconclusive";
    lines.push(`- **${v.id}** — ${v.statement} → **${badge}**`);
    lines.push(`  - ${v.evidence}`);
  }
  lines.push("");
  lines.push("## Headline (yearly-deduped — one snapshot per symbol per year)");
  lines.push("");
  lines.push(aggregateTable("All snapshots (gate-off Candidates included or not)", yearly));
  lines.push("");
  lines.push(stratifiedTable("By gate-off Candidate flag", yearly, (r) => r.candidateGateOff ? "Candidate (gate-off)" : "Non-candidate", ["Candidate (gate-off)", "Non-candidate"]));
  lines.push("");
  lines.push(stratifiedTable("By today-liquid Candidate flag (gap vs gate-off quantifies options-liquidity gate's selection)", yearly, (r) => r.candidateTodayLiquid ? "Candidate (today-liquid)" : "Non-candidate", ["Candidate (today-liquid)", "Non-candidate"]));
  lines.push("");
  lines.push(stratifiedTable("By outlier-rule fired", yearly, (r) => r.outlierFired ? "Outlier fired" : "TTM trusted", ["Outlier fired", "TTM trusted"]));
  lines.push("");
  lines.push(stratifiedTable("By confidence label", yearly, (r) => r.confidence ?? "(none)", ["high", "medium", "low", "(none)"]));
  lines.push("");
  lines.push(stratifiedTable("By peer-cohort divergent", yearly, (r) => r.peerCohortDivergent ? "Divergent" : "Stable", ["Divergent", "Stable"]));
  lines.push("");
  lines.push("## Sensitivity (every monthly snapshot — overstates effective N by ~12×)");
  lines.push("");
  lines.push(aggregateTable("All monthly snapshots", allRows));
  lines.push("");

  if (optionsOverlayPct > 0) {
    const overlayYearly = applyOverlay(yearly, optionsOverlayPct);
    const overlayMonthly = applyOverlay(allRows, optionsOverlayPct);
    lines.push(`## With assumed +${optionsOverlayPct}%/yr options overlay`);
    lines.push("");
    lines.push(`> **Hypothetical.** Yahoo doesn't expose historical option chains, so we can't measure actual covered-call / cash-secured-put income from prior dates. This section adds a fixed **+${optionsOverlayPct}% annualized** to every snapshot's realized return and recomputes excess returns against the same baselines. Interpretation: "what would performance look like if we ran a disciplined covered-call / CSP overlay on these names." Conservative single-anchor LEAPS overlays in the literature land in the 3–6% range; sweep the flag to test sensitivity. (The earlier Candidate-stratum tables show the same overlay applied only to Candidate snapshots when N is large enough to populate them.)`);
    lines.push("");
    lines.push(aggregateTable("Headline (yearly-deduped) with overlay", overlayYearly));
    lines.push("");
    lines.push(aggregateTable("Sensitivity (monthly) with overlay", overlayMonthly));
    lines.push("");
  }

  lines.push("**Baselines.** *SPY* = SPDR S&P 500 ETF (cap-weighted, total return) — what most investors compare to. *RSP* = Invesco S&P 500 Equal Weight ETF — strips Mag7 concentration; the gap (excess vs SPY) − (excess vs RSP) quantifies how much underperformance is the index's top-heavy concentration. *VTV* = Vanguard Value ETF — large-cap value style; beating it means stock-picking generates real alpha over a buy-the-style ETF.");
  lines.push("");
  lines.push("Hit-rate CIs are Wilson 95%; mean-return CIs are 1000-resample bootstrap with seeded RNG. Strata with N < 30 show \"—\".");
  return lines.join("\n");
}
// ─── Driver ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadSnapshot(path: string): Promise<Snapshot> {
  return JSON.parse(await readFile(path, "utf8")) as Snapshot;
}

type FoundPeers = { peers: string[]; cohortLevel: "industry" | "sector" | "none" };

function findPeers(snapshot: Snapshot, subject: string, n: number): FoundPeers {
  const subjectCo = snapshot.companies.find((c) => c.symbol === subject);
  if (!subjectCo) return { peers: [], cohortLevel: "none" };

  // Prefer same-industry peers (production behavior), but for thin
  // industries (AAPL is the only Consumer Electronics name in S&P 500;
  // XOM/CVX are the only Oil & Gas Integrated names), fall back to the
  // broader sector so the back-test still produces snapshots. Mirrors
  // the production cohortResolver's industry → sector fallback.
  const sameIndustry = snapshot.companies
    .filter((c) => c.symbol !== subject && c.industry === subjectCo.industry)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, n);
  if (sameIndustry.length >= 2) {
    return { peers: sameIndustry.map((c) => c.symbol), cohortLevel: "industry" };
  }

  const sameSector = snapshot.companies
    .filter((c) => c.symbol !== subject && c.sector === subjectCo.sector)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, n);
  if (sameSector.length >= 2) {
    return { peers: sameSector.map((c) => c.symbol), cohortLevel: "sector" };
  }

  return { peers: [], cohortLevel: "none" };
}

type SymbolBacktest = {
  symbol: string;
  history: SymbolHistory;
  peerSymbols: string[];
  rows: BacktestRow[];
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });

  const snapshot = await loadSnapshot(args.snapshotPath);
  const fetchOptions: FetchOptions = {
    cacheDir: args.cacheDir,
    refreshCache: args.refreshCache,
    mergeCache: args.mergeCache,
  };

  // When --all-sp500: subjects = every name in the snapshot. Otherwise
  // subjects = explicit --symbols list. Either way, peers are resolved
  // from the snapshot via findPeers (industry → sector fallback).
  const subjects: string[] = args.allSp500
    ? snapshot.companies.map((c) => c.symbol).sort()
    : args.symbols;
  const subjectsHeader = args.allSp500
    ? `all S&P 500 (${subjects.length})`
    : subjects.join(", ");
  console.log(`stockRank backtest — ${subjectsHeader} over ${args.years}y${args.accuracy ? " [accuracy mode]" : ""}`);

  // ---- Pre-resolve peer lists for every subject so we know the full
  // unique-symbol set to pre-pull.
  type SubjectPlan = { symbol: string; peerSymbols: string[]; cohortLevel: string };
  const plans: SubjectPlan[] = [];
  const skipReasons: string[] = [];
  for (const symbol of subjects) {
    if (args.peerOverrides[symbol]) {
      plans.push({ symbol, peerSymbols: args.peerOverrides[symbol]!, cohortLevel: "manual" });
      continue;
    }
    const found = findPeers(snapshot, symbol, PEER_GROUP_SIZE);
    if (found.peers.length === 0) {
      const reason = !snapshot.companies.find((c) => c.symbol === symbol)
        ? `${symbol}: not in snapshot`
        : `${symbol}: no industry/sector peers`;
      skipReasons.push(reason);
      continue;
    }
    plans.push({ symbol, peerSymbols: found.peers, cohortLevel: found.cohortLevel });
  }
  if (skipReasons.length > 0) {
    console.log(`\nskipping ${skipReasons.length} symbol(s) without peers (use --peers SYM:P1,P2 to override):`);
    if (skipReasons.length <= 10) {
      for (const r of skipReasons) console.log(`  - ${r}`);
    } else {
      for (const r of skipReasons.slice(0, 10)) console.log(`  - ${r}`);
      console.log(`  - …and ${skipReasons.length - 10} more`);
    }
  }

  // ---- Pre-pull all unique histories once. Peer overlap across
  // subjects in the same industry can multiply naive pull counts by
  // 5-10×; deduping cuts a 5500-pull naive run on full S&P 500 down
  // to ~500 unique pulls.
  const uniqueSymbols = new Set<string>();
  for (const p of plans) {
    uniqueSymbols.add(p.symbol);
    for (const peer of p.peerSymbols) uniqueSymbols.add(peer);
  }
  const cache = new Map<string, SymbolHistory | null>();
  const cacheStatus = args.refreshCache
    ? "refresh-cache mode (forced re-fetch, overwrite)"
    : args.mergeCache
    ? "merge-cache mode (forced re-fetch, union with existing)"
    : "cache-hit reads skip the network";
  console.log(`\npre-pulling ${uniqueSymbols.size} unique histories — ${cacheStatus}...`);
  let pulled = 0;
  let failed = 0;
  let cacheHits = 0;
  for (const sym of uniqueSymbols) {
    // Detect cache hit so we can skip the rate-limit sleep entirely.
    // Both refreshCache and mergeCache always fetch, so cache hits are
    // only possible in default mode.
    const paths = cachePathsFor(args.cacheDir, sym);
    const wouldHitCache =
      !args.refreshCache && !args.mergeCache &&
      (await readCachedJson<unknown>(paths.fundamentals)) !== null &&
      (await readCachedJson<unknown>(paths.fundamentalsQuarterly)) !== null &&
      (await readCachedJson<unknown>(paths.chart)) !== null &&
      (await readCachedJson<unknown>(paths.profile)) !== null;
    try {
      const h = await pullHistory(sym, args.years, fetchOptions);
      cache.set(sym, h);
      pulled += 1;
      if (wouldHitCache) cacheHits += 1;
    } catch (err) {
      cache.set(sym, null);
      failed += 1;
      if (failed <= 10) {
        console.warn(`  ! ${sym}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if ((pulled + failed) % 50 === 0) {
      console.log(`  ${pulled + failed}/${uniqueSymbols.size} (${failed} failed, ${cacheHits} cache hits)...`);
    }
    if (!wouldHitCache) {
      await sleep(200); // throttle real Yahoo calls only
    }
  }
  console.log(`  done — ${pulled} ok, ${failed} failed, ${cacheHits} from cache`);

  const summarySections: string[] = [];
  const allBacktests: SymbolBacktest[] = [];

  // ---- Inverted loop: dates outside, subjects inside.
  //
  // Per-date we build the FULL universe (every cached symbol's snapshot
  // at that date) once, then call rank() and fairValueFor against that
  // wide universe for each subject. This matches what the production
  // engine produces from the live snapshot — same cohort resolver, same
  // peer set, same FV math. Earlier the back-test used a narrow per-
  // subject cohort (top-10 industry peers) which gave systematically
  // different numbers from production for industry-specific peer
  // distributions (LULU was the canonical case: back-test p25 $408 vs
  // production p25 $220).
  //
  // Cost: per-date universe build is O(|cached|) buildSnapshotAtDate
  // calls (cheap, no I/O). One rank() per date on the wide universe
  // (~50ms × ~50 dates = ~2.5s). Per-subject FV compute is O(|cached|)
  // per call (~5ms × 498 subjects × 50 dates = ~2 min). Tractable on
  // a populated cache.
  console.log(`\nrunning back-test (inverted loop, full-universe cohort)...`);
  const dates = monthEnds(args.years);
  const planSymbols = new Set(plans.map((p) => p.symbol));
  const rowsBySymbol = new Map<string, BacktestRow[]>();

  let dateCount = 0;
  for (const date of dates) {
    const universe: CompanySnapshot[] = [];
    for (const [, history] of cache) {
      if (!history) continue;
      const snap = buildSnapshotAtDate(history, date);
      if (snap) universe.push(snap);
    }
    if (universe.length < 3) continue;

    let rankedAtDate: ReturnType<typeof rank>;
    try {
      rankedAtDate = rank({ companies: universe, snapshotDate: date });
    } catch {
      continue;
    }

    for (const subject of universe) {
      if (!planSymbols.has(subject.symbol)) continue;
      const row = backtestRowAt(date, subject, universe, rankedAtDate);
      let rows = rowsBySymbol.get(subject.symbol);
      if (!rows) {
        rows = [];
        rowsBySymbol.set(subject.symbol, rows);
      }
      rows.push(row);
    }

    dateCount += 1;
    if (dateCount % 12 === 0) {
      console.log(`  processed ${dateCount}/${dates.length} dates (universe size at this date: ${universe.length})`);
    }
  }
  console.log(`  done — ${dateCount}/${dates.length} dates processed`);

  // ---- Write per-symbol artifacts.
  for (const plan of plans) {
    const symbol = plan.symbol;
    const subjectHistory = cache.get(symbol);
    if (!subjectHistory) continue;
    const rows = rowsBySymbol.get(symbol) ?? [];
    if (rows.length === 0) continue;

    const csv = rowsToCsv(rows);
    const csvPath = resolve(args.outDir, `${symbol}.csv`);
    await writeFile(csvPath, csv, "utf8");

    const md = symbolReport(symbol, subjectHistory, plan.peerSymbols, rows);
    const mdPath = resolve(args.outDir, `${symbol}.md`);
    await writeFile(mdPath, md, "utf8");
    summarySections.push(md);

    allBacktests.push({ symbol, history: subjectHistory, peerSymbols: plan.peerSymbols, rows });
  }
  console.log(`back-tested ${allBacktests.length}/${plans.length} subjects`);

  const summary = `# Back-test report

Generated by \`scripts/backtest.ts\` over ${args.years} years of monthly
snapshots. For each symbol, fair value was recomputed at every month-end
using only data that would have been public at that date (annual
fundamentals filtered by period-end + ${ANNUAL_REPORTING_LAG_DAYS}d (annual) / ${QUARTERLY_REPORTING_LAG_DAYS}d (quarterly) reporting
lag). Two variants per snapshot:

- **With outlier rule** — current production logic (peer-median P/E
  anchor falls back to prior-3y mean EPS when TTM looks like a
  one-time spike).
- **Without outlier rule** ("naive") — peer-median P/E anchor uses raw
  TTM EPS regardless.

The "rule effect" column captures \`naive median − with-rule median\`:
positive numbers mean the rule pulled the projected fair value down
(defending against an inflated TTM), zero means the rule didn't fire.

**Caveats:**
- *Restatement bias*: today's annual rows reflect any restatements
  published since.
- *Forward-EPS unavailable*: the outlier rule's forward-corroboration
  check runs with \`forward = null\`, mapping to the conservative
  branch (treat spike as one-time).
- *Industry classification*: peers are taken from today's snapshot
  (no historical reclassification); their market caps are recomputed
  per-date.

---

${summarySections.join("\n")}
`;

  await writeFile(resolve(args.outDir, "summary.md"), summary, "utf8");
  console.log(`\nwrote ${args.outDir}/summary.md`);

  if (args.accuracy && allBacktests.length > 0) {
    console.log("\n=== accuracy mode ===");
    const maxHorizon = Math.max(...args.horizons);
    const baselineYears = args.years + maxHorizon;
    console.log(`pulling baselines (${baselineYears}y window): SPY, RSP, VTV...`);
    let spyHistory: SymbolHistory;
    try {
      spyHistory = await pullHistory("SPY", baselineYears, fetchOptions);
      console.log(`  SPY: ${spyHistory.prices.length} price bars`);
    } catch (err) {
      console.error(`  SPY pull failed: ${err instanceof Error ? err.message : err}`);
      console.error("  skipping accuracy report");
      return;
    }
    let rspHistory: SymbolHistory | null = null;
    try {
      rspHistory = await pullHistory("RSP", baselineYears, fetchOptions);
      console.log(`  RSP: ${rspHistory.prices.length} price bars`);
    } catch (err) {
      console.warn(`  RSP pull failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
    let vtvHistory: SymbolHistory | null = null;
    try {
      vtvHistory = await pullHistory("VTV", baselineYears, fetchOptions);
      console.log(`  VTV: ${vtvHistory.prices.length} price bars`);
    } catch (err) {
      console.warn(`  VTV pull failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
    const todayLiquid = loadTodayLiquidSet(args.optionsSummaryPath);
    console.log(`  today-liquid set: ${todayLiquid.size} symbols`);

    const allAccuracy: AccuracyRow[] = [];
    for (const bt of allBacktests) {
      const accRows = computeAccuracyRows(
        bt.symbol, bt.rows, bt.history,
        { spy: spyHistory, rsp: rspHistory, vtv: vtvHistory },
        todayLiquid, args.horizons,
      );
      allAccuracy.push(...accRows);
      const accCsv = accuracyToCsv(accRows);
      const accCsvPath = resolve(args.outDir, `${bt.symbol}-accuracy.csv`);
      await writeFile(accCsvPath, accCsv, "utf8");
      console.log(`  wrote ${accCsvPath} (${accRows.length} rows)`);
    }

    const universeLabel = args.allSp500
      ? `full S&P 500 (${allBacktests.length} names)`
      : args.symbols.join(", ");
    const report = renderAccuracyReport(allAccuracy, args.horizons, universeLabel, args.years, args.optionsOverlayPct);
    const reportPath = resolve(args.outDir, "accuracy.md");
    await writeFile(reportPath, report, "utf8");
    console.log(`\nwrote ${reportPath}`);

    if (args.archive) {
      const archivePath = resolve(process.cwd(), `docs/backtest-accuracy-${todayIsoUtc()}.md`);
      await writeFile(archivePath, report, "utf8");
      console.log(`wrote archive: ${archivePath}`);
    }
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
