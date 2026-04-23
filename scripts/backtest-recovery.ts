#!/usr/bin/env tsx
/**
 * Back-test the "undervalued recovery" question:
 *
 *   1. How often do tickers flagged as undervalued (price < fvP25 at
 *      flag date) recover to that conservative-FV target within
 *      HOLDING_WINDOW_YEARS?
 *   2. For recoveries: p25 / median / p75 of capital gains (peak high
 *      during the window vs entry price).
 *   3. For non-recoveries: how many had a declining FV trajectory
 *      over the window?
 *   4. For non-recoveries: lost money vs stayed stable vs partial
 *      gain (didn't reach target)?
 *
 * Methodology:
 *   - Walk historical quarter ends from todayMinus(REC_YEARS+HOLD)
 *     to todayMinus(HOLD) so every flag has a full forward window.
 *   - At each flag date, synthesize the universe via
 *     edgar.synthesizeSnapshotAt() and run fairValueFor(subject,
 *     universe) for every symbol → identify the undervalued cohort.
 *   - For each cohort member, walk forward chart bars to
 *     flagDate + HOLD; classify recovery / non-recovery.
 *   - For non-recoveries, also synthesize the universe at
 *     flagDate + HOLD and recompute fvP25 to gauge fv direction.
 *
 * Usage:
 *   npx tsx scripts/backtest-recovery.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import {
  classifyFundamentalsDirection,
  classifyNonRecovery,
  didRecover,
  fairValueFor,
  fvDirection,
  type FundamentalsDirection,
  type NonRecoveryClass,
  type PriceBar,
} from "@stockrank/ranking";
import {
  fetchCompanyFacts,
  quarterEndsBetween,
  readMonthlyBars,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "@stockrank/data";

const SNAPSHOT_DIR = resolve(process.cwd(), "public/data");
const OUTPUT_PATH = resolve(process.cwd(), "tmp/backtest-recovery.json");

/** Forward holding window per flag. 2 years gives mean-reversion
 * thesis a fair shake without going beyond chart-cache depth. */
const HOLDING_WINDOW_YEARS = 2;

/** How far back to look for flag dates. With chart cache spanning
 * ~6y and a 2y window, the earliest flag date is today − 4y. */
const FLAG_LOOKBACK_YEARS = 4;

type Flag = {
  symbol: string;
  flagDate: string;
  entryPrice: number;
  targetFvP25: number;
  /** Conservative implied upside at flag date. */
  upsidePct: number;
};

type Result = {
  flag: Flag;
  recovered: boolean;
  recoveryDate: string | null;
  /** Capital-gain percentile inputs: peak high vs entry. */
  peakGainPct: number;
  finalGainPct: number;
  fvAtExit: number | null;
  fvDir: "declining" | "flat" | "improving";
  nonRecoveryClass: NonRecoveryClass | null;
  /** Fundamentals direction at flag date — used to partition the
   * recovery cohort by what the new bucket-rule would have done. */
  fundamentalsAtFlag: FundamentalsDirection;
};

function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

async function loadLatestSnapshot(): Promise<Snapshot> {
  const text = await readFile(
    resolve(SNAPSHOT_DIR, "snapshot-latest.json"),
    "utf8",
  );
  return JSON.parse(text) as Snapshot;
}

function profileFromCompany(c: CompanySnapshot): SymbolProfile {
  return {
    symbol: c.symbol,
    name: c.name,
    sector: c.sector,
    industry: c.industry,
    exchange: c.exchange,
    currency: c.currency,
    authoritativeShares:
      c.marketCap > 0 && c.quote.price > 0 ? c.marketCap / c.quote.price : 0,
  };
}

async function loadCachesFor(profiles: Map<string, SymbolProfile>): Promise<{
  facts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>;
  bars: Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>;
}> {
  const facts = new Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>();
  const bars = new Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>();
  let factsLoaded = 0;
  let barsLoaded = 0;
  for (const symbol of profiles.keys()) {
    try {
      const f = await fetchCompanyFacts(symbol, { cacheTtlHours: 24 * 365 });
      facts.set(symbol, f);
      factsLoaded += 1;
    } catch {
      /* skip */
    }
    const b = await readMonthlyBars(symbol);
    if (b) {
      bars.set(symbol, b);
      barsLoaded += 1;
    }
  }
  console.log(`Loaded ${factsLoaded} EDGAR facts, ${barsLoaded} chart bars.`);
  return { facts, bars };
}

function synthesizeUniverse(
  date: string,
  profiles: Map<string, SymbolProfile>,
  facts: Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>,
  bars: Map<string, NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>>,
): CompanySnapshot[] {
  const out: CompanySnapshot[] = [];
  for (const [symbol, profile] of profiles) {
    const f = facts.get(symbol);
    const b = bars.get(symbol);
    if (!f || !b) continue;
    const snap = synthesizeSnapshotAt(f, b, date, profile);
    if (snap) out.push(snap);
  }
  return out;
}

/** Bars in the holding window strictly AFTER flagDate, up to flagDate + HOLD. */
function forwardBars(
  bars: NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>,
  flagDate: string,
  exitDate: string,
): PriceBar[] {
  const out: PriceBar[] = [];
  for (const b of bars) {
    if (b.date <= flagDate) continue;
    if (b.date > exitDate) break;
    out.push({
      date: b.date,
      high: b.high ?? b.close,
      low: b.low ?? b.close,
      close: b.close,
    });
  }
  return out;
}

function finalCloseAtOrBefore(
  bars: NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>,
  exitDate: string,
): number | null {
  let last: number | null = null;
  for (const b of bars) {
    if (b.date > exitDate) break;
    last = b.close;
  }
  return last;
}

async function main(): Promise<void> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const flagWindowEnd = addYears(todayIso, -HOLDING_WINDOW_YEARS);
  const flagWindowStart = addYears(todayIso, -(FLAG_LOOKBACK_YEARS + HOLDING_WINDOW_YEARS));

  console.log(
    `Back-test: flag dates ${flagWindowStart} → ${flagWindowEnd}, ` +
      `holding window ${HOLDING_WINDOW_YEARS}y.`,
  );

  const latest = await loadLatestSnapshot();
  const profiles = new Map<string, SymbolProfile>();
  for (const c of latest.companies) profiles.set(c.symbol, profileFromCompany(c));

  const { facts, bars } = await loadCachesFor(profiles);

  const flagDates = quarterEndsBetween(flagWindowStart, flagWindowEnd);
  console.log(`Evaluating at ${flagDates.length} quarter-end flag dates…`);

  const results: Result[] = [];

  for (const flagDate of flagDates) {
    const exitDate = addYears(flagDate, HOLDING_WINDOW_YEARS);
    const universe = synthesizeUniverse(flagDate, profiles, facts, bars);
    if (universe.length === 0) continue;
    const exitUniverse = synthesizeUniverse(exitDate, profiles, facts, bars);
    const exitFvByPeer: Map<string, number | null> = new Map();
    for (const subject of exitUniverse) {
      try {
        const fv = fairValueFor(subject, exitUniverse);
        exitFvByPeer.set(subject.symbol, fv.range?.p25 ?? null);
      } catch {
        exitFvByPeer.set(subject.symbol, null);
      }
    }

    let flaggedCount = 0;
    for (const subject of universe) {
      let fv;
      try {
        fv = fairValueFor(subject, universe);
      } catch {
        continue;
      }
      const fvP25 = fv.range?.p25 ?? null;
      if (fvP25 === null || fvP25 <= 0) continue;
      const entryPrice = subject.quote.price;
      if (entryPrice <= 0 || entryPrice >= fvP25) continue; // not undervalued

      flaggedCount += 1;
      const flag: Flag = {
        symbol: subject.symbol,
        flagDate,
        entryPrice,
        targetFvP25: fvP25,
        upsidePct: ((fvP25 - entryPrice) / entryPrice) * 100,
      };

      const symBars = bars.get(subject.symbol);
      if (!symBars) continue;
      const fwd = forwardBars(symBars, flagDate, exitDate);
      if (fwd.length === 0) continue;

      const rec = didRecover({
        entryPrice,
        targetPrice: fvP25,
        forwardBars: fwd,
      });
      const finalPrice = finalCloseAtOrBefore(symBars, exitDate) ?? entryPrice;
      const peakGainPct = ((rec.peakHigh - entryPrice) / entryPrice) * 100;
      const finalGainPct = ((finalPrice - entryPrice) / entryPrice) * 100;
      const fvAtExit = exitFvByPeer.get(subject.symbol) ?? null;
      const fvDir = fvDirection({ fvAtEntry: fvP25, fvAtExit });
      const nonRecoveryClass = rec.recovered
        ? null
        : classifyNonRecovery({ entryPrice, finalPrice });

      // Compute fundamentalsDirection at flag-date from the
      // synthesized snapshot — matches what the new bucket rule
      // would have seen at the time.
      const trailingEpsAtFlag =
        subject.ttm.peRatio !== null && subject.ttm.peRatio !== 0 && subject.quote.price > 0
          ? subject.quote.price / subject.ttm.peRatio
          : (subject.annual[0]?.income.epsDiluted ?? null);
      const fundamentalsAtFlag = classifyFundamentalsDirection({
        trailingEps: trailingEpsAtFlag,
        forwardEps: subject.ttm.forwardEps,
        pastAnnualEps: subject.annual.map((a) => a.income.epsDiluted),
      });

      results.push({
        flag,
        recovered: rec.recovered,
        recoveryDate: rec.recoveryDate,
        peakGainPct,
        finalGainPct,
        fvAtExit,
        fvDir,
        nonRecoveryClass,
        fundamentalsAtFlag,
      });
    }
    console.log(
      `  ${flagDate}: flagged ${flaggedCount} (universe ${universe.length})`,
    );
  }

  // ---------------------------- Aggregate ----------------------------
  console.log(`\n=== Results (n=${results.length} flag-events) ===\n`);
  const recovered = results.filter((r) => r.recovered);
  const nonRec = results.filter((r) => !r.recovered);
  const recRate = results.length > 0 ? recovered.length / results.length : 0;
  console.log(
    `1. Recovery rate: ${recovered.length}/${results.length} = ${(recRate * 100).toFixed(1)}%`,
  );

  const peakGains = recovered.map((r) => r.peakGainPct).sort((a, b) => a - b);
  const finalGains = recovered.map((r) => r.finalGainPct).sort((a, b) => a - b);
  if (peakGains.length > 0) {
    console.log(`\n2. Capital gains for RECOVERED tickers:`);
    console.log(
      `   peak-during-window:  p25=${quantile(peakGains, 0.25).toFixed(1)}%  ` +
        `median=${quantile(peakGains, 0.5).toFixed(1)}%  ` +
        `p75=${quantile(peakGains, 0.75).toFixed(1)}%`,
    );
    console.log(
      `   final-at-end:        p25=${quantile(finalGains, 0.25).toFixed(1)}%  ` +
        `median=${quantile(finalGains, 0.5).toFixed(1)}%  ` +
        `p75=${quantile(finalGains, 0.75).toFixed(1)}%`,
    );
  }

  console.log(`\n3. Non-recoveries by FV direction (n=${nonRec.length}):`);
  const fvCounts = { declining: 0, flat: 0, improving: 0 };
  for (const r of nonRec) fvCounts[r.fvDir] += 1;
  for (const k of ["declining", "flat", "improving"] as const) {
    const pct = nonRec.length > 0 ? (fvCounts[k] / nonRec.length) * 100 : 0;
    console.log(`   ${k.padEnd(10)} ${fvCounts[k]} (${pct.toFixed(1)}%)`);
  }

  console.log(`\n4. Non-recoveries by outcome (n=${nonRec.length}):`);
  const cls = { lost: 0, stable: 0, "partial-gain": 0 };
  for (const r of nonRec) {
    if (r.nonRecoveryClass !== null) cls[r.nonRecoveryClass] += 1;
  }
  for (const k of ["lost", "stable", "partial-gain"] as const) {
    const pct = nonRec.length > 0 ? (cls[k] / nonRec.length) * 100 : 0;
    console.log(`   ${k.padEnd(13)} ${cls[k]} (${pct.toFixed(1)}%)`);
  }

  // -------- Cohort split: discriminator quality of fundamentalsDirection --------
  // The new bucket rule demotes Candidates → Watch when fvTrend is
  // "improving" but fundamentalsDirection != "improving." Approximate
  // that here: split flags by fundamentalsDirection at flag-date and
  // compare recovery + outcome stats. If the rule discriminates well,
  // "improving" cohort should beat the others on recovery rate AND
  // have a lower lost-money rate.
  console.log(`\n=== 5. Cohort split by fundamentalsDirection at flag-date ===`);
  type CohortStats = {
    total: number;
    recovered: number;
    lost: number;
    stable: number;
    partialGain: number;
    peakGains: number[];
    finalGains: number[];
  };
  const dirs: FundamentalsDirection[] = [
    "improving",
    "stable",
    "declining",
    "insufficient_data",
  ];
  const cohorts: Record<FundamentalsDirection, CohortStats> = Object.fromEntries(
    dirs.map((d) => [
      d,
      {
        total: 0,
        recovered: 0,
        lost: 0,
        stable: 0,
        partialGain: 0,
        peakGains: [],
        finalGains: [],
      },
    ]),
  ) as Record<FundamentalsDirection, CohortStats>;

  for (const r of results) {
    const c = cohorts[r.fundamentalsAtFlag];
    c.total += 1;
    if (r.recovered) {
      c.recovered += 1;
      c.peakGains.push(r.peakGainPct);
      c.finalGains.push(r.finalGainPct);
    } else {
      if (r.nonRecoveryClass === "lost") c.lost += 1;
      else if (r.nonRecoveryClass === "stable") c.stable += 1;
      else if (r.nonRecoveryClass === "partial-gain") c.partialGain += 1;
    }
  }

  // Header row
  console.log(
    `\n   cohort                n   recovery%   lost%   stable%   partial%   peak-med   final-med`,
  );
  for (const d of dirs) {
    const c = cohorts[d];
    if (c.total === 0) {
      console.log(`   ${d.padEnd(20)}  0   —`);
      continue;
    }
    const recPct = (c.recovered / c.total) * 100;
    const lostPct = (c.lost / c.total) * 100;
    const stablePct = (c.stable / c.total) * 100;
    const partialPct = (c.partialGain / c.total) * 100;
    c.peakGains.sort((a, b) => a - b);
    c.finalGains.sort((a, b) => a - b);
    const peakMed =
      c.peakGains.length > 0 ? quantile(c.peakGains, 0.5) : null;
    const finalMed =
      c.finalGains.length > 0 ? quantile(c.finalGains, 0.5) : null;
    console.log(
      `   ${d.padEnd(20)} ${String(c.total).padStart(4)}    ${recPct.toFixed(1).padStart(5)}%  ${lostPct.toFixed(1).padStart(5)}%   ${stablePct.toFixed(1).padStart(5)}%    ${partialPct.toFixed(1).padStart(5)}%   ` +
        `${(peakMed ?? 0).toFixed(1).padStart(6)}%    ${(finalMed ?? 0).toFixed(1).padStart(6)}%`,
    );
  }

  // Munger inversion summary: kept-vs-demoted comparison
  const kept = cohorts.improving;
  const demotedTotal =
    cohorts.stable.total +
    cohorts.declining.total +
    cohorts.insufficient_data.total;
  const demotedRecovered =
    cohorts.stable.recovered +
    cohorts.declining.recovered +
    cohorts.insufficient_data.recovered;
  const demotedLost =
    cohorts.stable.lost +
    cohorts.declining.lost +
    cohorts.insufficient_data.lost;
  console.log(`\n   ── Aggregated by new-rule action ──`);
  if (kept.total > 0) {
    console.log(
      `   KEPT (improving):     n=${kept.total}  recovery=${((kept.recovered / kept.total) * 100).toFixed(1)}%  lost=${((kept.lost / kept.total) * 100).toFixed(1)}%`,
    );
  }
  if (demotedTotal > 0) {
    console.log(
      `   DEMOTED (other):      n=${demotedTotal}  recovery=${((demotedRecovered / demotedTotal) * 100).toFixed(1)}%  lost=${((demotedLost / demotedTotal) * 100).toFixed(1)}%`,
    );
  }
  if (kept.total > 0 && demotedTotal > 0) {
    const recDelta =
      (kept.recovered / kept.total - demotedRecovered / demotedTotal) * 100;
    const lostDelta =
      (kept.lost / kept.total - demotedLost / demotedTotal) * 100;
    console.log(
      `   Δ recovery: ${recDelta > 0 ? "+" : ""}${recDelta.toFixed(1)} pts (positive = rule helps recovery)`,
    );
    console.log(
      `   Δ lost:     ${lostDelta > 0 ? "+" : ""}${lostDelta.toFixed(1)} pts (negative = rule reduces losses)`,
    );
  }

  // Persist raw results so we can slice later without re-running.
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        holdingWindowYears: HOLDING_WINDOW_YEARS,
        flagLookbackYears: FLAG_LOOKBACK_YEARS,
        flagDateRange: { start: flagWindowStart, end: flagWindowEnd },
        summary: {
          totalFlags: results.length,
          recoveredCount: recovered.length,
          recoveryRate: recRate,
          peakGainPercentiles: {
            p25: peakGains.length ? quantile(peakGains, 0.25) : null,
            median: peakGains.length ? quantile(peakGains, 0.5) : null,
            p75: peakGains.length ? quantile(peakGains, 0.75) : null,
          },
          finalGainPercentiles: {
            p25: finalGains.length ? quantile(finalGains, 0.25) : null,
            median: finalGains.length ? quantile(finalGains, 0.5) : null,
            p75: finalGains.length ? quantile(finalGains, 0.75) : null,
          },
          nonRecoveryByFvDirection: fvCounts,
          nonRecoveryByOutcome: cls,
        },
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote raw results to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
