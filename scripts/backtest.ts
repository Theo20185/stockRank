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
import { resolve } from "node:path";
import YahooFinance from "yahoo-finance2";
import type {
  AnnualPeriod,
  CompanySnapshot,
  Snapshot,
} from "@stockrank/core";
import { fairValueFor } from "@stockrank/ranking";
import type { FairValue } from "@stockrank/ranking";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const REPORTING_LAG_DAYS = 90;
const DEFAULT_YEARS = 4;
const PEER_GROUP_SIZE = 10;

type Args = {
  symbols: string[];
  years: number;
  outDir: string;
  snapshotPath: string;
  /** Map of subject symbol → manual peer list. Use for foreign ADRs and
   * other names not in the S&P 500 snapshot. Format: SYM:PEER1,PEER2 */
  peerOverrides: Record<string, string[]>;
};

function parseArgs(argv: string[]): Args {
  const out: Args = {
    symbols: [],
    years: DEFAULT_YEARS,
    outDir: resolve(process.cwd(), "tmp/backtest"),
    snapshotPath: resolve(process.cwd(), "public/data/snapshot-latest.json"),
    peerOverrides: {},
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
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  if (out.symbols.length === 0) {
    throw new Error("usage: backtest --symbols SYM[,SYM...] [--years N] [--peers SYM:P1,P2]");
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
  ruleEffect: number | null;  // (fvNaive.median - fv.median) — positive when rule pulled FV down
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
      ruleEffect,
    });
  }
  return rows;
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
    "ruleEffect",
  ];
  const fmt = (v: number | null | boolean) =>
    v === null ? "" : typeof v === "boolean" ? (v ? "1" : "0") : v.toFixed(2);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.date,
      fmt(r.actualPrice),
      fmt(r.fvP25), fmt(r.fvMedian), fmt(r.fvP75),
      fmt(r.upsideToP25Pct),
      fmt(r.fvNaiveP25), fmt(r.fvNaiveMedian), fmt(r.fvNaiveP75),
      fmt(r.outlierFired),
      fmt(r.ruleEffect),
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

// ─── Driver ──────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadSnapshot(path: string): Promise<Snapshot> {
  return JSON.parse(await readFile(path, "utf8")) as Snapshot;
}

function findPeers(snapshot: Snapshot, subject: string, n: number): string[] {
  const subjectCo = snapshot.companies.find((c) => c.symbol === subject);
  if (!subjectCo) return [];
  const sameIndustry = snapshot.companies
    .filter((c) => c.symbol !== subject && c.industry === subjectCo.industry)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, n);
  return sameIndustry.map((c) => c.symbol);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });

  console.log(`stockRank backtest — ${args.symbols.join(", ")} over ${args.years}y`);
  const snapshot = await loadSnapshot(args.snapshotPath);

  const summarySections: string[] = [];

  for (const symbol of args.symbols) {
    console.log(`\n=== ${symbol} ===`);
    let peerSymbols: string[];
    if (args.peerOverrides[symbol]) {
      peerSymbols = args.peerOverrides[symbol]!;
      console.log(`  peers (manual override, ${peerSymbols.length}): ${peerSymbols.join(", ")}`);
    } else {
      peerSymbols = findPeers(snapshot, symbol, PEER_GROUP_SIZE);
      if (peerSymbols.length === 0) {
        console.error(`  ${symbol} not in current snapshot — pass --peers ${symbol}:P1,P2,...`);
        continue;
      }
      console.log(`  peers (${peerSymbols.length}): ${peerSymbols.join(", ")}`);
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
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
