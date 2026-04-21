#!/usr/bin/env tsx
/**
 * Compare four candidate anchor-aggregation methods against a
 * point-in-time snapshot. Goal: see which one rescues the INTC Dec
 * 2023 false-bullish call without breaking the cases that work today.
 *
 * Methods:
 *   - Current  : peer-median of each peer's CURRENT PE (status quo)
 *   - A        : per-peer PE smoothed across each peer's own history,
 *                then cross-peer median of the smoothed values
 *   - B        : compute cross-peer median PE at each historical
 *                period-end, then median across time
 *   - D+E      : hybrid — winsorize the peer cohort, AND if the
 *                peer-median anchor diverges from own-historical by
 *                more than 3×, fall back to own-historical
 *
 * For each method, prints implied fair value (peer-median PE × subject
 * latest EPS). The closest-to-actual-price answer "wins" — but the
 * point isn't to overfit a single case, it's to see how each method
 * behaves and what tradeoffs they imply.
 *
 * Usage:
 *   npx tsx scripts/anchor-method-test.ts INTC 2023-12-31
 *   npx tsx scripts/anchor-method-test.ts TGT 2023-06-30   (control)
 */

import YahooFinance from "yahoo-finance2";
import type { Snapshot } from "@stockrank/core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const REPORTING_LAG_DAYS = 90;
const DIVERGE_THRESHOLD = 3.0;
const WINSORIZE_PCT = 0.10;

function n(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
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

type PeerData = {
  symbol: string;
  annuals: Annual[];   // public at the snapshot date, sorted newest-first
  prices: Map<string, number>;
  currentPrice: number;
};

function currentPe(peer: PeerData): number | null {
  const eps = peer.annuals[0]?.epsDiluted;
  if (eps === null || eps === undefined || eps <= 0) return null;
  return peer.currentPrice / eps;
}

/** Approach A: median of each peer's PE-at-period-end across their own history. */
function smoothedPePerPeer(peer: PeerData): number | null {
  const pes: number[] = [];
  for (const a of peer.annuals) {
    if (a.epsDiluted === null || a.epsDiluted <= 0) continue;
    const p = priceOnOrBefore(peer.prices, a.periodEndDate);
    if (p === null) continue;
    pes.push(p / a.epsDiluted);
  }
  return pes.length > 0 ? median(pes) : null;
}

/** Approach B helper: cross-peer median PE at one historical period-end. */
function crossPeerMedianAt(peers: PeerData[], dateIso: string): number | null {
  const pes: number[] = [];
  for (const peer of peers) {
    // Each peer's "latest annual at this past date"
    const cutoff = addDays(dateIso, -REPORTING_LAG_DAYS);
    const ann = peer.annuals.find((a) => a.periodEndDate <= cutoff);
    if (!ann || ann.epsDiluted === null || ann.epsDiluted <= 0) continue;
    const p = priceOnOrBefore(peer.prices, dateIso);
    if (p === null) continue;
    pes.push(p / ann.epsDiluted);
  }
  return pes.length > 0 ? median(pes) : null;
}

/** Trim the top and bottom WINSORIZE_PCT of a sorted-ish list. */
function winsorize(values: number[]): number[] {
  if (values.length < 5) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const dropEachSide = Math.max(1, Math.floor(sorted.length * WINSORIZE_PCT));
  return sorted.slice(dropEachSide, sorted.length - dropEachSide);
}

async function main() {
  const symbol = process.argv[2];
  const date = process.argv[3];
  if (!symbol || !date) {
    console.error("usage: anchor-method-test SYMBOL YYYY-MM-DD");
    process.exit(1);
  }
  const cutoff = addDays(date, -REPORTING_LAG_DAYS);

  const snapshot = JSON.parse(
    await readFile(resolve("public/data/snapshot-latest.json"), "utf8"),
  ) as Snapshot;
  const subjectCo = snapshot.companies.find((c) => c.symbol === symbol.toUpperCase());
  if (!subjectCo) { console.error(`${symbol} not in snapshot`); process.exit(1); }

  // Allow --peers SYM,SYM,... to override peer cohort manually (useful
  // for replaying the narrow cap-bucket cohort that production hits).
  const peersArgIdx = process.argv.findIndex((a) => a === "--peers");
  const peerSymbols = peersArgIdx > 0 && process.argv[peersArgIdx + 1]
    ? process.argv[peersArgIdx + 1]!.split(",").map((s) => s.trim().toUpperCase())
    : snapshot.companies
        .filter((c) => c.symbol !== symbol.toUpperCase() && c.industry === subjectCo.industry)
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 10)
        .map((c) => c.symbol);

  console.log(`=== ${symbol} @ ${date} (cutoff ${cutoff}) ===`);
  console.log(`peers: ${peerSymbols.join(", ")}\n`);

  const subjectAnnuals = await pullAnnuals(symbol);
  const subjectPrices = await pullPriceHistory(symbol);
  const subjectPublicAnnuals = subjectAnnuals.filter((a) => a.periodEndDate <= cutoff);
  const subjectPrice = priceOnOrBefore(subjectPrices, date)!;
  const subjectEps = subjectPublicAnnuals[0]?.epsDiluted;
  if (subjectEps === null || subjectEps === undefined || subjectEps <= 0) {
    console.error("subject has no usable EPS at this date");
    process.exit(1);
  }
  const subjectOwnPe = subjectPrice / subjectEps;
  console.log(`${symbol}: price $${subjectPrice.toFixed(2)}  EPS $${subjectEps}  own-PE ${subjectOwnPe.toFixed(1)}\n`);

  // Pull peers
  const peers: PeerData[] = [];
  for (const ps of peerSymbols) {
    try {
      const annuals = await pullAnnuals(ps);
      const publicAnnuals = annuals.filter((a) => a.periodEndDate <= cutoff);
      if (publicAnnuals.length === 0) continue;
      const prices = await pullPriceHistory(ps);
      const peerPrice = priceOnOrBefore(prices, date);
      if (peerPrice === null) continue;
      peers.push({ symbol: ps, annuals: publicAnnuals, prices, currentPrice: peerPrice });
    } catch (err) {
      console.log(`  ! ${ps}: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`gathered ${peers.length} peers\n`);

  // Compute each approach's peer-median PE
  const currentPes = peers.map(currentPe).filter((v): v is number => v !== null && v > 0);
  const currentMedian = median(currentPes);

  const smoothedPes = peers.map(smoothedPePerPeer).filter((v): v is number => v !== null && v > 0);
  const smoothedMedian = median(smoothedPes);

  // Approach B: walk last 4 annual period-end dates, compute cross-peer median at each
  // Use the subject's annual period-ends as the time axis.
  const histDates: string[] = [];
  for (const a of subjectPublicAnnuals.slice(0, 4)) histDates.push(a.periodEndDate);
  const historicalMedians = histDates
    .map((d) => crossPeerMedianAt(peers, d))
    .filter((v): v is number => v !== null && v > 0);
  const cohortSmoothedMedian = median(historicalMedians);

  // Approach D+E: winsorize first, then check own/peer divergence
  const winsorizedPes = winsorize(currentPes);
  const winsorizedMedian = median(winsorizedPes);
  const divergeRatio = winsorizedMedian !== null
    ? Math.max(winsorizedMedian / subjectOwnPe, subjectOwnPe / winsorizedMedian)
    : Infinity;
  const dePlusE = divergeRatio > DIVERGE_THRESHOLD ? subjectOwnPe : winsorizedMedian;

  // Print
  const fmt = (v: number | null, suffix = "") =>
    v === null ? "—" : `${v.toFixed(1)}${suffix}`;
  const fv = (pe: number | null) =>
    pe === null ? "—" : `$${(pe * subjectEps).toFixed(2)}`;

  console.log("Per-peer PE table:");
  console.log("  symbol  current   smoothed");
  for (const peer of peers) {
    console.log(`  ${peer.symbol.padEnd(6)}  ${fmt(currentPe(peer)).padStart(7)}   ${fmt(smoothedPePerPeer(peer)).padStart(7)}`);
  }
  console.log();

  console.log("Approach B (cohort cross-peer median at each historical date):");
  for (let i = 0; i < histDates.length; i += 1) {
    console.log(`  ${histDates[i]}  cross-peer-median PE: ${fmt(historicalMedians[i] ?? null)}`);
  }
  console.log();

  console.log("Final comparison:");
  console.log(`  ${"Method".padEnd(28)}${"Peer-median PE".padStart(18)}${"Implied FV".padStart(15)}${"vs actual".padStart(14)}`);
  const compare = (label: string, pe: number | null) => {
    const impl = pe !== null ? pe * subjectEps : null;
    const diff = impl !== null
      ? `${(((impl - subjectPrice) / subjectPrice) * 100).toFixed(0)}%`
      : "—";
    console.log(`  ${label.padEnd(28)}${fmt(pe).padStart(18)}${fv(pe).padStart(15)}${diff.padStart(14)}`);
  };
  compare("Current (status quo)", currentMedian);
  compare("A: per-peer smoothed", smoothedMedian);
  compare("B: cohort smoothed time", cohortSmoothedMedian);
  compare(`D: winsorized (drop ${(WINSORIZE_PCT*100).toFixed(0)}%)`, winsorizedMedian);
  compare(`D+E: winsorize + own-fallback (${DIVERGE_THRESHOLD}x)`, dePlusE);
  console.log();
  console.log(`  Subject own-PE: ${subjectOwnPe.toFixed(1)}  (peer/own diverge ratio: ${divergeRatio.toFixed(2)}x)`);
  console.log(`  D+E ${divergeRatio > DIVERGE_THRESHOLD ? "fired own-fallback" : "used peer-median"}`);
  console.log();
  console.log(`  Actual price: $${subjectPrice.toFixed(2)}`);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
