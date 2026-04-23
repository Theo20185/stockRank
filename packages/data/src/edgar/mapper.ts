import type {
  AnnualBalance,
  AnnualCashFlow,
  AnnualIncome,
  AnnualPeriod,
  AnnualRatios,
  QuarterlyPeriod,
} from "@stockrank/core";

/** Monthly/daily price bar used by the price-decoration helpers.
 * Same shape the Yahoo provider already builds from `chart()`. */
export type HistoricalBar = {
  date: string;
  close: number;
  high: number | null;
  low: number | null;
};
import {
  annualMap,
  balanceMap,
  BUYBACKS_CONCEPTS,
  CAPEX_CONCEPTS,
  CASH_CONCEPTS,
  COST_OF_REVENUE_CONCEPTS,
  CURRENT_ASSETS_CONCEPTS,
  CURRENT_LIABILITIES_CONCEPTS,
  DA_CONCEPTS,
  deriveQ4FromAnnual,
  DIVIDENDS_CONCEPTS,
  EPS_CONCEPTS,
  extractStandaloneQuarters,
  firstAvailable,
  GROSS_PROFIT_CONCEPTS,
  INTEREST_EXPENSE_CONCEPTS,
  LONG_TERM_DEBT_CONCEPTS,
  LONG_TERM_DEBT_CURRENT_CONCEPTS,
  LONG_TERM_DEBT_NONCURRENT_CONCEPTS,
  NET_INCOME_CONCEPTS,
  OPERATING_CASH_FLOW_CONCEPTS,
  OPERATING_INCOME_CONCEPTS,
  quarterlyMap,
  REVENUE_CONCEPTS,
  SHARES_CONCEPTS,
  SHORT_TERM_DEBT_CONCEPTS,
  STOCKHOLDERS_EQUITY_CONCEPTS,
} from "./concepts.js";
import type { EdgarCompanyFacts, EdgarFact } from "./types.js";

const EMPTY_RATIOS: AnnualRatios = {
  roic: null,
  netDebtToEbitda: null,
  currentRatio: null,
};

/** Default reporting currency. EDGAR companyfacts unit codes
 * disambiguate (USD vs CAD) but for S&P 500 names this is always USD.
 * If we ever extend beyond US-domiciled issuers, swap to deriving from
 * the unit key. */
const DEFAULT_REPORTING_CURRENCY = "USD";

/** How many fiscal years to retain in the mapped output. Engine needs
 * 5y for own-historical anchors + normalized 5y averages — 7 gives a
 * safety buffer without bloating the snapshot. EDGAR cache keeps the
 * full ~18y history on disk for back-test / sparkline use. */
export const DEFAULT_MAX_ANNUAL_PERIODS = 7;

/** Trailing-12-month TTM reconstruction needs 4 quarters; back-test
 * sparkline samples at quarterly cadence over a few years; 12 is
 * comfortably above both. */
export const DEFAULT_MAX_QUARTERLY_PERIODS = 12;

export type MapOptions = {
  /** Override the annual truncation cap. Set to Infinity to disable. */
  maxAnnualPeriods?: number;
  /** Override the quarterly truncation cap. Set to Infinity to disable. */
  maxQuarterlyPeriods?: number;
};

type PeriodKey = "annual" | "quarterly";

/**
 * Build per-period maps for every concept the engine needs. Caller
 * picks one period-end date and gathers a full panel by indexing each
 * map.
 */
type IncomeMaps = {
  revenue: Map<string, EdgarFact>;
  cogs: Map<string, EdgarFact>;
  grossProfit: Map<string, EdgarFact>;
  operatingIncome: Map<string, EdgarFact>;
  netIncome: Map<string, EdgarFact>;
  epsDiluted: Map<string, EdgarFact>;
  sharesDiluted: Map<string, EdgarFact>;
  interestExpense: Map<string, EdgarFact>;
  dna: Map<string, EdgarFact>;
};
type BalanceMaps = {
  cash: Map<string, EdgarFact>;
  currentAssets: Map<string, EdgarFact>;
  currentLiabilities: Map<string, EdgarFact>;
  equity: Map<string, EdgarFact>;
  longTermDebt: Map<string, EdgarFact>;
  longTermDebtNoncurrent: Map<string, EdgarFact>;
  longTermDebtCurrent: Map<string, EdgarFact>;
  shortTermDebt: Map<string, EdgarFact>;
};
type CashFlowMaps = {
  operatingCashFlow: Map<string, EdgarFact>;
  capex: Map<string, EdgarFact>;
  dividendsPaid: Map<string, EdgarFact>;
  buybacks: Map<string, EdgarFact>;
};
type ConceptMaps = {
  income: IncomeMaps;
  balance: BalanceMaps;
  cashFlow: CashFlowMaps;
};

function buildConceptMaps(
  facts: EdgarCompanyFacts,
  period: PeriodKey,
): ConceptMaps {
  const us = facts.facts["us-gaap"] ?? {};

  // Flow concepts (income statement, cash flow):
  //   - annual → annualMap (FY only)
  //   - quarterly → extractStandaloneQuarters (prefers standalone-Q
  //     facts when present; derives Q2/Q3 from YTD differences when
  //     not — see AAPL D&A pattern) PLUS deriveQ4FromAnnual injects
  //     standalone Q4 (companies file 10-K, not 10-Q for Q4).
  // Balance concepts are point-in-time snapshots — no YTD/standalone
  // duality; quarterlyMap / balanceMap are correct.
  const flowQuarterly = (concepts: readonly string[], unit?: string): Map<string, EdgarFact> => {
    const hit = firstAvailable(us, concepts, unit);
    const standalone = hit ? extractStandaloneQuarters(hit.facts) : new Map();
    const annual = annualMap(us, concepts, unit);
    return deriveQ4FromAnnual(standalone, annual);
  };
  const flowMap = period === "annual"
    ? (concepts: readonly string[], unit?: string) => annualMap(us, concepts, unit)
    : flowQuarterly;

  return {
    income: {
      revenue: flowMap(REVENUE_CONCEPTS),
      cogs: flowMap(COST_OF_REVENUE_CONCEPTS),
      grossProfit: flowMap(GROSS_PROFIT_CONCEPTS),
      operatingIncome: flowMap(OPERATING_INCOME_CONCEPTS),
      netIncome: flowMap(NET_INCOME_CONCEPTS),
      epsDiluted: flowMap(EPS_CONCEPTS, "USD/shares"),
      // Shares is a flow-statement field (weighted average) but the
      // standalone-vs-YTD distinction doesn't matter — both report the
      // same period-end weighted-average count. Use plain quarterly
      // dedupe to avoid the standalone filter discarding it.
      sharesDiluted:
        period === "annual"
          ? annualMap(us, SHARES_CONCEPTS, "shares")
          : quarterlyMap(us, SHARES_CONCEPTS, "shares"),
      interestExpense: flowMap(INTEREST_EXPENSE_CONCEPTS),
      dna: flowMap(DA_CONCEPTS),
    },
    balance: {
      cash: balanceMap(us, CASH_CONCEPTS),
      currentAssets: balanceMap(us, CURRENT_ASSETS_CONCEPTS),
      currentLiabilities: balanceMap(us, CURRENT_LIABILITIES_CONCEPTS),
      equity: balanceMap(us, STOCKHOLDERS_EQUITY_CONCEPTS),
      longTermDebt: balanceMap(us, LONG_TERM_DEBT_CONCEPTS),
      longTermDebtNoncurrent: balanceMap(
        us,
        LONG_TERM_DEBT_NONCURRENT_CONCEPTS,
      ),
      longTermDebtCurrent: balanceMap(us, LONG_TERM_DEBT_CURRENT_CONCEPTS),
      shortTermDebt: balanceMap(us, SHORT_TERM_DEBT_CONCEPTS),
    },
    cashFlow: {
      operatingCashFlow: flowMap(OPERATING_CASH_FLOW_CONCEPTS),
      capex: flowMap(CAPEX_CONCEPTS),
      dividendsPaid: flowMap(DIVIDENDS_CONCEPTS),
      buybacks: flowMap(BUYBACKS_CONCEPTS),
    },
  };
}

function get(map: Map<string, EdgarFact>, end: string): number | null {
  const f = map.get(end);
  return f ? f.val : null;
}

/** Build the income panel for a single period-end. */
function incomeAt(maps: IncomeMaps, end: string): AnnualIncome {
  const revenue = get(maps.revenue, end);
  const cogs = get(maps.cogs, end);
  const grossProfit =
    get(maps.grossProfit, end) ??
    (revenue !== null && cogs !== null ? revenue - cogs : null);
  const operatingIncome = get(maps.operatingIncome, end);
  const dna = get(maps.dna, end);
  const ebit = operatingIncome;
  const ebitda =
    operatingIncome !== null && dna !== null ? operatingIncome + dna : null;

  return {
    revenue,
    grossProfit,
    operatingIncome,
    ebit,
    ebitda,
    interestExpense: get(maps.interestExpense, end),
    netIncome: get(maps.netIncome, end),
    epsDiluted: get(maps.epsDiluted, end),
    sharesDiluted: get(maps.sharesDiluted, end),
  };
}

function balanceAt(maps: BalanceMaps, end: string): AnnualBalance {
  // Total debt rule:
  //   - LongTermDebt is the SUM of current + noncurrent when reported.
  //   - If only the split tags exist, sum them.
  //   - Add CommercialPaper / ShortTermBorrowings for short-term debt.
  // Validated against AAPL FY2025 vs prior Yahoo snapshot ($98.66B match).
  const ltdTotal = get(maps.longTermDebt, end);
  const ltdNoncurrent = get(maps.longTermDebtNoncurrent, end);
  const ltdCurrent = get(maps.longTermDebtCurrent, end);
  const stb = get(maps.shortTermDebt, end);

  let totalDebt: number | null = null;
  if (ltdTotal !== null) {
    totalDebt = ltdTotal + (stb ?? 0);
  } else if (ltdNoncurrent !== null || ltdCurrent !== null) {
    totalDebt = (ltdNoncurrent ?? 0) + (ltdCurrent ?? 0) + (stb ?? 0);
  } else if (stb !== null) {
    totalDebt = stb;
  }

  return {
    cash: get(maps.cash, end),
    totalCurrentAssets: get(maps.currentAssets, end),
    totalCurrentLiabilities: get(maps.currentLiabilities, end),
    totalDebt,
    totalEquity: get(maps.equity, end),
  };
}

function cashFlowAt(maps: CashFlowMaps, end: string): AnnualCashFlow {
  const operatingCashFlow = get(maps.operatingCashFlow, end);
  const capexRaw = get(maps.capex, end);
  // EDGAR reports capex as a positive magnitude. Our schema treats it
  // as a cash-flow outflow (negative) — flip the sign for downstream
  // consistency with the prior Yahoo behavior.
  const capex = capexRaw === null ? null : -Math.abs(capexRaw);
  const freeCashFlow =
    operatingCashFlow !== null && capexRaw !== null
      ? operatingCashFlow - Math.abs(capexRaw)
      : null;

  return {
    operatingCashFlow,
    capex,
    freeCashFlow,
    dividendsPaid: get(maps.dividendsPaid, end),
    buybacks: get(maps.buybacks, end),
  };
}

/** Distinct period-end dates with at least one non-null income value. */
function periodEndsFromMaps(maps: IncomeMaps): string[] {
  const ends = new Set<string>();
  for (const m of Object.values(maps) as Array<Map<string, EdgarFact>>) {
    for (const k of m.keys()) ends.add(k);
  }
  // Newest first.
  return [...ends].sort((a, b) => (a < b ? 1 : -1));
}

/** Most recent filing date across the income maps for a given period
 * end. Used to populate `filingDate`. */
function latestFilingDate(maps: IncomeMaps, end: string): string | null {
  let latest: string | null = null;
  for (const m of Object.values(maps) as Array<Map<string, EdgarFact>>) {
    const f = m.get(end);
    if (f && (latest === null || f.filed > latest)) latest = f.filed;
  }
  return latest;
}

/** Map EDGAR companyfacts → AnnualPeriod[]. Newest first. The
 * priceAt* fields are left null — the caller (Yahoo provider) fills
 * them from the chart data. Truncates to DEFAULT_MAX_ANNUAL_PERIODS
 * by default so the snapshot doesn't carry decades of history that
 * the engine never reads. */
export function mapAnnualPeriods(
  facts: EdgarCompanyFacts,
  opts: MapOptions = {},
): AnnualPeriod[] {
  const cap = opts.maxAnnualPeriods ?? DEFAULT_MAX_ANNUAL_PERIODS;
  const maps = buildConceptMaps(facts, "annual");
  const ends = periodEndsFromMaps(maps.income);

  const out: AnnualPeriod[] = [];
  for (const end of ends) {
    if (out.length >= cap) break;
    const income = incomeAt(maps.income, end);
    const balance = balanceAt(maps.balance, end);
    const cashFlow = cashFlowAt(maps.cashFlow, end);

    // Skip periods with absolutely no data — guards against orphan
    // dates that might appear in only one balance map (e.g. a
    // restatement-only fact for a long-deprecated concept).
    if (
      income.netIncome === null &&
      income.revenue === null &&
      cashFlow.operatingCashFlow === null
    ) {
      continue;
    }

    out.push({
      fiscalYear: end.slice(0, 4),
      periodEndDate: end,
      filingDate: latestFilingDate(maps.income, end),
      reportedCurrency: DEFAULT_REPORTING_CURRENCY,
      priceAtYearEnd: null,
      priceHighInYear: null,
      priceLowInYear: null,
      income,
      balance,
      cashFlow,
      ratios: { ...EMPTY_RATIOS },
    });
  }
  return out;
}

/** Map EDGAR companyfacts → QuarterlyPeriod[]. Newest first.
 * Truncates to DEFAULT_MAX_QUARTERLY_PERIODS by default. */
export function mapQuarterlyPeriods(
  facts: EdgarCompanyFacts,
  opts: MapOptions = {},
): QuarterlyPeriod[] {
  const cap = opts.maxQuarterlyPeriods ?? DEFAULT_MAX_QUARTERLY_PERIODS;
  const maps = buildConceptMaps(facts, "quarterly");
  const ends = periodEndsFromMaps(maps.income);

  const out: QuarterlyPeriod[] = [];
  for (const end of ends) {
    if (out.length >= cap) break;
    const income = incomeAt(maps.income, end);
    const balance = balanceAt(maps.balance, end);
    const cashFlow = cashFlowAt(maps.cashFlow, end);

    if (
      income.netIncome === null &&
      income.revenue === null &&
      cashFlow.operatingCashFlow === null
    ) {
      continue;
    }

    out.push({
      fiscalQuarter: fiscalQuarterOf(end),
      periodEndDate: end,
      filingDate: latestFilingDate(maps.income, end),
      reportedCurrency: DEFAULT_REPORTING_CURRENCY,
      priceAtQuarterEnd: null,
      income,
      balance,
      cashFlow,
      ratios: { ...EMPTY_RATIOS },
    });
  }
  return out;
}

/** "2026Q1" style label keyed off the calendar quarter of the
 * period-end date. Mirrors the Yahoo provider's helper for
 * cross-source consistency. */
export function fiscalQuarterOf(end: string): string {
  const year = end.slice(0, 4);
  const month = parseInt(end.slice(5, 7), 10);
  const quarter = Math.ceil(month / 3);
  return `${year}Q${quarter}`;
}

// ---------------------------------------------------------------
// Price decoration. EDGAR carries no price data; the caller injects
// historical chart bars (sourced from Yahoo's `chart` API) and we
// fill in priceAt* fields per period.
// ---------------------------------------------------------------

function sortBarsAscending(bars: HistoricalBar[]): HistoricalBar[] {
  return [...bars].sort((a, b) => a.date.localeCompare(b.date));
}

function closeAtOrBefore(barsAsc: HistoricalBar[], targetIso: string): number | null {
  let result: number | null = null;
  for (const b of barsAsc) {
    if (b.date <= targetIso) result = b.close;
    else break;
  }
  return result;
}

function rangeInWindow(
  barsAsc: HistoricalBar[],
  startIso: string,
  endIso: string,
): { high: number | null; low: number | null } {
  let high: number | null = null;
  let low: number | null = null;
  for (const bar of barsAsc) {
    if (bar.date < startIso || bar.date > endIso) continue;
    const barHigh = bar.high ?? bar.close;
    const barLow = bar.low ?? bar.close;
    if (high === null || barHigh > high) high = barHigh;
    if (low === null || barLow < low) low = barLow;
  }
  return { high, low };
}

function fyWindow(periodEndIso: string): { start: string; end: string } {
  const d = new Date(`${periodEndIso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return { start: d.toISOString().slice(0, 10), end: periodEndIso };
}

/** Fill priceAtYearEnd / priceHighInYear / priceLowInYear on each
 * annual period using the supplied historical bars. Bars older than
 * the earliest needed date can be missing — those periods just keep
 * the null prices already returned by the EDGAR mapper. */
export function decorateAnnualPeriodsWithPrices(
  periods: AnnualPeriod[],
  bars: HistoricalBar[],
): AnnualPeriod[] {
  const barsAsc = sortBarsAscending(bars);
  return periods.map((p) => {
    const window = fyWindow(p.periodEndDate);
    const range = rangeInWindow(barsAsc, window.start, window.end);
    return {
      ...p,
      priceAtYearEnd: closeAtOrBefore(barsAsc, p.periodEndDate),
      priceHighInYear: range.high,
      priceLowInYear: range.low,
    };
  });
}

/** Fill priceAtQuarterEnd on each quarterly period. */
export function decorateQuarterlyPeriodsWithPrices(
  periods: QuarterlyPeriod[],
  bars: HistoricalBar[],
): QuarterlyPeriod[] {
  const barsAsc = sortBarsAscending(bars);
  return periods.map((p) => ({
    ...p,
    priceAtQuarterEnd: closeAtOrBefore(barsAsc, p.periodEndDate),
  }));
}

// ---------------------------------------------------------------
// Ratio computation. EDGAR mapper leaves ratios all null; this fills
// them from the balance + income figures we already extracted.
// Same formulas as the prior Yahoo path so downstream engine
// behavior is unchanged.
// ---------------------------------------------------------------

function computeRatios(
  income: AnnualIncome,
  balance: AnnualBalance,
): AnnualRatios {
  const netDebtToEbitda =
    balance.totalDebt !== null &&
    balance.cash !== null &&
    income.ebitda !== null &&
    income.ebitda > 0
      ? (balance.totalDebt - balance.cash) / income.ebitda
      : null;
  const currentRatio =
    balance.totalCurrentAssets !== null &&
    balance.totalCurrentLiabilities !== null &&
    balance.totalCurrentLiabilities > 0
      ? balance.totalCurrentAssets / balance.totalCurrentLiabilities
      : null;
  // ROIC ≈ EBIT × (1 - 0.21 effective tax) / Invested Capital. Flat
  // 21% tax assumption — per-period effective tax isn't always present.
  const investedCapital =
    balance.totalEquity !== null &&
    balance.totalDebt !== null &&
    balance.cash !== null
      ? balance.totalEquity + balance.totalDebt - balance.cash
      : null;
  const roic =
    income.ebit !== null && investedCapital !== null && investedCapital > 0
      ? (income.ebit * (1 - 0.21)) / investedCapital
      : null;
  return { roic, netDebtToEbitda, currentRatio };
}

export function withAnnualRatios(period: AnnualPeriod): AnnualPeriod {
  return { ...period, ratios: computeRatios(period.income, period.balance) };
}

export function withQuarterlyRatios(period: QuarterlyPeriod): QuarterlyPeriod {
  return { ...period, ratios: computeRatios(period.income, period.balance) };
}

// ---------------------------------------------------------------
// Shares-magnitude normalization. EDGAR's `units: ["shares"]`
// claim is misleading — many large-cap filers (MCD, WAT, IBKR, OMC,
// AMCR, BX, TKO) report `WeightedAverageNumberOfDilutedSharesOutstanding`
// in millions for income-statement readability, while others (AAPL)
// report raw counts. The XBRL response doesn't surface this scale
// difference cleanly. We detect it by cross-referencing against an
// authoritative external count (Yahoo's defaultKeyStatistics
// .sharesOutstanding) and rescale all per-period EDGAR shares by the
// inferred power-of-1000 factor. Without this fix, the price-
// consistency check throws false positives for ~8 S&P 500 names per
// refresh, and downstream FV anchors (own-historical EV/EBITDA,
// P/FCF) compute per-share implied prices that are off by ≥1e6×.
// ---------------------------------------------------------------

/**
 * Returns the multiplier to apply to EDGAR's share counts so they
 * align with `authoritativeShares` (typically Yahoo's sharesOutstanding).
 *
 * Rounds to the nearest power of 1000 (1, 1_000, 1_000_000,
 * 1_000_000_000) within a 30% tolerance. If no clear match → 1
 * (leave the EDGAR values unchanged).
 *
 * Returns 1 when either input is null/zero/negative — the consistency
 * check's `if (recentShares > 0)` guard handles the unscaled case.
 */
export function inferSharesScale(
  edgarMostRecentShares: number | null,
  authoritativeShares: number,
): number {
  if (edgarMostRecentShares === null || edgarMostRecentShares <= 0) return 1;
  if (authoritativeShares <= 0) return 1;
  const ratio = authoritativeShares / edgarMostRecentShares;
  for (const candidate of [1, 1_000, 1_000_000, 1_000_000_000]) {
    if (Math.abs(ratio / candidate - 1) < 0.3) return candidate;
  }
  return 1;
}

/** Apply a uniform scale factor to `sharesDiluted` across every
 * period. EPS itself is unaffected — it's reported in the right
 * unit (USD/shares) regardless of the share-count convention. */
export function rescaleSharesInPeriods<
  T extends { income: { sharesDiluted: number | null } },
>(periods: T[], scale: number): T[] {
  if (scale === 1) return periods;
  return periods.map((p) => ({
    ...p,
    income: {
      ...p.income,
      sharesDiluted:
        p.income.sharesDiluted === null
          ? null
          : p.income.sharesDiluted * scale,
    },
  }));
}
