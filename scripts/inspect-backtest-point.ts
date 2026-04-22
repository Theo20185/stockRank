#!/usr/bin/env tsx
/**
 * Diagnostic script: reconstruct what a single month-end snapshot
 * looked like for one symbol + its peers, and print the full
 * fair-value breakdown (all 9 anchors, confidence, peer set, etc.).
 *
 * Usage:
 *   npx tsx scripts/inspect-backtest-point.ts INTC 2023-12-31
 */

import YahooFinance from "yahoo-finance2";
import type { AnnualPeriod, CompanySnapshot, Snapshot } from "@stockrank/core";
import { fairValueFor } from "@stockrank/ranking";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const REPORTING_LAG_DAYS = 90;

function n(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

async function pullAnnuals(symbol: string, period1: string): Promise<AnnualPeriod[]> {
  const rows = (await yf.fundamentalsTimeSeries(symbol.replace(/\./g, "-"), {
    period1,
    type: "annual",
    module: "all",
  })) as unknown as Array<Record<string, unknown>>;
  return rows
    .map((row) => {
      const date = row["date"];
      const periodEndDate =
        date instanceof Date ? date.toISOString().slice(0, 10)
        : typeof date === "string" ? date.slice(0, 10) : null;
      if (!periodEndDate) return null;
      const ebit = n(row["EBIT"]) ?? n(row["operatingIncome"]);
      const ebitda = n(row["EBITDA"]) ?? n(row["normalizedEBITDA"])
        ?? (ebit !== null && n(row["reconciledDepreciation"]) !== null
          ? ebit + n(row["reconciledDepreciation"])! : null);
      return {
        fiscalYear: periodEndDate.slice(0, 4),
        periodEndDate,
        filingDate: null,
        reportedCurrency: "USD",
        priceAtYearEnd: null,
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
      } as AnnualPeriod;
    })
    .filter((r): r is AnnualPeriod => r !== null)
    .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1));
}

async function priceAtDate(symbol: string, date: string): Promise<number | null> {
  const dEnd = new Date(`${date}T23:59:59.000Z`);
  const dStart = new Date(dEnd);
  dStart.setDate(dStart.getDate() - 14);
  const chart = await yf.chart(symbol.replace(/\./g, "-"), {
    period1: dStart,
    period2: dEnd,
    interval: "1d",
  });
  const quotes = (chart.quotes ?? []).filter(
    (q): q is typeof q & { close: number; date: Date } =>
      q.close !== null && q.close !== undefined && q.date instanceof Date,
  );
  if (quotes.length === 0) return null;
  return quotes[quotes.length - 1]!.close;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildSnap(
  symbol: string,
  name: string,
  industry: string,
  annuals: AnnualPeriod[],
  price: number,
  date: string,
): CompanySnapshot | null {
  const cutoff = addDays(date, -REPORTING_LAG_DAYS);
  const publicAnnuals = annuals.filter((p) => p.periodEndDate <= cutoff);
  if (publicAnnuals.length === 0) return null;
  const recent = publicAnnuals[0]!;
  const shares = recent.income.sharesDiluted;
  const marketCap = shares !== null ? shares * price : 0;
  const eps = recent.income.epsDiluted;
  const ebitda = recent.income.ebitda;
  const fcf = recent.cashFlow.freeCashFlow;
  const equity = recent.balance.totalEquity;
  const debt = recent.balance.totalDebt;
  const cash = recent.balance.cash;
  const peRatio = eps !== null && eps > 0 ? price / eps : null;
  const evToEbitda = ebitda !== null && ebitda > 0
    ? (marketCap + (debt ?? 0) - (cash ?? 0)) / ebitda : null;
  const priceToFcf = fcf !== null && fcf > 0 && shares !== null && shares > 0
    ? price / (fcf / shares) : null;
  const priceToBook = equity !== null && equity > 0 && shares !== null && shares > 0
    ? price / (equity / shares) : null;
  return {
    symbol, name, sector: "Technology", industry, exchange: "NYSE",
    marketCap, currency: "USD", quoteCurrency: "USD",
    quote: { price, yearHigh: price, yearLow: price, volume: 0, averageVolume: 0 },
    ttm: {
      peRatio, evToEbitda, priceToFcf, priceToBook,
      dividendYield: null, currentRatio: null, netDebtToEbitda: null,
      roic: null, earningsYield: peRatio ? 1/peRatio : null,
      fcfYield: priceToFcf ? 1/priceToFcf : null,
      enterpriseValue: marketCap + (debt ?? 0) - (cash ?? 0),
      investedCapital: (equity ?? 0) + (debt ?? 0) - (cash ?? 0),
      forwardEps: null,
    },
    annual: publicAnnuals,
    pctOffYearHigh: 0,
  };
}

async function main() {
  const symbol = process.argv[2];
  const date = process.argv[3];
  if (!symbol || !date) {
    console.error("usage: inspect-backtest-point SYMBOL YYYY-MM-DD");
    process.exit(1);
  }

  const snapshot = JSON.parse(
    await readFile(resolve("public/data/snapshot-latest.json"), "utf8"),
  ) as Snapshot;
  const subjectCo = snapshot.companies.find((c) => c.symbol === symbol.toUpperCase());
  if (!subjectCo) {
    console.error(`${symbol} not in snapshot`);
    process.exit(1);
  }
  const peers = snapshot.companies
    .filter((c) => c.symbol !== symbol.toUpperCase() && c.industry === subjectCo.industry)
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, 10)
    .map((c) => c.symbol);

  console.log(`=== ${symbol} @ ${date} ===\n`);
  console.log(`peers: ${peers.join(", ")}\n`);

  const period1 = "2018-01-01";
  const subjectAnnuals = await pullAnnuals(symbol, period1);
  const subjectPrice = await priceAtDate(symbol, date);
  const subject = buildSnap(symbol.toUpperCase(), subjectCo.name, subjectCo.industry,
    subjectAnnuals, subjectPrice!, date);
  if (!subject) { console.error("subject rebuild failed"); process.exit(1); }

  console.log(`${symbol} price at ${date}: $${subjectPrice!.toFixed(2)}`);
  const recent = subject.annual[0]!;
  console.log(`  latest public annual: ${recent.periodEndDate} (EPS $${recent.income.epsDiluted})\n`);

  console.log("peer-by-peer snapshot at this date:");
  const peerSnaps: CompanySnapshot[] = [];
  for (const p of peers) {
    const pCo = snapshot.companies.find((c) => c.symbol === p)!;
    try {
      const ann = await pullAnnuals(p, period1);
      const price = await priceAtDate(p, date);
      if (!price) continue;
      const snap = buildSnap(p, pCo.name, pCo.industry, ann, price, date);
      if (!snap) { console.log(`  ${p}: no public annuals yet`); continue; }
      const latest = snap.annual[0]!;
      console.log(`  ${p.padEnd(6)} price $${price.toFixed(2).padStart(7)}  EPS $${String(latest.income.epsDiluted ?? "—").padStart(7)}  PE ${(snap.ttm.peRatio ?? 0).toFixed(1).padStart(6)}  [latest annual: ${latest.periodEndDate}]`);
      peerSnaps.push(snap);
    } catch (e) {
      console.log(`  ${p}: err ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\nrunning fairValueFor...");
  const fv = fairValueFor(subject, [subject, ...peerSnaps]);
  console.log("\nfair-value result:");
  console.log(`  range: p25 $${fv.range?.p25.toFixed(2)}  median $${fv.range?.median.toFixed(2)}  p75 $${fv.range?.p75.toFixed(2)}`);
  console.log(`  upside p25: ${fv.upsideToP25Pct?.toFixed(1)}%`);
  console.log(`  peer set: ${fv.peerSet} (${fv.peerCount} peers)`);
  console.log(`  confidence: ${fv.confidence}`);
  console.log(`  ttmTreatment: ${fv.ttmTreatment}`);
  const spread = fv.range ? fv.range.p75 / fv.range.p25 : null;
  console.log(`  spread p75/p25: ${spread?.toFixed(2)}x`);
  console.log("\nall 9 anchors:");
  for (const [k, v] of Object.entries(fv.anchors)) {
    console.log(`  ${k.padEnd(25)}  ${v === null ? "—" : "$" + v.toFixed(2)}`);
  }
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
