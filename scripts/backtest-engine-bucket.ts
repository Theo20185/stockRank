#!/usr/bin/env tsx
/**
 * Engine-bucket back-test:
 *
 *   1. At each historical quarter-end, run the CURRENT engine (rank +
 *      bucketRows) on the universe of symbols with both EDGAR
 *      fundamentals AND Yahoo daily prices in cache.
 *   2. For each row, classify as Candidate / Watch / Avoid using
 *      packages/ranking/src/buckets.ts.
 *   3. Walk forward 2 years and measure outcomes:
 *        - Candidates: did `bar.high` reach the captured fvP25? When?
 *        - Avoid:      forward total return at 1y / 2y vs SPY (excess)
 *   4. Cross-tab Candidates by composite-decile within the Candidate
 *      cohort at flag date.
 *   5. Split by regime: pre-COVID (flag ≤ 2019-12-31) vs COVID-era
 *      (flag in 2020-01-01 → 2022-06-30) vs recent (flag ≥ 2022-07-01).
 *
 * Data sources:
 *   - EDGAR facts (tmp/edgar-cache/<SYM>/facts.json): deep history
 *     for the §4 quality floor (needs 5y of annuals).
 *   - Yahoo backtest cache (tmp/backtest-cache/<SYM>/chart.json):
 *     daily quotes back to 2011 — used both for price-at-flag-date
 *     and for the forward-walk recovery check.
 *   - Symbol profiles from public/data/snapshot-latest.json.
 *
 * Reads cache only — no network. Symbols missing either cache are
 * skipped silently.
 *
 * Usage:
 *   npx tsx scripts/backtest-engine-bucket.ts
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
  type BucketKey,
  type RankedRow,
} from "@stockrank/ranking";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";

const CACHE_DIR = resolve(process.cwd(), "tmp/backtest-cache");
const SNAPSHOT_PATH = resolve(process.cwd(), "public/data/snapshot-latest.json");
const OUTPUT_PATH = resolve(process.cwd(), "tmp/backtest-engine-bucket.json");

const HOLDING_WINDOW_YEARS = 2;

/** With Yahoo daily quotes back to 2011 + EDGAR facts back to ~2009,
 * earliest viable flag date is ~2014-01 (need ≥3 published annual
 * fiscal years for §4 floor). With 2y forward window, latest flag
 * is today − 2y = ~2024-04. We target 2017-Q4 → 2024-Q1 = 26 quarters
 * spanning pre-COVID (2017-2019), COVID-era (2020-2022), recent (2022-2024). */
const FLAG_START = "2017-12-31";
const FLAG_END = "2024-03-31";

/** Magnificent 7 — currently the dominant mega-caps in SPY (~30% of
 * the index by weight). Excluded from BOTH the engine universe AND
 * any benchmark calculations so the comparison is "engine pick from
 * non-mega-cap S&P 500 names" vs "median non-mega-cap S&P 500 name."
 *
 * GOOG + GOOGL = 2 share classes of Alphabet (1 company). */
const MAG7 = new Set<string>([
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "NVDA", "TSLA",
]);

function quarterEndsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const cursor = new Date(startDate);
  cursor.setUTCDate(1);
  while (cursor <= endDate) {
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

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

type DailyQuote = {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  adjclose?: number;
};

type ChartCacheFile = {
  meta?: unknown;
  quotes: DailyQuote[];
  events?: unknown;
};

/** Load the Yahoo daily quote cache for a symbol and convert to
 * HistoricalBar[] sorted ascending. Returns empty array on cache miss. */
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

function priceAtOrAfter(bars: HistoricalBar[], dateIso: string): number | null {
  for (const b of bars) {
    if (b.date >= dateIso) return b.close;
  }
  return null;
}

type FlagOutcome = {
  date: string;
  symbol: string;
  bucket: BucketKey;
  composite: number;
  candidateDecile: number | null;
  entryPrice: number;
  fvP25: number | null;
  recovered: boolean | null;
  recoveryDate: string | null;
  daysToRecover: number | null;
  fwd1yPct: number | null;
  fwd2yPct: number | null;
  spy1yPct: number | null;
  spy2yPct: number | null;
  /** Median forward return of all non-Mag-7 universe names at this
   * (flagDate, horizon). Stored once per flag-event for vectorized
   * excess computation downstream. */
  bench1yPct: number | null;
  bench2yPct: number | null;
  /** Total 2y return from a continuous 30d 5%-OTM CSP roll on this
   * name. Computed only for Candidates (the strategy assumes you'd
   * be willing to own the stock at the strike). Null otherwise. */
  csp2yReturnPct: number | null;
  cspCycles: number | null;
  cspAssigned: boolean | null;
};

type Regime = "pre-covid" | "covid" | "recent";
function regimeOf(flagDate: string): Regime {
  if (flagDate <= "2019-12-31") return "pre-covid";
  if (flagDate <= "2022-06-30") return "covid";
  return "recent";
}

function profileFromSnapshot(c: CompanySnapshot): SymbolProfile {
  const shares =
    c.marketCap > 0 && c.quote.price > 0 ? c.marketCap / c.quote.price : 0;
  return {
    symbol: c.symbol,
    name: c.name,
    sector: c.sector,
    industry: c.industry,
    exchange: c.exchange,
    currency: c.currency,
    authoritativeShares: shares,
  };
}

/** Walk daily bars from flagDate (exclusive) to exitDate (inclusive)
 * and return the first date whose intraday high reached targetPrice. */
function recoveryWithinWindow(
  bars: HistoricalBar[],
  flagDate: string,
  exitDate: string,
  targetPrice: number,
): string | null {
  for (const b of bars) {
    if (b.date <= flagDate) continue;
    if (b.date > exitDate) break;
    const high = b.high ?? b.close;
    if (high >= targetPrice) return b.date;
  }
  return null;
}

async function loadAllData(snapshot: Snapshot): Promise<{
  facts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>;
  bars: Map<string, HistoricalBar[]>;
  profiles: Map<string, SymbolProfile>;
}> {
  const facts = new Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>();
  const bars = new Map<string, HistoricalBar[]>();
  const profiles = new Map<string, SymbolProfile>();
  let factsLoaded = 0;
  let barsLoaded = 0;
  let i = 0;
  for (const c of snapshot.companies) {
    i += 1;
    profiles.set(c.symbol, profileFromSnapshot(c));
    try {
      const f = await fetchCompanyFacts(c.symbol, { cacheTtlHours: 24 * 365 });
      facts.set(c.symbol, f);
      factsLoaded += 1;
    } catch {
      // skip
    }
    const b = await loadDailyBars(c.symbol);
    if (b.length > 0) {
      bars.set(c.symbol, b);
      barsLoaded += 1;
    }
    if (i % 100 === 0) {
      console.log(`  loaded ${i}/${snapshot.companies.length} (facts=${factsLoaded} bars=${barsLoaded})`);
    }
  }
  // SPY isn't in the company snapshot — load its bars directly.
  const spyBars = await loadDailyBars("SPY");
  if (spyBars.length > 0) bars.set("SPY", spyBars);
  console.log(
    `Loaded EDGAR facts for ${factsLoaded} / ${snapshot.companies.length} symbols.`,
  );
  console.log(`Loaded daily bars for ${barsLoaded} / ${snapshot.companies.length} symbols.`);
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
    if (MAG7.has(symbol)) continue;
    const f = facts.get(symbol);
    const b = bars.get(symbol);
    if (!f || !b || b.length === 0) continue;
    const snap = synthesizeSnapshotAt(f, b, date, profile);
    if (snap) out.push(snap);
  }
  return out;
}

/* ─── Cash-secured put (CSP) regime simulator ─────────────────────
 *
 * For each Candidate at flag date, simulate a continuous 30-day
 * rolling 5%-OTM short-put strategy over the 2y window:
 *   - Capital deployed = strike_0 × 100 (held in cash)
 *   - Each cycle: sell 30d 5% OTM put, premium estimated from
 *     trailing-30d realized vol via estimateCallPremiumPct
 *     (put-call parity makes the call premium a reasonable proxy
 *     for the put premium at symmetric moneyness)
 *   - Cash collateral earns risk-free rate while not assigned
 *   - If price at cycle end ≤ strike: ASSIGNED. Hold the stock to
 *     exitDate. Stop the CSP roll on this name.
 *   - If price at cycle end > strike: keep premium, roll new 30d
 *     5% OTM put. Continue until exitDate.
 *
 * Total return = (premiums collected + assignment P&L + accrued
 * interest) / initial capital. Reported as % over the 2y window
 * (not annualized) for comparability with the existing 2y excess
 * metrics.
 *
 * Modeling assumptions to bear in mind:
 *   - IV proxy = realized vol. Real IV usually 1.1-1.3× realized
 *     (vol risk premium), so premiums here UNDERESTIMATE reality.
 *   - No bid-ask spread or commissions modeled — real returns drop
 *     ~0.5-1 pp/cycle from these.
 *   - No early assignment (treated as European). Rare for OTM puts.
 *   - Risk-free rate is a flat constant; real rates varied 0-5.5%
 *     across the 2017-2024 window. Refining this is a v2.
 */

const CSP_DOWNSIDE_PCT = 5;            // 5% OTM
/** Cycle length in days. Override via env var CSP_CYCLE_DAYS (e.g.
 * `CSP_CYCLE_DAYS=365` for LEAPS-style annual rolls, default 30 for
 * monthly). The realized-vol lookback also scales with cycle length
 * so the IV proxy matches the time horizon being priced. */
const CSP_CYCLE_DAYS = Number(process.env.CSP_CYCLE_DAYS ?? 30);
const CSP_VOL_LOOKBACK_DAYS = Math.max(30, CSP_CYCLE_DAYS);
const CSP_RISK_FREE_RATE = 0.04;       // 4% — rough average over period
const CSP_MIN_VOL = 0.08;              // floor at 8% IV (very low-vol names)
const CSP_MAX_VOL = 0.80;              // cap at 80% IV (avoid blow-ups)

function realizedVol(
  bars: HistoricalBar[],
  asOfDate: string,
  lookbackDays: number,
): number {
  // Walk backwards from asOfDate, collect closes for the prior `lookbackDays`.
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
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  const dailyVol = Math.sqrt(variance);
  const annualized = dailyVol * Math.sqrt(252);
  return Math.max(CSP_MIN_VOL, Math.min(CSP_MAX_VOL, annualized));
}

/** Find the bar at-or-after dateIso. */
function barAtOrAfter(bars: HistoricalBar[], dateIso: string): HistoricalBar | null {
  for (const b of bars) {
    if (b.date >= dateIso) return b;
  }
  return null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type CspResult = {
  /** Total return % over the holding window (premiums + assignment + interest). */
  totalReturnPct: number;
  /** Number of premium-collecting cycles completed before assignment / exit. */
  cyclesCompleted: number;
  /** True if the strategy was assigned the stock at some point. */
  assigned: boolean;
  /** Cycle number on which assignment happened (1-indexed). 0 if never. */
  assignedAtCycle: number;
};

function simulateCspRegime(
  bars: HistoricalBar[],
  flagDate: string,
  exitDate: string,
  initialSpot: number,
): CspResult | null {
  const initialStrike = initialSpot * (1 - CSP_DOWNSIDE_PCT / 100);
  const initialCapital = initialStrike * 100; // per 1 contract
  if (initialCapital <= 0) return null;

  let cycleStart = flagDate;
  let cumulativePremium = 0;       // dollars
  let cumulativeInterest = 0;      // dollars on cash collateral
  let assigned = false;
  let assignmentPnl = 0;           // dollars
  let cyclesCompleted = 0;
  let assignedAtCycle = 0;

  while (cycleStart < exitDate) {
    const cycleEnd = addDaysIso(cycleStart, CSP_CYCLE_DAYS);
    if (cycleEnd > exitDate) break; // not enough room for another full cycle

    const startBar = barAtOrAfter(bars, cycleStart);
    const endBar = barAtOrAfter(bars, cycleEnd);
    if (!startBar || !endBar) break;

    const spot = startBar.close;
    const strike = spot * (1 - CSP_DOWNSIDE_PCT / 100);
    const vol = realizedVol(bars, cycleStart, CSP_VOL_LOOKBACK_DAYS);
    // Use call-premium estimator with downside symmetry as a put proxy.
    const premiumPct = estimateCallPremiumPct({
      upsideToStrikePct: CSP_DOWNSIDE_PCT,
      yearsToExpiry: CSP_CYCLE_DAYS / 365,
      annualizedIv: vol,
    });
    const premium = (premiumPct / 100) * spot * 100; // dollars per contract

    // Interest on collateral over the 30-day cycle.
    cumulativeInterest += initialCapital * CSP_RISK_FREE_RATE * (CSP_CYCLE_DAYS / 365);

    if (endBar.close <= strike) {
      // Assigned. Effective cost = strike (premium offsets it).
      // Hold stock to exitDate.
      const exitBar = barAtOrAfter(bars, exitDate);
      if (exitBar) {
        // P&L on the assigned share leg = (exit_price - strike) × 100
        // Premium collected on this final cycle is kept regardless.
        cumulativePremium += premium;
        assignmentPnl = (exitBar.close - strike) * 100;
      } else {
        cumulativePremium += premium;
      }
      assigned = true;
      assignedAtCycle = cyclesCompleted + 1;
      cyclesCompleted += 1;
      break;
    }

    // OTM expiry — keep premium, roll.
    cumulativePremium += premium;
    cyclesCompleted += 1;
    cycleStart = cycleEnd;
  }

  const totalDollarReturn = cumulativePremium + assignmentPnl + cumulativeInterest;
  const totalReturnPct = (totalDollarReturn / initialCapital) * 100;
  return {
    totalReturnPct,
    cyclesCompleted,
    assigned,
    assignedAtCycle,
  };
}

/** Compute the equal-weighted median price-only return of all non-Mag-7
 * universe names from flagDate to exitDate. Used as the "median S&P 500
 * ex-Mag-7" benchmark — a fairer yardstick than SPY for an engine that
 * picks from the long tail of S&P 500 names. */
function exMag7BenchmarkReturn(
  bars: Map<string, HistoricalBar[]>,
  universeSymbols: Iterable<string>,
  flagDate: string,
  exitDate: string,
): number | null {
  const returns: number[] = [];
  for (const sym of universeSymbols) {
    if (MAG7.has(sym)) continue;
    const b = bars.get(sym);
    if (!b) continue;
    const entry = priceAtOrBefore(b, flagDate);
    const exit = priceAtOrAfter(b, exitDate);
    if (entry === null || exit === null || entry <= 0) continue;
    returns.push(((exit - entry) / entry) * 100);
  }
  if (returns.length === 0) return null;
  returns.sort((a, b) => a - b);
  return returns[Math.floor(returns.length / 2)]!;
}

async function main(): Promise<void> {
  const start = Date.now();
  console.log(`Backtest window: ${FLAG_START} → ${FLAG_END}, holding ${HOLDING_WINDOW_YEARS}y`);

  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as Snapshot;
  console.log(`Universe: ${snapshot.companies.length} symbols from snapshot ${snapshot.snapshotDate}`);

  const { facts, bars, profiles } = await loadAllData(snapshot);
  const spyBars = bars.get("SPY");
  if (!spyBars) {
    console.error("FATAL: SPY chart cache missing at tmp/backtest-cache/SPY/chart.json");
    process.exit(1);
  }

  const flagDates = quarterEndsBetween(FLAG_START, FLAG_END);
  console.log(`Evaluating at ${flagDates.length} quarter-end flag dates.`);

  const outcomes: FlagOutcome[] = [];

  for (const flagDate of flagDates) {
    const exitDate1y = addYears(flagDate, 1);
    const exitDate2y = addYears(flagDate, HOLDING_WINDOW_YEARS);
    const universe = snapshotsAt(flagDate, facts, bars, profiles);
    if (universe.length < 50) {
      console.log(`  ${flagDate}: SKIP (universe ${universe.length} too small)`);
      continue;
    }

    // Compute the ex-Mag-7 median benchmark once per flag date.
    const universeSymbols = universe.map((u) => u.symbol);
    const bench1y = exMag7BenchmarkReturn(bars, universeSymbols, flagDate, exitDate1y);
    const bench2y = exMag7BenchmarkReturn(bars, universeSymbols, flagDate, exitDate2y);

    const ranked = rank({ companies: universe, snapshotDate: flagDate });
    for (const row of ranked.rows) {
      const c = universe.find((u) => u.symbol === row.symbol);
      if (c) row.fairValue = fairValueFor(c, universe);
    }
    for (const row of ranked.ineligibleRows) {
      const c = universe.find((u) => u.symbol === row.symbol);
      if (c) row.fairValue = fairValueFor(c, universe);
    }

    const allRows: RankedRow[] = [...ranked.rows, ...ranked.ineligibleRows];
    const buckets = bucketRows(allRows);
    const bucketBySymbol = new Map<string, BucketKey>();
    for (const k of Object.keys(buckets) as BucketKey[]) {
      for (const r of buckets[k]) bucketBySymbol.set(r.symbol, k);
    }

    // Decile within Candidates (decile 1 = top by composite).
    const candidates = buckets.ranked.slice().sort((a, b) => b.composite - a.composite);
    const decileBySymbol = new Map<string, number>();
    if (candidates.length >= 10) {
      const sliceSize = Math.ceil(candidates.length / 10);
      for (let i = 0; i < candidates.length; i += 1) {
        const d = Math.min(10, Math.floor(i / sliceSize) + 1);
        decileBySymbol.set(candidates[i]!.symbol, d);
      }
    }

    let nCand = 0;
    let nWatch = 0;
    let nAvoid = 0;
    for (const row of allRows) {
      const bucket = bucketBySymbol.get(row.symbol);
      if (!bucket) continue;
      const symBars = bars.get(row.symbol);
      if (!symBars) continue;

      const entryPrice = priceAtOrBefore(symBars, flagDate);
      if (entryPrice === null || entryPrice <= 0) continue;

      const fvP25 = row.fairValue?.range?.p25 ?? null;
      let recovered: boolean | null = null;
      let recoveryDate: string | null = null;
      let daysToRecover: number | null = null;
      if (fvP25 !== null && fvP25 > entryPrice) {
        recoveryDate = recoveryWithinWindow(symBars, flagDate, exitDate2y, fvP25);
        recovered = recoveryDate !== null;
        if (recoveryDate) {
          const ms =
            new Date(`${recoveryDate}T00:00:00.000Z`).getTime() -
            new Date(`${flagDate}T00:00:00.000Z`).getTime();
          daysToRecover = Math.round(ms / 86400000);
        }
      } else if (fvP25 !== null && fvP25 <= entryPrice) {
        recovered = null;
      }

      const fwd1yPx = priceAtOrAfter(symBars, exitDate1y);
      const fwd2yPx = priceAtOrAfter(symBars, exitDate2y);
      const fwd1yPct = fwd1yPx !== null ? ((fwd1yPx - entryPrice) / entryPrice) * 100 : null;
      const fwd2yPct = fwd2yPx !== null ? ((fwd2yPx - entryPrice) / entryPrice) * 100 : null;

      const spyEntry = priceAtOrBefore(spyBars, flagDate);
      const spy1yPx = priceAtOrAfter(spyBars, exitDate1y);
      const spy2yPx = priceAtOrAfter(spyBars, exitDate2y);
      const spy1yPct =
        spyEntry !== null && spyEntry > 0 && spy1yPx !== null
          ? ((spy1yPx - spyEntry) / spyEntry) * 100
          : null;
      const spy2yPct =
        spyEntry !== null && spyEntry > 0 && spy2yPx !== null
          ? ((spy2yPx - spyEntry) / spyEntry) * 100
          : null;

      // Simulate CSP regime — only for Candidates. The strategy
      // assumes the user is willing to own the stock at the strike,
      // which is the engine's value thesis for Candidates.
      let cspResult: CspResult | null = null;
      if (bucket === "ranked") {
        cspResult = simulateCspRegime(symBars, flagDate, exitDate2y, entryPrice);
      }

      outcomes.push({
        date: flagDate,
        symbol: row.symbol,
        bucket,
        composite: row.composite,
        candidateDecile: decileBySymbol.get(row.symbol) ?? null,
        entryPrice,
        fvP25,
        recovered,
        recoveryDate,
        daysToRecover,
        fwd1yPct,
        fwd2yPct,
        spy1yPct,
        spy2yPct,
        bench1yPct: bench1y,
        bench2yPct: bench2y,
        csp2yReturnPct: cspResult?.totalReturnPct ?? null,
        cspCycles: cspResult?.cyclesCompleted ?? null,
        cspAssigned: cspResult?.assigned ?? null,
      });

      if (bucket === "ranked") nCand += 1;
      else if (bucket === "watch") nWatch += 1;
      else nAvoid += 1;
    }
    console.log(
      `  ${flagDate}: cand=${nCand} watch=${nWatch} avoid=${nAvoid} (universe ${universe.length})`,
    );
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        flagWindow: { start: FLAG_START, end: FLAG_END },
        holdingWindowYears: HOLDING_WINDOW_YEARS,
        outcomes,
      },
      null,
      0,
    ),
    "utf8",
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nWrote ${outcomes.length} outcomes to ${OUTPUT_PATH} (${elapsed}s)`);

  // ───────────────────────── Aggregate report ─────────────────────────

  console.log(`\n=== Bucket totals (n=${outcomes.length}) ===`);
  const byBucket = new Map<BucketKey, FlagOutcome[]>();
  for (const o of outcomes) {
    const arr = byBucket.get(o.bucket) ?? [];
    arr.push(o);
    byBucket.set(o.bucket, arr);
  }
  for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
    const arr = byBucket.get(k) ?? [];
    console.log(`  ${k.padEnd(8)} n=${arr.length}`);
  }

  console.log(`\n=== Recovery to p25 by bucket (cohort with FV upside at flag) ===`);
  for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
    const arr = (byBucket.get(k) ?? []).filter((o) => o.recovered !== null);
    const recCount = arr.filter((o) => o.recovered === true).length;
    const recRate = arr.length > 0 ? (recCount / arr.length) * 100 : 0;
    console.log(`  ${k.padEnd(8)} n_eligible=${arr.length} recovered=${recCount} (${recRate.toFixed(1)}%)`);
  }

  console.log(`\n=== Time to p25 (Candidates that recovered) ===`);
  const candRecDays = (byBucket.get("ranked") ?? [])
    .filter((o) => o.recovered === true && o.daysToRecover !== null)
    .map((o) => o.daysToRecover!)
    .sort((a, b) => a - b);
  if (candRecDays.length > 0) {
    const fmt = (d: number) => `${d}d (~${(d / 30.44).toFixed(1)}mo)`;
    console.log(`  n=${candRecDays.length}`);
    console.log(`  p25    = ${fmt(quantile(candRecDays, 0.25)!)}`);
    console.log(`  median = ${fmt(quantile(candRecDays, 0.5)!)}`);
    console.log(`  p75    = ${fmt(quantile(candRecDays, 0.75)!)}`);
    const totalCand = (byBucket.get("ranked") ?? []).filter((o) => o.recovered !== null).length;
    console.log(`\n  Cumulative recovery (over ${totalCand} Candidate flags w/ upside):`);
    for (const m of [3, 6, 12, 18, 24]) {
      const n = candRecDays.filter((d) => d <= m * 30.44).length;
      console.log(`    ≤ ${m}mo: ${n} (${((n / totalCand) * 100).toFixed(1)}%)`);
    }
  }

  console.log(`\n=== Forward returns by bucket (vs entry, %) ===`);
  for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
    const arr = byBucket.get(k) ?? [];
    const r1 = arr.map((o) => o.fwd1yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const r2 = arr.map((o) => o.fwd2yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);
    console.log(
      `  ${k.padEnd(8)} 1y: median=${fmt(quantile(r1, 0.5))}  2y: median=${fmt(quantile(r2, 0.5))}` +
        `  (n=${arr.length})`,
    );
  }

  console.log(`\n=== Excess return vs SPY by bucket (median, pp) ===`);
  for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
    const arr = byBucket.get(k) ?? [];
    const ex1 = arr
      .filter((o) => o.fwd1yPct !== null && o.spy1yPct !== null)
      .map((o) => o.fwd1yPct! - o.spy1yPct!);
    const ex2 = arr
      .filter((o) => o.fwd2yPct !== null && o.spy2yPct !== null)
      .map((o) => o.fwd2yPct! - o.spy2yPct!);
    ex1.sort((a, b) => a - b);
    ex2.sort((a, b) => a - b);
    const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} pp`);
    console.log(
      `  ${k.padEnd(8)} 1y: median=${fmt(quantile(ex1, 0.5))}  2y: median=${fmt(quantile(ex2, 0.5))}`,
    );
  }

  console.log(`\n=== Excess return vs ex-Mag-7 median (THE FAIR BENCHMARK, pp) ===`);
  console.log(`  Compares each bucket to the median forward return of all non-Mag-7`);
  console.log(`  S&P 500 names in the same snapshot — controls for mega-cap distortion.`);
  for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
    const arr = byBucket.get(k) ?? [];
    const ex1 = arr
      .filter((o) => o.fwd1yPct !== null && o.bench1yPct !== null)
      .map((o) => o.fwd1yPct! - o.bench1yPct!);
    const ex2 = arr
      .filter((o) => o.fwd2yPct !== null && o.bench2yPct !== null)
      .map((o) => o.fwd2yPct! - o.bench2yPct!);
    ex1.sort((a, b) => a - b);
    ex2.sort((a, b) => a - b);
    const fmt = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)} pp`);
    console.log(
      `  ${k.padEnd(8)} 1y: median=${fmt(quantile(ex1, 0.5))}  2y: median=${fmt(quantile(ex2, 0.5))}`,
    );
  }

  console.log(`\n=== Candidates by composite-decile (1=top, 10=bottom; excess vs ex-Mag-7 median) ===`);
  console.log(`  decile     n    recovery%   t-median(d)   1y-fwd%    2y-fwd%    2y-excess(pp)`);
  const allCandidates = byBucket.get("ranked") ?? [];
  for (let d = 1; d <= 10; d += 1) {
    const arr = allCandidates.filter((o) => o.candidateDecile === d);
    if (arr.length === 0) continue;
    const eligible = arr.filter((o) => o.recovered !== null);
    const recovered = eligible.filter((o) => o.recovered === true);
    const recPct = eligible.length > 0 ? (recovered.length / eligible.length) * 100 : 0;
    const days = recovered.map((o) => o.daysToRecover!).sort((a, b) => a - b);
    const fwd1y = arr.map((o) => o.fwd1yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const fwd2y = arr.map((o) => o.fwd2yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const ex2 = arr
      .filter((o) => o.fwd2yPct !== null && o.bench2yPct !== null)
      .map((o) => o.fwd2yPct! - o.bench2yPct!)
      .sort((a, b) => a - b);
    console.log(
      `   ${String(d).padStart(2)}   ${String(arr.length).padStart(5)}   ${recPct.toFixed(1).padStart(5)}%    ${(quantile(days, 0.5) ?? 0).toFixed(0).padStart(6)}      ${(quantile(fwd1y, 0.5) ?? 0).toFixed(1).padStart(6)}     ${(quantile(fwd2y, 0.5) ?? 0).toFixed(1).padStart(6)}     ${(quantile(ex2, 0.5) ?? 0).toFixed(1).padStart(6)}`,
    );
  }

  console.log(`\n=== Regime split ===`);
  for (const reg of ["pre-covid", "covid", "recent"] as Regime[]) {
    console.log(`\n  --- ${reg} ---`);
    for (const k of ["ranked", "watch", "avoid"] as BucketKey[]) {
      const arr = (byBucket.get(k) ?? []).filter((o) => regimeOf(o.date) === reg);
      const eligible = arr.filter((o) => o.recovered !== null);
      const rec = eligible.filter((o) => o.recovered === true).length;
      const recPct = eligible.length > 0 ? (rec / eligible.length) * 100 : 0;
      const days = arr
        .filter((o) => o.recovered === true && o.daysToRecover !== null)
        .map((o) => o.daysToRecover!)
        .sort((a, b) => a - b);
      const ex2 = arr
        .filter((o) => o.fwd2yPct !== null && o.bench2yPct !== null)
        .map((o) => o.fwd2yPct! - o.bench2yPct!)
        .sort((a, b) => a - b);
      const tMed = quantile(days, 0.5);
      const ex2Med = quantile(ex2, 0.5);
      console.log(
        `    ${k.padEnd(8)} n=${String(arr.length).padStart(5)}  rec=${recPct.toFixed(1).padStart(5)}%  ` +
          `t-med=${tMed === null ? "  —" : `${tMed.toFixed(0).padStart(4)}d`}  ` +
          `2y-excess-vs-bench=${ex2Med === null ? "—" : `${ex2Med.toFixed(1)} pp`}`,
      );
    }
  }

  console.log(`\n=== CSP regime on Candidates (continuous ${CSP_CYCLE_DAYS}d 5%-OTM rolling) ===`);
  console.log(`  Compares 2y total return from CSP regime vs holding the stock,`);
  console.log(`  vs the ex-Mag-7 median benchmark. CSP capital base = strike × 100.`);
  const cspRows = (byBucket.get("ranked") ?? []).filter(
    (o) => o.csp2yReturnPct !== null,
  );
  if (cspRows.length > 0) {
    const cspReturns = cspRows.map((o) => o.csp2yReturnPct!).sort((a, b) => a - b);
    const stockReturns = cspRows
      .map((o) => o.fwd2yPct)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const benchReturns = cspRows
      .map((o) => o.bench2yPct)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const cspExcessVsBench = cspRows
      .filter((o) => o.bench2yPct !== null)
      .map((o) => o.csp2yReturnPct! - o.bench2yPct!)
      .sort((a, b) => a - b);
    const cspExcessVsStock = cspRows
      .filter((o) => o.fwd2yPct !== null)
      .map((o) => o.csp2yReturnPct! - o.fwd2yPct!)
      .sort((a, b) => a - b);
    const assignmentRate =
      (cspRows.filter((o) => o.cspAssigned === true).length / cspRows.length) * 100;
    const avgCycles =
      cspRows.reduce((s, o) => s + (o.cspCycles ?? 0), 0) / cspRows.length;
    console.log(`  n=${cspRows.length} Candidates simulated`);
    console.log(`  Assignment rate: ${assignmentRate.toFixed(1)}% (avg ${avgCycles.toFixed(1)} cycles before exit)`);
    console.log(`\n  2y total return (median):`);
    console.log(`    CSP regime    p25=${quantile(cspReturns, 0.25)!.toFixed(1)}%  median=${quantile(cspReturns, 0.5)!.toFixed(1)}%  p75=${quantile(cspReturns, 0.75)!.toFixed(1)}%`);
    console.log(`    Hold stock    p25=${quantile(stockReturns, 0.25)!.toFixed(1)}%  median=${quantile(stockReturns, 0.5)!.toFixed(1)}%  p75=${quantile(stockReturns, 0.75)!.toFixed(1)}%`);
    console.log(`    ex-Mag-7 bench p25=${quantile(benchReturns, 0.25)!.toFixed(1)}%  median=${quantile(benchReturns, 0.5)!.toFixed(1)}%  p75=${quantile(benchReturns, 0.75)!.toFixed(1)}%`);
    console.log(`\n  CSP excess (median):`);
    console.log(`    vs hold-stock:    ${quantile(cspExcessVsStock, 0.5)!.toFixed(1)} pp`);
    console.log(`    vs ex-Mag-7:      ${quantile(cspExcessVsBench, 0.5)!.toFixed(1)} pp`);

    console.log(`\n  CSP regime by composite-decile (within Candidates):`);
    console.log(`  decile     n    csp%-med   stock%-med   csp-excess-vs-bench(pp)`);
    for (let d = 1; d <= 10; d += 1) {
      const arr = cspRows.filter((o) => o.candidateDecile === d);
      if (arr.length === 0) continue;
      const csp = arr.map((o) => o.csp2yReturnPct!).sort((a, b) => a - b);
      const stk = arr.map((o) => o.fwd2yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
      const ex = arr
        .filter((o) => o.bench2yPct !== null)
        .map((o) => o.csp2yReturnPct! - o.bench2yPct!)
        .sort((a, b) => a - b);
      console.log(
        `   ${String(d).padStart(2)}   ${String(arr.length).padStart(5)}   ${(quantile(csp, 0.5) ?? 0).toFixed(1).padStart(6)}      ${(quantile(stk, 0.5) ?? 0).toFixed(1).padStart(6)}     ${(quantile(ex, 0.5) ?? 0).toFixed(1).padStart(6)}`,
      );
    }

    console.log(`\n  CSP regime by regime split:`);
    for (const reg of ["pre-covid", "covid", "recent"] as Regime[]) {
      const arr = cspRows.filter((o) => regimeOf(o.date) === reg);
      if (arr.length === 0) continue;
      const csp = arr.map((o) => o.csp2yReturnPct!).sort((a, b) => a - b);
      const stk = arr.map((o) => o.fwd2yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
      const ex = arr
        .filter((o) => o.bench2yPct !== null)
        .map((o) => o.csp2yReturnPct! - o.bench2yPct!)
        .sort((a, b) => a - b);
      const aRate = (arr.filter((o) => o.cspAssigned === true).length / arr.length) * 100;
      console.log(
        `    ${reg.padEnd(10)} n=${String(arr.length).padStart(4)} csp-med=${(quantile(csp, 0.5) ?? 0).toFixed(1).padStart(6)}%  stock-med=${(quantile(stk, 0.5) ?? 0).toFixed(1).padStart(6)}%  vs-bench=${(quantile(ex, 0.5) ?? 0).toFixed(1).padStart(5)} pp  assignment=${aRate.toFixed(0)}%`,
      );
    }
  }

  console.log(`\n=== Avoid: forward returns by sub-cause (with-FV vs no-FV) ===`);
  for (const sub of ["with-fv", "no-fv"] as const) {
    const arr = (byBucket.get("avoid") ?? []).filter((o) =>
      sub === "with-fv" ? o.fvP25 !== null : o.fvP25 === null,
    );
    if (arr.length === 0) continue;
    const r2 = arr.map((o) => o.fwd2yPct).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const exSpy = arr
      .filter((o) => o.fwd2yPct !== null && o.spy2yPct !== null)
      .map((o) => o.fwd2yPct! - o.spy2yPct!)
      .sort((a, b) => a - b);
    const exBench = arr
      .filter((o) => o.fwd2yPct !== null && o.bench2yPct !== null)
      .map((o) => o.fwd2yPct! - o.bench2yPct!)
      .sort((a, b) => a - b);
    console.log(
      `  ${sub.padEnd(8)} n=${arr.length} 2y-median=${(quantile(r2, 0.5) ?? 0).toFixed(1)}%` +
        `  vs SPY: ${(quantile(exSpy, 0.5) ?? 0).toFixed(1)} pp` +
        `  vs ex-Mag-7: ${(quantile(exBench, 0.5) ?? 0).toFixed(1)} pp`,
    );
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.stack : err);
  process.exit(1);
});
