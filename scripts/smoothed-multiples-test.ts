#!/usr/bin/env tsx
/**
 * Diagnostic: compare current peer-median P/E vs a 5-year smoothed
 * version for the same peer cohort, at a specific point-in-time
 * snapshot. The goal is to see whether smoothing peer multiples would
 * have rescued the canonical INTC late-2023 false-bullish call (where
 * NVDA + AMD AI-bubble PEs distorted the cohort).
 *
 * For each peer, computes its "trailing P/E at period-end" for each of
 * the last 5 fiscal years (price on the period-end date / EPS for
 * that period), then takes the median across those years as the
 * peer's smoothed multiple. The cross-peer median of those smoothed
 * values is the proposed alternative anchor.
 *
 * Usage: npx tsx scripts/smoothed-multiples-test.ts INTC 2023-12-31
 */

import YahooFinance from "yahoo-finance2";
import type { Snapshot } from "@stockrank/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const REPORTING_LAG_DAYS = 90;
const SMOOTHING_YEARS = 5;

function n(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type Annual = { periodEndDate: string; epsDiluted: number | null };

async function pullAnnuals(symbol: string): Promise<Annual[]> {
  const rows = (await yf.fundamentalsTimeSeries(symbol.replace(/\./g, "-"), {
    period1: "2017-01-01",
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
      return { periodEndDate, epsDiluted: n(row["dilutedEPS"]) };
    })
    .filter((r): r is Annual => r !== null)
    .sort((a, b) => (a.periodEndDate < b.periodEndDate ? 1 : -1));
}

async function pullPriceHistory(symbol: string): Promise<Map<string, number>> {
  const chart = await yf.chart(symbol.replace(/\./g, "-"), {
    period1: new Date("2017-01-01"),
    period2: new Date(),
    interval: "1d",
  });
  const map = new Map<string, number>();
  for (const q of chart.quotes ?? []) {
    if (q.date instanceof Date && typeof q.close === "number") {
      map.set(q.date.toISOString().slice(0, 10), q.close);
    }
  }
  return map;
}

function priceOnOrBefore(prices: Map<string, number>, dateIso: string): number | null {
  // Walk back up to 10 days to find a trading day
  for (let i = 0; i < 10; i += 1) {
    const d = new Date(`${dateIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const p = prices.get(iso);
    if (p !== undefined) return p;
  }
  return null;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const symbol = process.argv[2];
  const date = process.argv[3];
  if (!symbol || !date) {
    console.error("usage: smoothed-multiples-test SYMBOL YYYY-MM-DD");
    process.exit(1);
  }
  const cutoff = addDays(date, -REPORTING_LAG_DAYS);

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

  console.log(`=== ${symbol} @ ${date} (cutoff for public data: ${cutoff}) ===\n`);
  console.log(`peers (${peers.length}): ${peers.join(", ")}\n`);

  // Subject info
  const subjectAnnuals = await pullAnnuals(symbol);
  const subjectPublic = subjectAnnuals.filter((a) => a.periodEndDate <= cutoff);
  const subjectPrices = await pullPriceHistory(symbol);
  const subjectPrice = priceOnOrBefore(subjectPrices, date);
  const subjectLatestEps = subjectPublic[0]?.epsDiluted ?? null;
  console.log(`${symbol}: price $${subjectPrice?.toFixed(2)}, latest public EPS $${subjectLatestEps}\n`);

  // For each peer, compute current PE (what we use today) and 5Y smoothed PE
  console.log("Per-peer multiples:");
  console.log("  symbol  current-PE   5Y-smoothed-PE   (history of yearly PEs)");
  const currentPes: number[] = [];
  const smoothedPes: number[] = [];

  for (const peer of peers) {
    try {
      const annuals = await pullAnnuals(peer);
      const prices = await pullPriceHistory(peer);
      const publicAnnuals = annuals.filter((a) => a.periodEndDate <= cutoff);
      if (publicAnnuals.length === 0) {
        console.log(`  ${peer.padEnd(6)}  (no public annuals)`);
        continue;
      }
      // Current PE: peer's price-at-snapshot / latest public annual EPS
      const peerPrice = priceOnOrBefore(prices, date);
      const latestEps = publicAnnuals[0]?.epsDiluted;
      const currentPe = peerPrice !== null && latestEps !== null && latestEps > 0
        ? peerPrice / latestEps : null;

      // 5Y smoothed: for each of the last 5 public annuals, PE = price-at-period-end / EPS-for-that-period
      const recent5 = publicAnnuals.slice(0, SMOOTHING_YEARS);
      const annualPes: Array<{ year: string; pe: number }> = [];
      for (const a of recent5) {
        if (a.epsDiluted === null || a.epsDiluted <= 0) continue;
        const priceAtPeriodEnd = priceOnOrBefore(prices, a.periodEndDate);
        if (priceAtPeriodEnd === null) continue;
        annualPes.push({ year: a.periodEndDate.slice(0, 4), pe: priceAtPeriodEnd / a.epsDiluted });
      }
      const smoothedPe = annualPes.length >= 1 ? median(annualPes.map((x) => x.pe)) : null;

      const peHistoryStr = annualPes
        .map((x) => `${x.year}:${x.pe.toFixed(0)}`)
        .join(" ");
      console.log(
        `  ${peer.padEnd(6)}  ${(currentPe ?? 0).toFixed(1).padStart(8)}      ${(smoothedPe ?? 0).toFixed(1).padStart(8)}        ${peHistoryStr}`,
      );

      if (currentPe !== null && currentPe > 0) currentPes.push(currentPe);
      if (smoothedPe !== null && smoothedPe > 0) smoothedPes.push(smoothedPe);
    } catch (err) {
      console.log(`  ${peer.padEnd(6)}  err ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("\nCross-peer medians:");
  const peerMedianCurrent = currentPes.length > 0 ? median(currentPes) : null;
  const peerMedianSmoothed = smoothedPes.length > 0 ? median(smoothedPes) : null;
  console.log(`  current peer-median PE:  ${peerMedianCurrent?.toFixed(1)}  (n=${currentPes.length})`);
  console.log(`  smoothed peer-median PE: ${peerMedianSmoothed?.toFixed(1)}  (n=${smoothedPes.length})`);

  if (subjectLatestEps !== null && subjectLatestEps > 0) {
    console.log(`\nFair-value implications for ${symbol} (using subject EPS $${subjectLatestEps}):`);
    if (peerMedianCurrent !== null) {
      console.log(`  current method:  ${peerMedianCurrent.toFixed(1)} × $${subjectLatestEps} = $${(peerMedianCurrent * subjectLatestEps).toFixed(2)}`);
    }
    if (peerMedianSmoothed !== null) {
      console.log(`  5Y smoothed:     ${peerMedianSmoothed.toFixed(1)} × $${subjectLatestEps} = $${(peerMedianSmoothed * subjectLatestEps).toFixed(2)}`);
    }
    console.log(`  actual price at ${date}: $${subjectPrice?.toFixed(2)}`);
  }
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
