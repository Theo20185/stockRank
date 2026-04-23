#!/usr/bin/env tsx
/**
 * Head-to-head back-test of two strategies on the same historical
 * universe + flag dates:
 *
 *   A. "Buffett-style hold-forever" — buy when price ≤ fvMedian
 *      (fairly valued or below), hold to today, capture total return.
 *   B. "Graham-style covered call" — buy when price < fvP25 (deep
 *      value), sell call at fvP25 expiring 2y out, capture
 *      assignment return + premium income.
 *
 * The strategies have different entry rules + different exit
 * mechanics, so the comparison is "which philosophy historically
 * compounded better on this universe with this engine."
 *
 * Premium for Strategy B is estimated via a closed-form approximation
 * (no historical options data available) — see
 * `packages/ranking/src/options/premium-estimate.ts`. Sensitivity
 * scenarios run at conservative / moderate / aggressive premium
 * levels.
 *
 * Usage:
 *   npx tsx scripts/backtest-strategy-comparison.ts
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import {
  estimateCallPremiumPct,
  fairValueFor,
} from "@stockrank/ranking";
import {
  fetchCompanyFacts,
  quarterEndsBetween,
  readMonthlyBars,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "@stockrank/data";

const SNAPSHOT_DIR = resolve(process.cwd(), "public/data");

const HOLDING_WINDOW_YEARS_B = 2;
const FLAG_LOOKBACK_YEARS = 4; // earliest flag date = today - 4y

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
  return sorted[lo]! * (1 - (idx - lo)) + sorted[hi]! * (idx - lo);
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

type Bar = NonNullable<Awaited<ReturnType<typeof readMonthlyBars>>>[number];

function priceAtOrBefore(bars: Bar[], targetIso: string): number | null {
  let result: number | null = null;
  for (const b of bars) {
    if (b.date <= targetIso) result = b.close;
    else break;
  }
  return result;
}

function peakHighInWindow(bars: Bar[], startIso: string, endIso: string): number {
  let peak = 0;
  for (const b of bars) {
    if (b.date <= startIso) continue;
    if (b.date > endIso) break;
    const h = b.high ?? b.close;
    if (h > peak) peak = h;
  }
  return peak;
}

function finalCloseInWindow(
  bars: Bar[],
  startIso: string,
  endIso: string,
): number | null {
  let last: number | null = null;
  for (const b of bars) {
    if (b.date <= startIso) continue;
    if (b.date > endIso) break;
    last = b.close;
  }
  return last;
}

type StrategyAResult = {
  symbol: string;
  flagDate: string;
  entryPrice: number;
  endPrice: number;
  yearsHeld: number;
  totalReturnPct: number;
  annualizedPct: number;
};

type StrategyBResult = {
  symbol: string;
  flagDate: string;
  entryPrice: number;
  strike: number;
  upsideToStrikePct: number;
  assigned: boolean;
  endPrice: number;
  capitalReturnPct: number;
  estPremiumPct: number;
  totalReturnPct: number;
  annualizedPct: number;
};

async function main(): Promise<void> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const flagWindowEnd = addYears(todayIso, -HOLDING_WINDOW_YEARS_B); // need 2y forward for B
  const flagWindowStart = addYears(todayIso, -(FLAG_LOOKBACK_YEARS + HOLDING_WINDOW_YEARS_B));

  console.log(
    `Strategy comparison: flag dates ${flagWindowStart} → ${flagWindowEnd}\n` +
      `  A: hold-to-today (variable horizon)\n` +
      `  B: 2y CC at fvP25 (premium estimated, sensitivity scenarios)\n`,
  );

  const latestSnap = JSON.parse(
    await readFile(resolve(SNAPSHOT_DIR, "snapshot-latest.json"), "utf8"),
  ) as Snapshot;
  const profiles = new Map<string, SymbolProfile>();
  for (const c of latestSnap.companies) profiles.set(c.symbol, profileFromCompany(c));

  // Load caches once.
  const facts = new Map<string, Awaited<ReturnType<typeof fetchCompanyFacts>>>();
  const bars = new Map<string, Bar[]>();
  for (const symbol of profiles.keys()) {
    try {
      facts.set(symbol, await fetchCompanyFacts(symbol, { cacheTtlHours: 24 * 365 }));
    } catch {
      /* skip */
    }
    const b = await readMonthlyBars(symbol);
    if (b) bars.set(symbol, b);
  }
  console.log(`Loaded ${facts.size} EDGAR facts, ${bars.size} chart bars.\n`);

  const flagDates = quarterEndsBetween(flagWindowStart, flagWindowEnd);
  const aResults: StrategyAResult[] = [];
  const bResults: StrategyBResult[] = [];

  for (const flagDate of flagDates) {
    const universe: CompanySnapshot[] = [];
    for (const [symbol, profile] of profiles) {
      const f = facts.get(symbol);
      const b = bars.get(symbol);
      if (!f || !b) continue;
      const snap = synthesizeSnapshotAt(f, b, flagDate, profile);
      if (snap) universe.push(snap);
    }
    if (universe.length === 0) continue;

    let aFlags = 0;
    let bFlags = 0;
    for (const subject of universe) {
      let fv;
      try {
        fv = fairValueFor(subject, universe);
      } catch {
        continue;
      }
      if (!fv.range) continue;
      const fvMedian = fv.range.median;
      const fvP25 = fv.range.p25;
      const entryPrice = subject.quote.price;
      if (entryPrice <= 0) continue;
      const symBars = bars.get(subject.symbol);
      if (!symBars) continue;

      // -------- Strategy A: hold-to-today when price ≤ fvMedian --------
      if (fvMedian > 0 && entryPrice <= fvMedian) {
        const endPrice = priceAtOrBefore(symBars, todayIso);
        if (endPrice !== null && endPrice > 0) {
          const yearsHeld =
            (new Date(`${todayIso}T00:00:00Z`).getTime() -
              new Date(`${flagDate}T00:00:00Z`).getTime()) /
            (365.25 * 24 * 3600 * 1000);
          if (yearsHeld >= 0.5) {
            const totalRet = ((endPrice - entryPrice) / entryPrice) * 100;
            const annualized = totalRet / yearsHeld;
            aResults.push({
              symbol: subject.symbol,
              flagDate,
              entryPrice,
              endPrice,
              yearsHeld,
              totalReturnPct: totalRet,
              annualizedPct: annualized,
            });
            aFlags += 1;
          }
        }
      }

      // -------- Strategy B: 2y CC at fvP25 when price < fvP25 --------
      if (fvP25 > 0 && entryPrice < fvP25) {
        const exitDate = addYears(flagDate, HOLDING_WINDOW_YEARS_B);
        const peak = peakHighInWindow(symBars, flagDate, exitDate);
        const finalClose = finalCloseInWindow(symBars, flagDate, exitDate) ?? entryPrice;
        const assigned = peak >= fvP25;
        const upsideToStrikePct = ((fvP25 - entryPrice) / entryPrice) * 100;
        const capitalReturnPct = assigned
          ? ((fvP25 - entryPrice) / entryPrice) * 100
          : ((finalClose - entryPrice) / entryPrice) * 100;
        const estPremiumPct = estimateCallPremiumPct({
          upsideToStrikePct,
          yearsToExpiry: HOLDING_WINDOW_YEARS_B,
        });
        const totalReturnPct = capitalReturnPct + estPremiumPct;
        const annualized = totalReturnPct / HOLDING_WINDOW_YEARS_B;
        bResults.push({
          symbol: subject.symbol,
          flagDate,
          entryPrice,
          strike: fvP25,
          upsideToStrikePct,
          assigned,
          endPrice: assigned ? fvP25 : finalClose,
          capitalReturnPct,
          estPremiumPct,
          totalReturnPct,
          annualizedPct: annualized,
        });
        bFlags += 1;
      }
    }
    console.log(`  ${flagDate}: A=${aFlags}, B=${bFlags}, universe=${universe.length}`);
  }

  // ---------------------------- Aggregate ----------------------------
  const aAnnualized = aResults.map((r) => r.annualizedPct).sort((a, b) => a - b);
  const bAnnualized = bResults.map((r) => r.annualizedPct).sort((a, b) => a - b);

  const summarize = (label: string, vals: number[], total: number, lostCount: number) => {
    const winRate = vals.filter((v) => v > 0).length / Math.max(1, vals.length);
    console.log(
      `\n${label} — n=${total}\n` +
        `  annualized return:  p25=${quantile(vals, 0.25).toFixed(1)}%  ` +
        `median=${quantile(vals, 0.5).toFixed(1)}%  ` +
        `p75=${quantile(vals, 0.75).toFixed(1)}%\n` +
        `  win rate (positive return): ${(winRate * 100).toFixed(1)}%\n` +
        `  lost money rate:            ${((lostCount / Math.max(1, total)) * 100).toFixed(1)}%`,
    );
  };

  console.log(`\n========== Strategy A: Buffett-style hold-to-today ==========`);
  summarize(
    "Strategy A",
    aAnnualized,
    aResults.length,
    aResults.filter((r) => r.totalReturnPct < 0).length,
  );

  console.log(`\n========== Strategy B: Graham-style covered call (2y, est. premium) ==========`);
  summarize(
    "Strategy B (default IV=25%)",
    bAnnualized,
    bResults.length,
    bResults.filter((r) => r.totalReturnPct < 0).length,
  );
  const assignedRate =
    bResults.filter((r) => r.assigned).length / Math.max(1, bResults.length);
  const avgPremium =
    bResults.reduce((s, r) => s + r.estPremiumPct, 0) / Math.max(1, bResults.length);
  const avgUpside =
    bResults.reduce((s, r) => s + r.upsideToStrikePct, 0) /
    Math.max(1, bResults.length);
  console.log(
    `  assignment rate:            ${(assignedRate * 100).toFixed(1)}%\n` +
      `  avg upside to strike:       ${avgUpside.toFixed(1)}%\n` +
      `  avg estimated premium:      ${avgPremium.toFixed(1)}% (per cycle)`,
  );

  // Sensitivity: re-run B's premium with conservative + aggressive scenarios
  console.log(`\n----- Strategy B premium sensitivity -----`);
  for (const ivLabel of [
    { iv: 0.15, name: "low IV (0.15)" },
    { iv: 0.25, name: "default IV (0.25)" },
    { iv: 0.4, name: "high IV (0.40)" },
  ]) {
    const ann = bResults
      .map((r) => {
        const prem = estimateCallPremiumPct({
          upsideToStrikePct: r.upsideToStrikePct,
          yearsToExpiry: HOLDING_WINDOW_YEARS_B,
          annualizedIv: ivLabel.iv,
        });
        return (r.capitalReturnPct + prem) / HOLDING_WINDOW_YEARS_B;
      })
      .sort((a, b) => a - b);
    console.log(
      `  ${ivLabel.name.padEnd(20)}  median annualized=${quantile(ann, 0.5).toFixed(1)}%  ` +
        `p25=${quantile(ann, 0.25).toFixed(1)}%  p75=${quantile(ann, 0.75).toFixed(1)}%`,
    );
  }

  // Apples-to-apples: only the symbols that qualified for BOTH at the same date
  const aKey = new Set(aResults.map((r) => `${r.symbol}|${r.flagDate}`));
  const overlap = bResults.filter((r) => aKey.has(`${r.symbol}|${r.flagDate}`));
  console.log(`\n========== Overlap (symbols qualifying for both at same flag date) ==========`);
  console.log(`Overlap n=${overlap.length}`);
  if (overlap.length > 0) {
    const overlapAResults = aResults.filter((r) =>
      new Set(overlap.map((o) => `${o.symbol}|${o.flagDate}`)).has(
        `${r.symbol}|${r.flagDate}`,
      ),
    );
    const overlapAAnn = overlapAResults
      .map((r) => r.annualizedPct)
      .sort((a, b) => a - b);
    const overlapBAnn = overlap.map((r) => r.annualizedPct).sort((a, b) => a - b);
    console.log(
      `  A median annualized: ${quantile(overlapAAnn, 0.5).toFixed(1)}%  ` +
        `B median annualized: ${quantile(overlapBAnn, 0.5).toFixed(1)}%`,
    );
  }

  console.log(`\nDone.`);
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
