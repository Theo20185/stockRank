#!/usr/bin/env tsx
/**
 * Portfolio-level CSP regime simulator.
 *
 * Single $65k account, deployed across the engine's Candidate cohort
 * via cash-secured puts. Models:
 *   - All cash earns risk-free rate (idle OR collateralizing an open CSP)
 *   - Premium compounds: when accumulated cash funds another full
 *     contract on a fresh Candidate, deploy it (no fractional contracts)
 *   - At expiry: assigned → hold stock to end of backtest; OTM → cash
 *     released, no roll on the same name (wait for next flag date for
 *     fresh Candidates)
 *   - Strike = 0.95 × spot at flag (always below p25 by Candidate def)
 *   - 30-day put expiry
 *
 * Deployment policy at each quarter-end flag date:
 *   - Get Candidates ranked by composite (top first)
 *   - For each, if we don't already have an open CSP or held stock on
 *     that symbol, and we have enough cash for 1 contract: sell it.
 *   - Continue until either Candidates exhausted or cash too low.
 *
 * Benchmark: same $65k invested equal-weight in all non-Mag-7 universe
 * names at backtest start, held to end.
 *
 * Usage:
 *   npx tsx scripts/backtest-portfolio-csp.ts
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  fetchCompanyFacts,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "../packages/data/src/edgar/index.js";
import type { HistoricalBar } from "../packages/data/src/edgar/mapper.js";
import {
  rank,
  fairValueFor,
  bucketRows,
  estimateCallPremiumPct,
  type RankedRow,
} from "@stockrank/ranking";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";

const CACHE_DIR = resolve(process.cwd(), "tmp/backtest-cache");
const SNAPSHOT_PATH = resolve(process.cwd(), "public/data/snapshot-latest.json");
const OUTPUT_PATH = resolve(process.cwd(), "tmp/backtest-portfolio-csp.json");

const STARTING_CAPITAL = 65_000;
const MONTHLY_CONTRIBUTION = 2_000;
const BACKTEST_START = "2017-12-31";
const BACKTEST_END = "2026-04-22"; // latest data point in cache
const RISK_FREE_RATE = 0.04;

/* Strategy mode:
 *   "yield-aware" (default) — Strike selected by max time-value yield
 *     via grid search across [0.85, 1.0] of spot. Capital cycles when
 *     a fresh CSP's annualized TV-yield exceeds the remaining yield
 *     of an open position (with margin). 90-day default cycle.
 *   "wheel" — Legacy ITM-at-p25 mode (validated as suboptimal once
 *     the pricing-model bug was corrected). Preserved for comparison.
 */
const STRATEGY_MODE = (process.env.STRATEGY_MODE ?? "yield-aware") as "yield-aware" | "wheel";
const WHEEL_MODE = STRATEGY_MODE === "wheel";

/* Yield-arbitrage close threshold (yield-aware mode only). Close an
 * open CSP when the best available new-CSP TV-yield exceeds the
 * existing CSP's remaining TV-yield × this multiplier. 1.20 = require
 * 20% yield improvement to bother rotating capital. */
const YIELD_CLOSE_MARGIN = Number(process.env.YIELD_CLOSE_MARGIN ?? "1.20");

/* Strike search grid for yield-aware mode. Tries each multiplier of
 * spot, computes time-value yield using parity-corrected pricing,
 * picks the strike with peak yield. Slightly-OTM strikes typically
 * win for short-to-mid-DTE puts. */
const STRIKE_SEARCH_MULTIPLIERS = [0.80, 0.85, 0.90, 0.93, 0.95, 0.97, 0.99, 1.00];

/* CSP strike depth from current spot to p25, in [0, 1]:
 *   0.0  → ATM (strike = current)
 *   0.5  → midpoint between current and p25
 *   1.0  → strike = p25 (validated baseline; deepest ITM)
 * Override via CSP_STRIKE_DEPTH env var. */
const CSP_STRIKE_DEPTH = Number(process.env.CSP_STRIKE_DEPTH ?? "1.0");

/* Buy-to-close profit threshold, in [0, 1]:
 *   Close the CSP when current value ≤ original premium × (1 - X).
 *   E.g., 0.50 = close at 50% max profit captured (Tasty rule).
 *   1.00 (or anything > 0.95) means "wait until intrinsic gone" — the
 *   prior baseline behavior (we only closed when spot ≥ strike).
 * Override via B2C_PROFIT_PCT env var. */
const B2C_PROFIT_PCT = Number(process.env.B2C_PROFIT_PCT ?? "1.0");

/* Position-close profit threshold above effective basis (default 0.10
 * = 10%). Override via POSITION_CLOSE_PROFIT env var. */
const POSITION_CLOSE_PROFIT = Number(process.env.POSITION_CLOSE_PROFIT ?? "0.10");

const CSP_DOWNSIDE_PCT = 5;            // used only when STRATEGY_MODE = "wheel"
const CSP_CYCLE_DAYS = Number(
  process.env.CSP_CYCLE_DAYS ?? (STRATEGY_MODE === "wheel" ? 365 : 30),
);
const CSP_VOL_LOOKBACK_DAYS = Math.max(30, CSP_CYCLE_DAYS);
const CSP_MIN_VOL = 0.08;
const CSP_MAX_VOL = 0.80;
/** Flat dividend yield for put-call parity adjustment on ITM options.
 * S&P 500 average ~1.5-2%; varies meaningfully by stock (utilities
 * ~4-5%, growth tech 0%). Flat 2% is a crude approximation — slightly
 * understates premium on low-payers, slightly overstates on high-
 * payers. Without per-stock yield data in the wheel sim, this is the
 * best simple correction. */
const FLAT_DIVIDEND_YIELD = 0.02;

/* Covered call parameters — written on assigned shares at next flag date.
 * Strike anchors to p25 fair value (engine's conservative target). If
 * p25 ≤ spot (stock already at/above target), cap at spot × 1.02 so the
 * call is at least slightly OTM and not auto-exercised. */
const CC_EXPIRY_DAYS = 365;
const CC_MIN_OTM_PCT = 2;            // floor: never write a CC less than 2% OTM

const MAG7 = new Set<string>([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
]);

/* ─── Date helpers ─────────────────────────────────────────────── */

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
      86_400_000,
  );
}

/** First-of-month dates strictly AFTER `start` and at-or-before `end`.
 * The strict-after avoids double-counting an initial cash injection on
 * the same date as start. */
function monthStartsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  while (cursor.toISOString().slice(0, 10) <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Compute IRR via bisection. Cash flows: negative = outflow (deposit),
 * positive = inflow (terminal value). Returns annualized rate as a
 * decimal (0.10 = 10%/yr). */
function computeIrr(
  cashFlows: Array<{ date: string; amount: number }>,
  startDate: string,
): number {
  if (cashFlows.length < 2) return 0;
  const flows = cashFlows.map((cf) => ({
    years: daysBetween(startDate, cf.date) / 365,
    amount: cf.amount,
  }));
  function npv(rate: number): number {
    return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.years), 0);
  }
  // Bracket the root. At very low rate (-0.99) NPV is huge positive;
  // at very high rate (10) it shrinks toward terminal-only.
  let lo = -0.5;
  let hi = 5.0;
  let npvLo = npv(lo);
  let npvHi = npv(hi);
  // Ensure opposite signs.
  if (npvLo * npvHi > 0) {
    // Search for a sign change.
    for (let r = -0.9; r <= 10; r += 0.05) {
      const v = npv(r);
      if (v * npvLo < 0) { hi = r; npvHi = v; break; }
    }
  }
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const v = npv(mid);
    if (Math.abs(v) < 0.5 || hi - lo < 1e-7) return mid;
    if (v > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function quarterEndsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  cursor.setUTCDate(1);
  while (cursor.toISOString().slice(0, 10) <= end) {
    const m = cursor.getUTCMonth();
    if (m === 2 || m === 5 || m === 8 || m === 11) {
      const last = new Date(Date.UTC(cursor.getUTCFullYear(), m + 1, 0));
      const iso = last.toISOString().slice(0, 10);
      if (iso >= start && iso <= end) out.push(iso);
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/* ─── Price helpers ────────────────────────────────────────────── */

type DailyQuote = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
};
type ChartCacheFile = { quotes: DailyQuote[] };

async function loadDailyBars(symbol: string): Promise<HistoricalBar[]> {
  const path = resolve(CACHE_DIR, symbol, "chart.json");
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, "utf8");
    const file = JSON.parse(raw) as ChartCacheFile;
    if (!Array.isArray(file.quotes)) return [];
    return file.quotes
      .map((q) => ({
        date: q.date.slice(0, 10),
        close: q.close,
        high: q.high ?? q.close,
        low: q.low ?? q.close,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function priceAtOrBefore(bars: HistoricalBar[], dateIso: string): number | null {
  let last: number | null = null;
  for (const b of bars) {
    if (b.date <= dateIso) last = b.close;
    else break;
  }
  return last;
}

function priceAtOrAfter(bars: HistoricalBar[], dateIso: string): { date: string; close: number } | null {
  for (const b of bars) {
    if (b.date >= dateIso) return { date: b.date, close: b.close };
  }
  return null;
}

function realizedVol(bars: HistoricalBar[], asOfDate: string, lookbackDays: number): number {
  const closes: number[] = [];
  for (let i = bars.length - 1; i >= 0 && closes.length < lookbackDays + 1; i -= 1) {
    if (bars[i]!.date > asOfDate) continue;
    closes.unshift(bars[i]!.close);
  }
  if (closes.length < 5) return CSP_MIN_VOL;
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    if (closes[i - 1]! > 0 && closes[i]! > 0) {
      logReturns.push(Math.log(closes[i]! / closes[i - 1]!));
    }
  }
  if (logReturns.length < 4) return CSP_MIN_VOL;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const annualized = Math.sqrt(variance) * Math.sqrt(252);
  return Math.max(CSP_MIN_VOL, Math.min(CSP_MAX_VOL, annualized));
}

/* ─── Snapshot building (EDGAR + Yahoo) ───────────────────────── */

function profileFromSnapshot(c: CompanySnapshot): SymbolProfile {
  const shares = c.marketCap > 0 && c.quote.price > 0 ? c.marketCap / c.quote.price : 0;
  return {
    symbol: c.symbol, name: c.name, sector: c.sector, industry: c.industry,
    exchange: c.exchange, currency: c.currency, authoritativeShares: shares,
  };
}

async function loadAllData(snapshot: Snapshot): Promise<{
  facts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>;
  bars: Map<string, HistoricalBar[]>;
  profiles: Map<string, SymbolProfile>;
}> {
  const facts = new Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>();
  const bars = new Map<string, HistoricalBar[]>();
  const profiles = new Map<string, SymbolProfile>();
  let i = 0;
  let factsLoaded = 0;
  let barsLoaded = 0;
  for (const c of snapshot.companies) {
    i += 1;
    if (MAG7.has(c.symbol)) continue;
    profiles.set(c.symbol, profileFromSnapshot(c));
    try {
      const f = await fetchCompanyFacts(c.symbol, { cacheTtlHours: 24 * 365 });
      facts.set(c.symbol, f);
      factsLoaded += 1;
    } catch { /* skip */ }
    const b = await loadDailyBars(c.symbol);
    if (b.length > 0) {
      bars.set(c.symbol, b);
      barsLoaded += 1;
    }
    if (i % 100 === 0) console.log(`  loaded ${i}/${snapshot.companies.length} (facts=${factsLoaded} bars=${barsLoaded})`);
  }
  console.log(`Loaded ${factsLoaded} EDGAR facts, ${barsLoaded} bar histories.`);
  return { facts, bars, profiles };
}

function snapshotsAt(
  date: string,
  facts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>,
  bars: Map<string, HistoricalBar[]>,
  profiles: Map<string, SymbolProfile>,
): CompanySnapshot[] {
  const out: CompanySnapshot[] = [];
  for (const [symbol, profile] of profiles) {
    const f = facts.get(symbol);
    const b = bars.get(symbol);
    if (!f || !b || b.length === 0) continue;
    const snap = synthesizeSnapshotAt(f, b, date, profile);
    if (snap) out.push(snap);
  }
  return out;
}

/* ─── Portfolio state ──────────────────────────────────────────── */

type OpenCsp = {
  symbol: string;
  strike: number;
  expiry: string;
  premium: number;            // $ received
  capitalReserved: number;    // strike × 100 (assumed 1 contract)
};

type OpenCoveredCall = {
  symbol: string;
  strike: number;             // = p25 (or spot × 1.02 floor)
  expiry: string;
  premium: number;            // $ received
  shares: number;             // typically 100 — must match the held position
};

type HeldStock = {
  symbol: string;
  shares: number;
  costBasis: number;            // total $ paid (= strike × 100 at assignment)
  acquiredAt: string;
  /** Cumulative CSP premium received that led to this position
   * (sum across multiple assignments on same symbol). Used to
   * compute effective break-even = (costBasis - cspPremiumReceived
   * - ccNetPremium) / shares. */
  cspPremiumReceived: number;
  /** CC premium net of any buybacks across the position's lifetime. */
  ccNetPremium: number;
};

type PortfolioState = {
  cash: number;               // includes both idle AND collateral (all earn rfr)
  openCsps: OpenCsp[];
  openCalls: OpenCoveredCall[];
  heldStocks: HeldStock[];
  /** Reserved capital — open CSP collateral. Earns interest but can't fund new contracts. */
  reservedCash: number;
  /** Cumulative premium collected (CSP + CC; informational). */
  totalPremiumCollected: number;
  /** Cumulative interest earned (informational). */
  totalInterestEarned: number;
  /** Number of CSP contracts ever sold. */
  cspContractsSold: number;
  /** Number of CSP assignments. */
  cspAssignments: number;
  /** Number of CSP OTM expiries. */
  cspExpiredOtm: number;
  /** Number of covered calls ever written. */
  ccContractsWritten: number;
  /** Number of CCs that resulted in shares being called away. */
  ccCalledAway: number;
  /** Number of CCs that expired OTM (we kept the shares). */
  ccExpiredOtm: number;
  /** Premium collected on CSPs only. */
  cspPremiumTotal: number;
  /** Premium collected on CCs only. */
  ccPremiumTotal: number;
  /** Number of CSPs closed early (bought back when underlying recovered above strike). */
  cspsClosedEarly: number;
  /** Total $ paid to buy back CSPs early. */
  earlyCloseCostTotal: number;
  /** Number of held positions closed out when spot ≥ p25 (sell stock + buy back CC). */
  positionsClosedEarly: number;
  /** Cumulative P&L from position closes (proceeds − costBasis − ccBuyback). */
  positionClosePnlTotal: number;
  /** Number of position closes triggered by 10%-above-effective-basis profit rule. */
  positionsClosedByProfit: number;
};

function freeCash(state: PortfolioState): number {
  return state.cash - state.reservedCash;
}

/** Estimate the current value of an option in $/share. Uses put-call
 * parity to correctly price ITM options:
 *
 *   Effective intrinsic for put  = max(0, K·e^(-rT) − S·e^(-qT))
 *   Effective intrinsic for call = max(0, S·e^(-qT) − K·e^(-rT))
 *
 * This is the key fix vs naive intrinsic = K - S: deep-ITM puts get
 * a "carry adjustment" because the strike is paid at expiry (PV is
 * less than K) and the holder forgoes dividends (q-discount on S).
 * For 1y deep-ITM puts on dividend payers, this can flip the
 * "effective discount vs spot" from negative (model said discount)
 * to zero or positive (real market shows no discount).
 *
 * Time value component uses estimateCallPremiumPct at symmetric
 * moneyness (put-call parity for OTM). */
function estimatePutValuePerShare(
  strike: number,
  spot: number,
  daysRemaining: number,
  vol: number,
): number {
  if (daysRemaining <= 0) return Math.max(0, strike - spot);
  const T = daysRemaining / 365;
  const pvK = strike * Math.exp(-RISK_FREE_RATE * T);
  const pvS = spot * Math.exp(-FLAT_DIVIDEND_YIELD * T);
  const effectiveIntrinsic = Math.max(0, pvK - pvS);
  const moneynessPct = Math.abs(((strike - spot) / spot) * 100);
  const timeValuePct = estimateCallPremiumPct({
    upsideToStrikePct: moneynessPct,
    yearsToExpiry: T,
    annualizedIv: vol,
  });
  const timeValue = (timeValuePct / 100) * spot;
  return effectiveIntrinsic + timeValue;
}

/** Find the strike that maximizes time-value yield (= TV / strike)
 * across a small grid of multipliers. Used by yield-aware mode to
 * pick the put strike a real-market chain would give us when the
 * "best yield" rule is applied. Caps strikes at p25 (engine's value
 * approval); skips strikes where the parity-corrected premium
 * doesn't exceed naive intrinsic (no real time-value). */
function findBestYieldPutStrike(
  spot: number,
  p25: number,
  vol: number,
  daysToExpiry: number,
): { strike: number; premiumPerShare: number; tvYield: number } | null {
  let best: { strike: number; premiumPerShare: number; tvYield: number } | null = null;
  for (const mult of STRIKE_SEARCH_MULTIPLIERS) {
    const strike = spot * mult;
    if (strike > p25) continue;
    const premiumPerShare = estimatePutValuePerShare(strike, spot, daysToExpiry, vol);
    const intrinsic = Math.max(0, strike - spot);
    const timeValue = premiumPerShare - intrinsic;
    if (timeValue <= 0) continue;
    const tvYield = timeValue / strike;
    if (best === null || tvYield > best.tvYield) {
      best = { strike, premiumPerShare, tvYield };
    }
  }
  return best;
}

/** Same parity-corrected pricing for calls (used for CC writing and
 * CC buyback during position close). */
function estimateCallValuePerShare(
  strike: number,
  spot: number,
  daysRemaining: number,
  vol: number,
): number {
  if (daysRemaining <= 0) return Math.max(0, spot - strike);
  const T = daysRemaining / 365;
  const pvK = strike * Math.exp(-RISK_FREE_RATE * T);
  const pvS = spot * Math.exp(-FLAT_DIVIDEND_YIELD * T);
  const effectiveIntrinsic = Math.max(0, pvS - pvK);
  const moneynessPct = Math.abs(((strike - spot) / spot) * 100);
  const timeValuePct = estimateCallPremiumPct({
    upsideToStrikePct: moneynessPct,
    yearsToExpiry: T,
    annualizedIv: vol,
  });
  const timeValue = (timeValuePct / 100) * spot;
  return effectiveIntrinsic + timeValue;
}

/** Accrue daily-compounded interest on all cash (idle + reserved) over
 * `days` days at risk-free rate. */
function accrueInterest(state: PortfolioState, days: number): void {
  if (days <= 0 || state.cash <= 0) return;
  const dailyRate = RISK_FREE_RATE / 365;
  const factor = Math.pow(1 + dailyRate, days);
  const before = state.cash;
  state.cash = state.cash * factor;
  state.totalInterestEarned += state.cash - before;
}

/* ─── Portfolio valuation at a point in time ──────────────────── */

function portfolioValue(
  state: PortfolioState,
  bars: Map<string, HistoricalBar[]>,
  asOf: string,
): { cash: number; stocks: number; openCspMtm: number; openCallMtm: number; total: number } {
  let stocks = 0;
  for (const h of state.heldStocks) {
    const b = bars.get(h.symbol);
    const px = b ? priceAtOrBefore(b, asOf) ?? 0 : 0;
    stocks += px * h.shares;
  }
  // Short put intrinsic = max(0, strike - spot) × 100. Liability.
  let openCspMtm = 0;
  for (const o of state.openCsps) {
    const b = bars.get(o.symbol);
    const px = b ? priceAtOrBefore(b, asOf) ?? o.strike : o.strike;
    const intrinsicPerShare = Math.max(0, o.strike - px);
    openCspMtm -= intrinsicPerShare * 100;
  }
  // Short call intrinsic = max(0, spot - strike) × 100. Liability —
  // capped by the held stock's value (covered position; max loss is
  // opportunity cost above strike).
  let openCallMtm = 0;
  for (const c of state.openCalls) {
    const b = bars.get(c.symbol);
    const px = b ? priceAtOrBefore(b, asOf) ?? c.strike : c.strike;
    const intrinsicPerShare = Math.max(0, px - c.strike);
    openCallMtm -= intrinsicPerShare * c.shares;
  }
  return {
    cash: state.cash,
    stocks,
    openCspMtm,
    openCallMtm,
    total: state.cash + stocks + openCspMtm + openCallMtm,
  };
}

/* ─── Main simulation ─────────────────────────────────────────── */

type PerEvent = {
  date: string;
  type: "flag" | "expiry" | "valuation";
  detail?: string;
};

async function main(): Promise<void> {
  const startTs = Date.now();
  console.log(`Portfolio CSP backtest: ${BACKTEST_START} → ${BACKTEST_END}`);
  console.log(`Starting capital: $${STARTING_CAPITAL.toLocaleString()}`);
  console.log(`Risk-free rate: ${(RISK_FREE_RATE * 100).toFixed(1)}%`);
  if (STRATEGY_MODE === "yield-aware") {
    console.log(`Strategy: YIELD-AWARE — best-TV-yield strike + Tasty 50% close`);
    console.log(`  CSP_CYCLE_DAYS=${CSP_CYCLE_DAYS}`);
    console.log(`  Strike: max time-value yield via grid search (slightly OTM typically)`);
    console.log(`  Close: when current put value ≤ 50% of original premium`);
    console.log(`  POSITION_CLOSE_PROFIT=${POSITION_CLOSE_PROFIT} (above effective basis)`);
  } else if (WHEEL_MODE) {
    console.log(`Strategy: WHEEL (legacy) — 1y CSPs at p25, CCs at cost basis.`);
    console.log(`  CSP_STRIKE_DEPTH=${CSP_STRIKE_DEPTH}`);
    console.log(`  B2C_PROFIT_PCT=${B2C_PROFIT_PCT}`);
    console.log(`  POSITION_CLOSE_PROFIT=${POSITION_CLOSE_PROFIT}`);
  }

  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as Snapshot;
  console.log(`Universe: ${snapshot.companies.length} symbols (Mag 7 excluded).`);
  const { facts, bars, profiles } = await loadAllData(snapshot);

  // Note: previously the engine deployed only at quarter-ends. Now
  // every monthly contribution event triggers a re-rank and deploy
  // attempt, so cash is only idle when no Candidate fits.

  // ── State init ──
  const state: PortfolioState = {
    cash: STARTING_CAPITAL,
    openCsps: [],
    openCalls: [],
    heldStocks: [],
    reservedCash: 0,
    totalPremiumCollected: 0,
    totalInterestEarned: 0,
    cspContractsSold: 0,
    cspAssignments: 0,
    cspExpiredOtm: 0,
    ccContractsWritten: 0,
    ccCalledAway: 0,
    ccExpiredOtm: 0,
    cspPremiumTotal: 0,
    ccPremiumTotal: 0,
    cspsClosedEarly: 0,
    earlyCloseCostTotal: 0,
    positionsClosedEarly: 0,
    positionClosePnlTotal: 0,
    positionsClosedByProfit: 0,
  };

  // ── Build event timeline.
  //
  // The user's intent: "the only time cash is idle is if there are
  // truly no Candidates to buy." So every deploy opportunity (initial
  // capital + each $2k monthly contribution) re-runs the engine and
  // deploys whatever the cash pile supports. No quarterly gating.
  // Expiries (CSP and CC) are injected dynamically; they free cash
  // that the next monthly deploy event will pick up.
  type Event =
    | { date: string; kind: "deploy"; contribution: number }
    | { date: string; kind: "csp-expiry"; csp: OpenCsp }
    | { date: string; kind: "cc-expiry"; cc: OpenCoveredCall };

  const events: Event[] = [];
  // Initial deployment on day 0 — cash already in state.cash, so
  // contribution amount is 0 (we don't double-add).
  events.push({ date: BACKTEST_START, kind: "deploy", contribution: 0 });
  const contributionDates = monthStartsBetween(BACKTEST_START, BACKTEST_END);
  for (const d of contributionDates) {
    events.push({ date: d, kind: "deploy", contribution: MONTHLY_CONTRIBUTION });
  }
  // Final valuation event (no contribution, no deploy — just snapshot).
  events.push({ date: BACKTEST_END, kind: "deploy", contribution: 0 });
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Track the cash-flow series for IRR computation.
  const cashFlows: Array<{ date: string; amount: number }> = [
    { date: BACKTEST_START, amount: -STARTING_CAPITAL },
  ];
  for (const d of contributionDates) {
    cashFlows.push({ date: d, amount: -MONTHLY_CONTRIBUTION });
  }
  let totalContributed = STARTING_CAPITAL + contributionDates.length * MONTHLY_CONTRIBUTION;
  console.log(`DCA: $${MONTHLY_CONTRIBUTION}/mo × ${contributionDates.length} months = $${(contributionDates.length * MONTHLY_CONTRIBUTION).toLocaleString()} contributions`);
  console.log(`Total invested: $${totalContributed.toLocaleString()}`);
  console.log(`Deploy events: ${1 + contributionDates.length} (every contribution triggers re-rank + deploy)`);

  let lastEventDate = BACKTEST_START;
  const log: PerEvent[] = [];
  const valuationSeries: Array<{ date: string; total: number; cash: number; stocks: number }> = [];

  while (events.length > 0) {
    const ev = events.shift()!;
    // Stop processing events past BACKTEST_END. With 1y CSPs/CCs sold
    // near the end of the window, their expiries fall past the data
    // cutoff. Processing them would silently fast-forward state using
    // BACKTEST_END prices (priceAtOrBefore returns the latest cached
    // bar) and mutate "final" to include outcomes that haven't yet
    // happened. Open positions at BACKTEST_END are valued via mark-
    // to-market in portfolioValue() instead.
    if (ev.date > BACKTEST_END) continue;
    // Process events strictly in date order. Same-day events accrue
    // 0 days of interest (accrueInterest no-ops on days <= 0); they
    // must NOT be skipped — multiple CSPs can expire on the same
    // day, and skipping all but the first leaves stale state.
    const days = daysBetween(lastEventDate, ev.date);
    if (days < 0) continue; // out-of-order safety guard only
    accrueInterest(state, days);
    lastEventDate = ev.date;

    if (ev.kind === "csp-expiry") {
      const csp = ev.csp;
      const symBars = bars.get(csp.symbol);
      const exitPx = symBars ? priceAtOrBefore(symBars, ev.date) : null;
      const idx = state.openCsps.findIndex((o) => o === csp);
      if (idx >= 0) state.openCsps.splice(idx, 1);
      state.reservedCash -= csp.capitalReserved;
      if (exitPx !== null && exitPx <= csp.strike) {
        // Assigned: cash goes to stock at strike, premium kept (already in cash).
        // Aggregate same-symbol assignments into a single heldStocks
        // entry so CC writing can cover the full position with one
        // contract group.
        state.cash -= csp.capitalReserved;
        const existing = state.heldStocks.find((h) => h.symbol === csp.symbol);
        if (existing) {
          existing.shares += 100;
          existing.costBasis += csp.capitalReserved;
          existing.cspPremiumReceived += csp.premium;
        } else {
          state.heldStocks.push({
            symbol: csp.symbol,
            shares: 100,
            costBasis: csp.capitalReserved,
            acquiredAt: ev.date,
            cspPremiumReceived: csp.premium,
            ccNetPremium: 0,
          });
        }
        state.cspAssignments += 1;
        log.push({ date: ev.date, type: "expiry", detail: `CSP-ASSIGN ${csp.symbol} @ ${csp.strike.toFixed(2)} (spot ${exitPx.toFixed(2)})` });
      } else {
        state.cspExpiredOtm += 1;
        log.push({ date: ev.date, type: "expiry", detail: `CSP-OTM ${csp.symbol} @ ${csp.strike.toFixed(2)} (spot ${exitPx?.toFixed(2) ?? "?"}) — collateral freed` });
      }
      continue;
    }

    if (ev.kind === "cc-expiry") {
      const cc = ev.cc;
      const symBars = bars.get(cc.symbol);
      const exitPx = symBars ? priceAtOrBefore(symBars, ev.date) : null;
      const idx = state.openCalls.findIndex((c) => c === cc);
      if (idx >= 0) state.openCalls.splice(idx, 1);
      const stockIdx = state.heldStocks.findIndex((h) => h.symbol === cc.symbol);
      if (exitPx !== null && exitPx >= cc.strike && stockIdx >= 0) {
        // Called away: cc.shares sold at strike. Reduce held position
        // by cc.shares (or remove entry if fully sold).
        const stock = state.heldStocks[stockIdx]!;
        const sharesSold = Math.min(cc.shares, stock.shares);
        state.cash += cc.strike * sharesSold;
        if (sharesSold >= stock.shares) {
          state.heldStocks.splice(stockIdx, 1);
        } else {
          // Reduce shares + cost basis + premium tracking proportionally.
          const ratio = sharesSold / stock.shares;
          stock.costBasis -= stock.costBasis * ratio;
          stock.cspPremiumReceived -= stock.cspPremiumReceived * ratio;
          stock.ccNetPremium -= stock.ccNetPremium * ratio;
          stock.shares -= sharesSold;
        }
        state.ccCalledAway += 1;
        log.push({ date: ev.date, type: "expiry", detail: `CC-CALLED ${cc.symbol} @ ${cc.strike.toFixed(2)} (spot ${exitPx.toFixed(2)}) — ${sharesSold} sh sold` });
      } else {
        state.ccExpiredOtm += 1;
        log.push({ date: ev.date, type: "expiry", detail: `CC-OTM ${cc.symbol} @ ${cc.strike.toFixed(2)} (spot ${exitPx?.toFixed(2) ?? "?"}) — kept stock` });
      }
      continue;
    }

    if (ev.kind === "deploy") {
      // Add this period's contribution (if any) to the cash pool.
      if (ev.contribution > 0) state.cash += ev.contribution;

      // Final-valuation event — snapshot but skip engine + deploy.
      if (ev.date === BACKTEST_END) {
        const v = portfolioValue(state, bars, ev.date);
        valuationSeries.push({ date: ev.date, total: v.total, cash: v.cash, stocks: v.stocks });
        continue;
      }

      // Run the engine. Skip if universe too small (sparse early data).
      const universe = snapshotsAt(ev.date, facts, bars, profiles);
      if (universe.length < 50) {
        log.push({ date: ev.date, type: "flag", detail: `SKIP (universe ${universe.length} too small)` });
        continue;
      }
      const ranked = rank({ companies: universe, snapshotDate: ev.date });
      for (const row of ranked.rows) {
        const c = universe.find((u) => u.symbol === row.symbol);
        if (c) row.fairValue = fairValueFor(c, universe);
      }
      const buckets = bucketRows([...ranked.rows]);
      const candidates = buckets.ranked
        .slice()
        .sort((a, b) => b.composite - a.composite);

      // Build a quick lookup of fairValue.range.p25 by symbol for CC writing.
      const p25BySymbol = new Map<string, number>();
      for (const row of ranked.rows) {
        if (row.fairValue?.range?.p25) p25BySymbol.set(row.symbol, row.fairValue.range.p25);
      }

      // ── (0a) Buy-to-close any open CSP whose underlying has recovered
      //         above strike (put is now OTM, intrinsic gone). Pay
      //         current time-value to close, free the collateral, and
      //         skip the originally-scheduled expiry event.
      //
      //         Symbols closed here go into closedCspSymbols and feed
      //         closedThisCycle below — same-cycle redeploy on these
      //         names is blocked.
      let earlyClosed = 0;
      const closedCspSymbols = new Set<string>();
      const closedCsps = new Set<OpenCsp>();
      for (const csp of state.openCsps) {
        const symBars = bars.get(csp.symbol);
        if (!symBars) continue;
        const spot = priceAtOrBefore(symBars, ev.date);
        if (spot === null) continue;
        const daysRemaining = daysBetween(ev.date, csp.expiry);
        if (daysRemaining <= 0) continue;
        const vol = realizedVol(symBars, ev.date, CSP_VOL_LOOKBACK_DAYS);
        const valuePerShare = estimatePutValuePerShare(
          csp.strike,
          spot,
          daysRemaining,
          vol,
        );
        const closeCost = valuePerShare * 100;

        let shouldClose = false;
        if (STRATEGY_MODE === "yield-aware") {
          // Tasty's 50% max-profit rule: close when current put value
          // is ≤ 50% of original premium. This captures the back-
          // loaded theta decay curve — by mid-cycle ~50% of premium
          // has decayed, and the remaining time-value yield is no
          // longer competitive with starting fresh. Empirically the
          // standard rule for short-dated CSP income strategies.
          //
          // We tested a yield-arbitrage rule (close when fresh yield
          // > remaining yield × 1.20) and it churned catastrophically
          // because "fresh yield" comes from whichever Candidate has
          // the highest vol at any moment, which changes constantly.
          // Tasty's static threshold is more robust.
          const targetCloseCost = csp.premium * 0.5;
          shouldClose = closeCost <= targetCloseCost;
        } else if (B2C_PROFIT_PCT >= 1.0) {
          shouldClose = spot >= csp.strike;
        } else {
          const targetCloseCost = csp.premium * (1 - B2C_PROFIT_PCT);
          shouldClose = closeCost <= targetCloseCost;
        }
        if (!shouldClose) continue;
        state.cash -= closeCost;
        state.reservedCash -= csp.capitalReserved;
        state.cspsClosedEarly += 1;
        state.earlyCloseCostTotal += closeCost;
        closedCsps.add(csp);
        closedCspSymbols.add(csp.symbol);
        earlyClosed += 1;
      }
      if (closedCsps.size > 0) {
        state.openCsps = state.openCsps.filter((c) => !closedCsps.has(c));
        for (let i = events.length - 1; i >= 0; i -= 1) {
          const e = events[i]!;
          if (e.kind === "csp-expiry" && closedCsps.has(e.csp)) {
            events.splice(i, 1);
          }
        }
      }

      // ── (0b) Position close-out: when held stock rallies to ≥ p25
      //          OR has reached ≥10% profit on effective break-even,
      //          sell stock + buy back any open CC. Two triggers fold
      //          into one sweep: (a) engine's exit signal (p25) and
      //          (b) profit-take rule (effective-basis × 1.10).
      //
      //          Effective break-even = (costBasis - cspPremiumReceived
      //          - ccNetPremium) / shares — the all-in cost per share
      //          after accounting for premium income. A profit close
      //          fires when current spot exceeds break-even by the
      //          PROFIT_CLOSE_THRESHOLD (default 10%).
      //
      //          Symbols closed this cycle are added to closedThisCycle
      //          so the CSP deploy step won't immediately redeploy
      //          back into the same ticker — capital must rotate to a
      //          different name (avoids round-trip churn).
      const PROFIT_CLOSE_THRESHOLD = POSITION_CLOSE_PROFIT;
      const closedThisCycle = new Set<string>();
      let positionsClosed = 0;
      let profitClosed = 0;
      if (WHEEL_MODE) {
        const stocksToClose: typeof state.heldStocks = [];
        const closeReason = new Map<typeof state.heldStocks[number], "p25" | "profit">();
        for (const stock of state.heldStocks) {
          const symBars = bars.get(stock.symbol);
          if (!symBars) continue;
          const spot = priceAtOrBefore(symBars, ev.date);
          if (spot === null) continue;
          const p25 = p25BySymbol.get(stock.symbol);
          // Effective break-even after all premiums collected.
          const effBasisPerShare =
            (stock.costBasis - stock.cspPremiumReceived - stock.ccNetPremium) /
            stock.shares;
          const profitTrigger = spot >= effBasisPerShare * (1 + PROFIT_CLOSE_THRESHOLD);
          const p25Trigger = p25 !== undefined && spot >= p25;
          if (!p25Trigger && !profitTrigger) continue;
          stocksToClose.push(stock);
          closeReason.set(stock, p25Trigger ? "p25" : "profit");
        }
        for (const stock of stocksToClose) {
          const symBars = bars.get(stock.symbol)!;
          const spot = priceAtOrBefore(symBars, ev.date)!;
          // Sell the stock at current spot.
          const stockProceeds = spot * stock.shares;
          state.cash += stockProceeds;
          // Buy back any open CCs on this symbol.
          const ccsToClose = state.openCalls.filter((c) => c.symbol === stock.symbol);
          let ccBuybackCost = 0;
          for (const cc of ccsToClose) {
            const daysRemaining = daysBetween(ev.date, cc.expiry);
            const vol = realizedVol(symBars, ev.date, CSP_VOL_LOOKBACK_DAYS);
            const valuePerShare = estimateCallValuePerShare(
              cc.strike,
              spot,
              daysRemaining,
              vol,
            );
            const buyback = valuePerShare * cc.shares;
            ccBuybackCost += buyback;
            state.cash -= buyback;
          }
          // Remove closed CCs from openCalls + cancel their expiry events.
          if (ccsToClose.length > 0) {
            const ccSet = new Set(ccsToClose);
            state.openCalls = state.openCalls.filter((c) => !ccSet.has(c));
            for (let i = events.length - 1; i >= 0; i -= 1) {
              const e = events[i]!;
              if (e.kind === "cc-expiry" && ccSet.has(e.cc)) {
                events.splice(i, 1);
              }
            }
          }
          // Remove the held stock entry.
          const stockIdx = state.heldStocks.indexOf(stock);
          if (stockIdx >= 0) state.heldStocks.splice(stockIdx, 1);
          // Track P&L on this close.
          const positionPnl = stockProceeds - stock.costBasis - ccBuybackCost;
          state.positionClosePnlTotal += positionPnl;
          state.positionsClosedEarly += 1;
          positionsClosed += 1;
          const reason = closeReason.get(stock) ?? "p25";
          if (reason === "profit") {
            profitClosed += 1;
            state.positionsClosedByProfit += 1;
          }
          closedThisCycle.add(stock.symbol);
          log.push({
            date: ev.date,
            type: "expiry",
            detail: `POSITION-CLOSE-${reason.toUpperCase()} ${stock.symbol} @ ${spot.toFixed(2)} (cost/sh ${(stock.costBasis / stock.shares).toFixed(2)}, eff/sh ${((stock.costBasis - stock.cspPremiumReceived - stock.ccNetPremium) / stock.shares).toFixed(2)}) — P&L $${positionPnl.toFixed(0)}`,
          });
        }
      }

      // ── (1) Write covered calls — one per unique held symbol.
      //         Strike depends on mode:
      //           WHEEL_MODE: strike = max(cost_basis_per_share, spot×1.02)
      //                       (exit at break-even on stock + collect premium)
      //           else:       strike = max(p25, spot×1.02)
      //                       (exit at engine's FV target)
      const coveredSharesBySymbol = new Map<string, number>();
      for (const cc of state.openCalls) {
        coveredSharesBySymbol.set(
          cc.symbol,
          (coveredSharesBySymbol.get(cc.symbol) ?? 0) + cc.shares,
        );
      }
      let ccsWritten = 0;
      for (const stock of state.heldStocks) {
        const covered = coveredSharesBySymbol.get(stock.symbol) ?? 0;
        const uncovered = stock.shares - covered;
        if (uncovered <= 0) continue;
        const symBars = bars.get(stock.symbol);
        if (!symBars) continue;
        const spot = priceAtOrBefore(symBars, ev.date);
        if (spot === null || spot <= 0) continue;
        const minStrike = spot * (1 + CC_MIN_OTM_PCT / 100);
        let ccStrike: number;
        if (WHEEL_MODE) {
          const costBasisPerShare = stock.costBasis / stock.shares;
          ccStrike = Math.max(costBasisPerShare, minStrike);
        } else {
          const p25 = p25BySymbol.get(stock.symbol);
          if (p25 === undefined) continue;
          ccStrike = Math.max(p25, minStrike);
        }
        const vol = realizedVol(symBars, ev.date, CSP_VOL_LOOKBACK_DAYS);
        // Parity-corrected call pricing — for ITM calls (cost-basis
        // strike < current spot), this reflects the dividend forgone
        // and interest savings; net premium is slightly less than
        // naive intrinsic + time value.
        const totalPremPerShare = estimateCallValuePerShare(
          ccStrike,
          spot,
          CC_EXPIRY_DAYS,
          vol,
        );
        const ccPremium = totalPremPerShare * uncovered;
        state.cash += ccPremium;
        state.totalPremiumCollected += ccPremium;
        state.ccPremiumTotal += ccPremium;
        state.ccContractsWritten += 1;
        // Attach to the held stock for break-even tracking.
        stock.ccNetPremium += ccPremium;
        const ccExpiry = addDaysIso(ev.date, CC_EXPIRY_DAYS);
        const cc: OpenCoveredCall = {
          symbol: stock.symbol,
          strike: ccStrike,
          expiry: ccExpiry,
          premium: ccPremium,
          shares: uncovered,
        };
        state.openCalls.push(cc);
        events.push({ date: ccExpiry, kind: "cc-expiry", cc });
        // Update the local covered-shares map so subsequent iterations
        // (in case heldStocks somehow has duplicates) don't double-cover.
        coveredSharesBySymbol.set(stock.symbol, covered + uncovered);
        ccsWritten += 1;
      }

      // ── (2) Deploy CSPs — diversified, 1 contract per name, top
      //         composite first. Strike depends on mode:
      //           WHEEL_MODE: strike = p25 (deep ITM for Candidates;
      //                       intrinsic + time value premium)
      //           else:       strike = spot × 0.95 (5% OTM)
      //
      //         engagedSymbols blocks tickers that would create
      //         duplication or churn:
      //           - currently held stock (we already own it)
      //           - currently open CSP (would stack within cycle)
      //           - any ticker we closed THIS cycle (CSP buy-back or
      //             position close at p25/profit) — capital must
      //             rotate to a different name.
      for (const s of closedCspSymbols) closedThisCycle.add(s);
      const engagedSymbols = new Set<string>([
        ...state.openCsps.map((o) => o.symbol),
        ...state.heldStocks.map((h) => h.symbol),
        ...closedThisCycle,
      ]);

      let deployed = 0;
      for (const cand of candidates) {
        if (engagedSymbols.has(cand.symbol)) continue;
        const symBars = bars.get(cand.symbol);
        if (!symBars) continue;
        const spot = priceAtOrBefore(symBars, ev.date);
        if (spot === null || spot <= 0) continue;

        let strike: number;
        let premiumPerShare: number;
        const vol = realizedVol(symBars, ev.date, CSP_VOL_LOOKBACK_DAYS);

        if (STRATEGY_MODE === "wheel") {
          const p25 = cand.fairValue?.range?.p25;
          if (p25 === undefined || p25 <= spot) continue;
          strike = spot + CSP_STRIKE_DEPTH * (p25 - spot);
          premiumPerShare = estimatePutValuePerShare(strike, spot, CSP_CYCLE_DAYS, vol);
        } else {
          // yield-aware: pick best-time-value-yield strike via grid search.
          // Capped at p25 (engine's value approval).
          const p25 = cand.fairValue?.range?.p25 ?? spot * 1.30;
          if (p25 <= spot) continue;
          const best = findBestYieldPutStrike(spot, p25, vol, CSP_CYCLE_DAYS);
          if (best === null) continue;
          strike = best.strike;
          premiumPerShare = best.premiumPerShare;
        }

        const capitalNeeded = strike * 100;
        if (freeCash(state) < capitalNeeded) continue;
        const premium = premiumPerShare * 100;

        state.cash += premium;
        state.totalPremiumCollected += premium;
        state.cspPremiumTotal += premium;
        state.reservedCash += capitalNeeded;
        state.cspContractsSold += 1;
        const expiry = addDaysIso(ev.date, CSP_CYCLE_DAYS);
        const csp: OpenCsp = {
          symbol: cand.symbol,
          strike,
          expiry,
          premium,
          capitalReserved: capitalNeeded,
        };
        state.openCsps.push(csp);
        events.push({ date: expiry, kind: "csp-expiry", csp });
        engagedSymbols.add(cand.symbol);
        deployed += 1;
      }
      events.sort((a, b) => a.date.localeCompare(b.date));

      const v = portfolioValue(state, bars, ev.date);
      valuationSeries.push({ date: ev.date, total: v.total, cash: v.cash, stocks: v.stocks });
      log.push({
        date: ev.date,
        type: "flag",
        detail: `contrib=${ev.contribution} cands=${candidates.length} csps=${deployed} ccs=${ccsWritten} cspClose=${earlyClosed} posClose=${positionsClosed}(${profitClosed}prof) openCsps=${state.openCsps.length} openCalls=${state.openCalls.length} held=${state.heldStocks.length} cash=${state.cash.toFixed(0)} totalValue=${v.total.toFixed(0)}`,
      });
    }
  }

  // ── Final valuation ──
  const final = portfolioValue(state, bars, BACKTEST_END);
  const years = daysBetween(BACKTEST_START, BACKTEST_END) / 365;

  // ── Benchmarks with the same DCA schedule ($65k initial + $2k/mo) ──
  // For both ex-Mag-7 equal-weight AND SPY, each contribution buys
  // shares at that date's price. Final value = sum(cumulative shares
  // × end price).

  // Ex-Mag-7 equal-weight: each contribution split across all eligible
  // symbols (those with bar coverage at the contribution date).
  const sharesByName = new Map<string, number>();
  function buyEqualWeight(amount: number, dateIso: string): void {
    const eligible = [...bars.keys()].filter((sym) => {
      if (sym === "SPY") return false;
      if (MAG7.has(sym)) return false;
      const px = priceAtOrBefore(bars.get(sym)!, dateIso);
      return px !== null && px > 0;
    });
    if (eligible.length === 0) return;
    const perName = amount / eligible.length;
    for (const sym of eligible) {
      const px = priceAtOrBefore(bars.get(sym)!, dateIso)!;
      const shares = perName / px;
      sharesByName.set(sym, (sharesByName.get(sym) ?? 0) + shares);
    }
  }
  buyEqualWeight(STARTING_CAPITAL, BACKTEST_START);
  for (const d of contributionDates) buyEqualWeight(MONTHLY_CONTRIBUTION, d);
  let benchEnd = 0;
  for (const [sym, shares] of sharesByName) {
    const px = priceAtOrBefore(bars.get(sym)!, BACKTEST_END);
    if (px !== null) benchEnd += shares * px;
  }
  const benchIrr = computeIrr(
    [...cashFlows, { date: BACKTEST_END, amount: benchEnd }],
    BACKTEST_START,
  ) * 100;
  const benchTotalReturn = ((benchEnd - totalContributed) / totalContributed) * 100;

  // SPY benchmark with same DCA.
  const spyBars = bars.get("SPY") ?? (await loadDailyBars("SPY"));
  let spyShares = 0;
  function buySpy(amount: number, dateIso: string): void {
    const px = priceAtOrBefore(spyBars, dateIso);
    if (px !== null && px > 0) spyShares += amount / px;
  }
  buySpy(STARTING_CAPITAL, BACKTEST_START);
  for (const d of contributionDates) buySpy(MONTHLY_CONTRIBUTION, d);
  const spyEndPx = priceAtOrBefore(spyBars, BACKTEST_END);
  const spyEnd = spyEndPx !== null ? spyShares * spyEndPx : 0;
  const spyIrr = computeIrr(
    [...cashFlows, { date: BACKTEST_END, amount: spyEnd }],
    BACKTEST_START,
  ) * 100;
  const spyTotalReturn = ((spyEnd - totalContributed) / totalContributed) * 100;

  // Strategy IRR.
  const strategyIrr = computeIrr(
    [...cashFlows, { date: BACKTEST_END, amount: final.total }],
    BACKTEST_START,
  ) * 100;
  const strategyTotalReturn = ((final.total - totalContributed) / totalContributed) * 100;

  // ── Persist + print ──
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        config: {
          startingCapital: STARTING_CAPITAL,
          backtestStart: BACKTEST_START,
          backtestEnd: BACKTEST_END,
          riskFreeRate: RISK_FREE_RATE,
          cspDownsidePct: CSP_DOWNSIDE_PCT,
          cspCycleDays: CSP_CYCLE_DAYS,
          wheelMode: WHEEL_MODE,
          cspStrikeDepth: CSP_STRIKE_DEPTH,
          b2cProfitPct: B2C_PROFIT_PCT,
          positionCloseProfit: POSITION_CLOSE_PROFIT,
        },
        portfolio: {
          finalValue: final.total,
          finalCash: final.cash,
          finalStockValue: final.stocks,
          finalOpenCspMtm: final.openCspMtm,
          finalOpenCallMtm: final.openCallMtm,
          totalReturn: strategyTotalReturn,
          irr: strategyIrr,
          totalContributed,
          cspContractsSold: state.cspContractsSold,
          cspAssignments: state.cspAssignments,
          cspExpiredOtm: state.cspExpiredOtm,
          cspAssignmentRate: state.cspContractsSold > 0 ? (state.cspAssignments / state.cspContractsSold) * 100 : 0,
          ccContractsWritten: state.ccContractsWritten,
          ccCalledAway: state.ccCalledAway,
          ccExpiredOtm: state.ccExpiredOtm,
          ccCalledAwayRate: state.ccContractsWritten > 0 ? (state.ccCalledAway / state.ccContractsWritten) * 100 : 0,
          totalPremiumCollected: state.totalPremiumCollected,
          cspPremiumTotal: state.cspPremiumTotal,
          ccPremiumTotal: state.ccPremiumTotal,
          totalInterestEarned: state.totalInterestEarned,
          heldStocksAtEnd: state.heldStocks.length,
        },
        benchmark: {
          equalWeightExMag7: { finalValue: benchEnd, totalReturn: benchTotalReturn, irr: benchIrr },
          spy: { finalValue: spyEnd, totalReturn: spyTotalReturn, irr: spyIrr },
        },
        valuationSeries,
        eventLog: log,
      },
      null,
      0,
    ),
    "utf8",
  );
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`\nWrote results to ${OUTPUT_PATH} (${elapsed}s)\n`);

  console.log(`════════════════════════════════════════════════════`);
  console.log(`PORTFOLIO RESULT`);
  console.log(`════════════════════════════════════════════════════`);
  console.log(`Window:           ${BACKTEST_START} → ${BACKTEST_END} (${years.toFixed(1)} years)`);
  console.log(`Initial capital:  $${STARTING_CAPITAL.toLocaleString()}`);
  console.log(`DCA:              $${MONTHLY_CONTRIBUTION.toLocaleString()}/mo × ${contributionDates.length} mo`);
  console.log(`Total invested:   $${totalContributed.toLocaleString()}`);
  console.log(`Final value:      $${final.total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);
  console.log(`                  cash $${final.cash.toFixed(0)}, stocks $${final.stocks.toFixed(0)}, open-csp $${final.openCspMtm.toFixed(0)}, open-cc $${final.openCallMtm.toFixed(0)}`);
  console.log(`Profit:           $${(final.total - totalContributed).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);
  console.log(`Total return:     ${strategyTotalReturn.toFixed(1)}% (over total contributed; not time-weighted)`);
  console.log(`IRR (annualized): ${strategyIrr.toFixed(2)}%/yr  ← THE FAIR METRIC`);
  console.log(``);
  console.log(`── CSPs ──`);
  console.log(`  Contracts sold:           ${state.cspContractsSold}`);
  console.log(`  Assigned:                 ${state.cspAssignments} (${(state.cspAssignments/Math.max(1, state.cspContractsSold)*100).toFixed(1)}%)`);
  console.log(`  OTM expiries:             ${state.cspExpiredOtm} (${(state.cspExpiredOtm/Math.max(1, state.cspContractsSold)*100).toFixed(1)}%)`);
  console.log(`  Closed early (recovered): ${state.cspsClosedEarly} (${(state.cspsClosedEarly/Math.max(1, state.cspContractsSold)*100).toFixed(1)}%)`);
  console.log(`  Premium total:            $${state.cspPremiumTotal.toFixed(0)}`);
  console.log(`  Early-close cost total:   $${state.earlyCloseCostTotal.toFixed(0)}`);
  console.log(`  Net CSP premium (kept):   $${(state.cspPremiumTotal - state.earlyCloseCostTotal).toFixed(0)}`);
  console.log(`── Covered Calls ──`);
  console.log(`  Contracts written:        ${state.ccContractsWritten}`);
  console.log(`  Called away (ITM):        ${state.ccCalledAway} (${(state.ccCalledAway/Math.max(1, state.ccContractsWritten)*100).toFixed(1)}%)`);
  console.log(`  OTM expiries (kept):      ${state.ccExpiredOtm} (${(state.ccExpiredOtm/Math.max(1, state.ccContractsWritten)*100).toFixed(1)}%)`);
  console.log(`  Premium total:            $${state.ccPremiumTotal.toFixed(0)}`);
  console.log(`── Position closes (sell stock + buy back CC) ──`);
  console.log(`  Total positions closed:   ${state.positionsClosedEarly}`);
  console.log(`     by p25 trigger:        ${state.positionsClosedEarly - state.positionsClosedByProfit}`);
  console.log(`     by 10% profit trigger: ${state.positionsClosedByProfit}`);
  console.log(`  Cumulative close P&L:     $${state.positionClosePnlTotal.toFixed(0)} (close-trade math; excludes premiums already in cash)`);
  console.log(`── Other ──`);
  console.log(`  Total premium (CSP+CC):   $${state.totalPremiumCollected.toFixed(0)}`);
  console.log(`  Interest earned total:    $${state.totalInterestEarned.toFixed(0)}`);
  console.log(`  Held stocks at end:       ${state.heldStocks.length}`);
  console.log(``);
  console.log(`════════════════════════════════════════════════════`);
  console.log(`BENCHMARKS (same DCA: $${STARTING_CAPITAL.toLocaleString()} initial + $${MONTHLY_CONTRIBUTION}/mo)`);
  console.log(`════════════════════════════════════════════════════`);
  console.log(`Equal-weight ex-Mag-7 buy-and-hold:`);
  console.log(`  Final $${benchEnd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}  total ${benchTotalReturn.toFixed(1)}%  IRR ${benchIrr.toFixed(2)}%/yr`);
  console.log(`SPY (with Mag 7) buy-and-hold:`);
  console.log(`  Final $${spyEnd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}  total ${spyTotalReturn.toFixed(1)}%  IRR ${spyIrr.toFixed(2)}%/yr`);
  console.log(``);
  console.log(`════════════════════════════════════════════════════`);
  console.log(`VS ex-Mag-7 benchmark: ${(strategyIrr - benchIrr > 0 ? "+" : "")}${(strategyIrr - benchIrr).toFixed(2)} pp/yr IRR alpha`);
  console.log(`VS SPY:               ${(strategyIrr - spyIrr > 0 ? "+" : "")}${(strategyIrr - spyIrr).toFixed(2)} pp/yr IRR alpha`);
  console.log(`════════════════════════════════════════════════════`);

  // Print yearly portfolio trajectory
  console.log(`\nValuation trajectory (year-end snapshots):`);
  const yearEnds = new Map<string, { date: string; total: number; cash: number; stocks: number }>();
  for (const v of valuationSeries) {
    const yr = v.date.slice(0, 4);
    yearEnds.set(yr, v);
  }
  for (const [yr, v] of yearEnds) {
    console.log(`  ${yr} (${v.date}): total=$${v.total.toFixed(0).padStart(9)}  cash=$${v.cash.toFixed(0).padStart(8)}  stocks=$${v.stocks.toFixed(0).padStart(8)}`);
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
