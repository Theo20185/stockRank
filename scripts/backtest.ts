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
import { resolve } from "node:path";
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

const REPORTING_LAG_DAYS = 90;
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
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (out.symbols.length === 0) {
    throw new Error("usage: backtest --symbols SYM[,SYM...] [--years N] [--peers SYM:P1,P2] [--accuracy] [--horizons 1,2,3,5] [--archive]");
  }
  return out;
}

// ─── Data fetch ──────────────────────────────────────────────────────────

type SymbolHistory = {
  symbol: string;
  meta: { name: string; sector: string; industry: string; currency: string };
  annual: AnnualPeriod[];
  prices: Array<{ date: string; close: number }>;
};

async function pullHistory(symbol: string, years: number): Promise<SymbolHistory> {
  const today = new Date();
  const period1 = new Date(today.getFullYear() - years - 1, 0, 1);
  const yahooSymbol = symbol.replace(/\./g, "-");

  const fundamentalsRaw = (await yf.fundamentalsTimeSeries(yahooSymbol, {
    period1: period1.toISOString().slice(0, 10),
    type: "annual",
    module: "all",
  })) as unknown as Array<Record<string, unknown>>;

  const chart = await yf.chart(yahooSymbol, {
    period1,
    period2: today,
    interval: "1d",
  });

  const prices = (chart.quotes ?? [])
    .filter(
      (q): q is typeof q & { close: number; date: Date } =>
        q.close !== null && q.close !== undefined && q.date instanceof Date,
    )
    .map((q) => ({ date: q.date.toISOString().slice(0, 10), close: q.close }));

  const profile = (await yf.quoteSummary(yahooSymbol, {
    modules: ["assetProfile", "price"],
  })) as unknown as {
    assetProfile?: { sector?: string; industry?: string };
    price?: { longName?: string; shortName?: string; currency?: string };
  };

  const annual = fundamentalsRaw
    .map((row) => mapAnnualRow(row))
    .filter((r): r is AnnualPeriod => r !== null)
    .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1));

  return {
    symbol,
    meta: {
      name: profile.price?.longName ?? profile.price?.shortName ?? symbol,
      sector: profile.assetProfile?.sector ?? "Unknown",
      industry: profile.assetProfile?.industry ?? "Unknown",
      currency: profile.price?.currency ?? "USD",
    },
    annual,
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
  const cutoff = addDays(dateIso, -REPORTING_LAG_DAYS);
  // periods whose period-end + 90d lag was <= simulation date are "public"
  return history.annual.filter((p) => p.periodEndDate <= cutoff);
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildSnapshotAtDate(
  history: SymbolHistory,
  dateIso: string,
): CompanySnapshot | null {
  const annual = annualPublicAsOf(history, dateIso);
  if (annual.length === 0) return null;
  const price = priceAtOrBefore(history, dateIso);
  if (price === null) return null;
  const recent = annual[0]!;
  const shares = recent.income.sharesDiluted ?? null;
  const marketCap = shares !== null ? shares * price : 0;
  // TTM proxies — use most-recent annual as the TTM stand-in for back-test
  // simplicity. (Yahoo's actual TTM is rolling-quarterly; we'd need
  // quarterly history to reconstruct. Annual is a reasonable approximation
  // for slow-moving metrics like P/E and P/FCF.)
  const eps = recent.income.epsDiluted ?? null;
  const ebitda = recent.income.ebitda ?? null;
  const fcf = recent.cashFlow.freeCashFlow ?? null;
  const equity = recent.balance.totalEquity ?? null;
  const debt = recent.balance.totalDebt ?? null;
  const cash = recent.balance.cash ?? null;
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
      dividendYield: null,
      currentRatio: null,
      netDebtToEbitda: null,
      roic: null,
      earningsYield: peRatio ? 1 / peRatio : null,
      fcfYield: priceToFcf ? 1 / priceToFcf : null,
      enterpriseValue: marketCap + (debt ?? 0) - (cash ?? 0),
      investedCapital: (equity ?? 0) + (debt ?? 0) - (cash ?? 0),
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

async function backtestSymbol(
  subjectHistory: SymbolHistory,
  peerHistories: SymbolHistory[],
  years: number,
): Promise<BacktestRow[]> {
  const dates = monthEnds(years);
  const rows: BacktestRow[] = [];
  for (const date of dates) {
    const subject = buildSnapshotAtDate(subjectHistory, date);
    if (!subject) continue;
    const peers = peerHistories
      .map((h) => buildSnapshotAtDate(h, date))
      .filter((p): p is CompanySnapshot => p !== null);
    if (peers.length < 2) continue;
    const universe = [subject, ...peers];

    const fv = fairValueFor(subject, universe);
    const fvNaive = fairValueFor(subject, universe, { skipOutlierRule: true });
    const ruleEffect = fv.range && fvNaive.range
      ? fvNaive.range.median - fv.range.median
      : null;

    // Reconstruct the bucket classification for this date so the
    // accuracy report can ask "did names that the model put in
    // Candidates actually recover?" (H3 in the spec). Limitation: the
    // ranking pipeline computes percentiles within the snapshot we
    // pass it — here that's just (subject + peers), not the full S&P
    // 500. This is a tighter cohort than production but produces
    // sensible category scores for industry-mate names; it's the same
    // approximation the production cohort-resolver falls back to when
    // the full universe is sparse.
    const candidateGateOff = classifyAsCandidate(subject, universe, fv);

    rows.push({
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
    });
  }
  return rows;
}

/**
 * Apply the Candidates-bucket criteria *minus* options-liquidity (Decision
 * 4 in the spec). Returns true iff the subject would land in the Candidates
 * bucket at this date with the gate ignored.
 *
 * Implementation: run the ranking pipeline on (subject + peers) so we get
 * categoryScores, find the subject's RankedRow, set optionsLiquid:true on
 * it (so the classifier doesn't fail on missing historical options data),
 * then call the production classifier.
 */
function classifyAsCandidate(
  subject: CompanySnapshot,
  universe: CompanySnapshot[],
  fv: FairValue,
): boolean {
  let ranked;
  try {
    ranked = rank({ companies: universe, snapshotDate: "" });
  } catch {
    return false;
  }
  const all: RankedRow[] = [...ranked.rows, ...ranked.ineligibleRows];
  const row = all.find((r) => r.symbol === subject.symbol);
  if (!row) return false;
  const augmented: RankedRow = {
    ...row,
    fairValue: fv,
    optionsLiquid: true, // gate-off — see Decision 4
  };
  return classifyRow(augmented) === "ranked";
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
function dedupeYearly(rows: AccuracyRow[], horizons: number[]): AccuracyRow[] {
  // Group by (symbol, year); within each group, pick the FIRST date that
  // has windowComplete=true for ALL requested horizons AND has non-null
  // fair value (the back-test's engine returns null FV for early window
  // dates that don't have enough annual history; including those would
  // give us a yearly headline of mostly-null hit rates and obscure the
  // real signal). Mechanical no-cherry-pick rule.
  const bySymbolYear = groupBy(rows, (r) => `${r.symbol}|${r.date.slice(0, 4)}`);
  const out: AccuracyRow[] = [];
  for (const [, group] of bySymbolYear) {
    const dates = [...new Set(group.map((r) => r.date))].sort();
    let chosen: string | null = null;
    for (const d of dates) {
      const horizonRows = group.filter((r) => r.date === d);
      const allComplete = horizons.every((h) => {
        const r = horizonRows.find((x) => x.horizon === h);
        return r ? r.windowComplete : false;
      });
      const hasFv = horizonRows.some((r) => r.fvP25 !== null);
      if (allComplete && hasFv) {
        chosen = d;
        break;
      }
    }
    if (chosen) {
      for (const r of group) {
        if (r.date === chosen) out.push(r);
      }
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

  // H3 fans out across three baselines so we can tell HOW MUCH of the
  // model's excess return is "we beat the cap-weighted index" vs the
  // tougher tests "we beat the equal-weighted version (no Mag7
  // concentration tailwind)" and "we beat the value style itself".
  const candidates3y = yearly.filter((r) => r.horizon === 3 && r.candidateGateOff);
  const h3Agg = aggregate(candidates3y);
  results.push({
    id: "H3-SPY",
    statement: "Candidates (gate-off) beat SPY (cap-weight) over 3y on average",
    verdict: verdictForExcess(h3Agg.meanExcessVsSpy, h3Agg.meanExcessVsSpyCi),
    evidence: `n=${h3Agg.n}, mean excess vs SPY = ${fmtMean(h3Agg.meanExcessVsSpy, h3Agg.meanExcessVsSpyCi)}`,
  });
  results.push({
    id: "H3-RSP",
    statement: "Candidates (gate-off) beat RSP (equal-weight S&P 500) over 3y on average",
    verdict: verdictForExcess(h3Agg.meanExcessVsRsp, h3Agg.meanExcessVsRspCi),
    evidence: `n=${h3Agg.n}, mean excess vs RSP = ${fmtMean(h3Agg.meanExcessVsRsp, h3Agg.meanExcessVsRspCi)} — gap vs SPY excess quantifies Mag7 concentration tailwind`,
  });
  results.push({
    id: "H3-VTV",
    statement: "Candidates (gate-off) beat VTV (Vanguard Value) over 3y on average",
    verdict: verdictForExcess(h3Agg.meanExcessVsVtv, h3Agg.meanExcessVsVtvCi),
    evidence: `n=${h3Agg.n}, mean excess vs VTV = ${fmtMean(h3Agg.meanExcessVsVtv, h3Agg.meanExcessVsVtvCi)} — beating this means stock-picking generates real alpha over a value ETF`,
  });

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

function renderAccuracyReport(
  allRows: AccuracyRow[],
  horizons: number[],
  symbols: string[],
  years: number,
): string {
  const yearly = dedupeYearly(allRows, horizons);
  const verdicts = evaluateHypotheses(yearly);

  const lines: string[] = [];
  lines.push("# Back-test accuracy report");
  lines.push("");
  lines.push(`Generated ${todayIsoUtc()} by \`scripts/backtest.ts --accuracy\`. Symbols: ${symbols.join(", ")}. Window: ${years}y of monthly snapshots.`);
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

  console.log(`stockRank backtest — ${args.symbols.join(", ")} over ${args.years}y${args.accuracy ? " [accuracy mode]" : ""}`);
  const snapshot = await loadSnapshot(args.snapshotPath);

  const summarySections: string[] = [];
  const allBacktests: SymbolBacktest[] = [];

  for (const symbol of args.symbols) {
    console.log(`\n=== ${symbol} ===`);
    let peerSymbols: string[];
    if (args.peerOverrides[symbol]) {
      peerSymbols = args.peerOverrides[symbol]!;
      console.log(`  peers (manual override, ${peerSymbols.length}): ${peerSymbols.join(", ")}`);
    } else {
      const found = findPeers(snapshot, symbol, PEER_GROUP_SIZE);
      if (found.peers.length === 0) {
        if (!snapshot.companies.find((c) => c.symbol === symbol)) {
          console.error(`  ${symbol} not in current snapshot — pass --peers ${symbol}:P1,P2,...`);
        } else {
          console.error(`  ${symbol}: no industry/sector peers in snapshot — pass --peers ${symbol}:P1,P2,...`);
        }
        continue;
      }
      peerSymbols = found.peers;
      console.log(`  peers (${peerSymbols.length}, ${found.cohortLevel}): ${peerSymbols.join(", ")}`);
    }

    let subjectHistory: SymbolHistory;
    try {
      subjectHistory = await pullHistory(symbol, args.years);
      console.log(`  subject history: ${subjectHistory.annual.length} annual rows, ${subjectHistory.prices.length} price bars`);
    } catch (err) {
      console.error(`  subject pull failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const peerHistories: SymbolHistory[] = [];
    for (const peer of peerSymbols) {
      try {
        const h = await pullHistory(peer, args.years);
        peerHistories.push(h);
        console.log(`  + ${peer}: ${h.annual.length} annual, ${h.prices.length} prices`);
      } catch (err) {
        console.error(`  ! ${peer}: ${err instanceof Error ? err.message : err}`);
      }
      await sleep(500);
    }

    const rows = await backtestSymbol(subjectHistory, peerHistories, args.years);
    console.log(`  produced ${rows.length} snapshots`);

    const csv = rowsToCsv(rows);
    const csvPath = resolve(args.outDir, `${symbol}.csv`);
    await writeFile(csvPath, csv, "utf8");

    const md = symbolReport(symbol, subjectHistory, peerSymbols, rows);
    const mdPath = resolve(args.outDir, `${symbol}.md`);
    await writeFile(mdPath, md, "utf8");
    summarySections.push(md);

    allBacktests.push({ symbol, history: subjectHistory, peerSymbols, rows });

    console.log(`  wrote ${csvPath}`);
    console.log(`  wrote ${mdPath}`);
  }

  const summary = `# Back-test report

Generated by \`scripts/backtest.ts\` over ${args.years} years of monthly
snapshots. For each symbol, fair value was recomputed at every month-end
using only data that would have been public at that date (annual
fundamentals filtered by period-end + ${REPORTING_LAG_DAYS}-day reporting
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
      spyHistory = await pullHistory("SPY", baselineYears);
      console.log(`  SPY: ${spyHistory.prices.length} price bars`);
    } catch (err) {
      console.error(`  SPY pull failed: ${err instanceof Error ? err.message : err}`);
      console.error("  skipping accuracy report");
      return;
    }
    let rspHistory: SymbolHistory | null = null;
    try {
      rspHistory = await pullHistory("RSP", baselineYears);
      console.log(`  RSP: ${rspHistory.prices.length} price bars`);
    } catch (err) {
      console.warn(`  RSP pull failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
    let vtvHistory: SymbolHistory | null = null;
    try {
      vtvHistory = await pullHistory("VTV", baselineYears);
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

    const report = renderAccuracyReport(allAccuracy, args.horizons, args.symbols, args.years);
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
