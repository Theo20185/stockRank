#!/usr/bin/env tsx
/**
 * One-shot stock inspector. Pulls together everything we know about a
 * symbol from the snapshot + summary + per-symbol options file.
 *
 * Usage: npx tsx scripts/inspect-symbol.ts SYMBOL
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OptionsSummary, Snapshot } from "@stockrank/core";
import {
  bucketRows,
  fairValueFor,
  rank,
  type OptionsView,
} from "@stockrank/ranking";

const symbol = (process.argv[2] ?? "").toUpperCase();
if (!symbol) {
  console.error("usage: inspect-symbol SYMBOL");
  process.exit(1);
}

const snapshot = JSON.parse(
  readFileSync("public/data/snapshot-latest.json", "utf8"),
) as Snapshot;
const summary = JSON.parse(
  readFileSync("public/data/options-summary.json", "utf8"),
) as OptionsSummary;

const company = snapshot.companies.find((c) => c.symbol === symbol);
if (!company) {
  console.error(`${symbol} not in snapshot`);
  process.exit(1);
}

const ranked = rank({
  companies: snapshot.companies,
  snapshotDate: snapshot.snapshotDate,
});
for (const r of ranked.rows) {
  const c = snapshot.companies.find((x) => x.symbol === r.symbol);
  if (c) r.fairValue = fairValueFor(c, snapshot.companies);
  if (summary.symbols[r.symbol]) {
    const best = summary.symbols[r.symbol]!;
    r.optionsLiquid =
      best.bestCallAnnualized !== null && best.bestPutAnnualized !== null;
  }
}
const buckets = bucketRows(ranked.rows);
const row = ranked.rows.find((r) => r.symbol === symbol);
if (!row) {
  console.error(`${symbol} not in ranked rows (likely on turnaround watchlist)`);
  process.exit(0);
}

const bucket = buckets.ranked.includes(row)
  ? "ranked"
  : buckets.watch.includes(row)
    ? "watch"
    : "excluded";

console.log(`=== ${symbol} (${company.name}) ===`);
console.log(`industry: ${company.industry} / ${company.sector}`);
console.log(`bucket:   ${bucket}`);
console.log(
  `rank:     industry #${row.industryRank} · universe #${row.universeRank}`,
);
console.log(`composite: ${row.composite.toFixed(2)}`);
console.log(`negativeEquity: ${row.negativeEquity}, optionsLiquid: ${row.optionsLiquid}`);
console.log();

console.log("Category scores:");
for (const [k, v] of Object.entries(row.categoryScores)) {
  console.log(`  ${k.padEnd(20)} ${v === null ? "—" : v.toFixed(1)}`);
}

const fv = row.fairValue;
if (fv?.range) {
  console.log("\nFair value:");
  console.log(`  range:    $${fv.range.p25.toFixed(2)} / $${fv.range.median.toFixed(2)} / $${fv.range.p75.toFixed(2)}  (p25/median/p75)`);
  console.log(`  current:  $${fv.current.toFixed(2)}`);
  console.log(`  upside p25:    ${fv.upsideToP25Pct?.toFixed(1)}%`);
  console.log(`  upside median: ${fv.upsideToMedianPct?.toFixed(1)}%`);
  console.log(`  confidence:    ${fv.confidence} (${fv.peerSet} peers, ${fv.peerCount})`);
  console.log(`  ttmTreatment:  ${fv.ttmTreatment}`);
}

const best = summary.symbols[symbol];
if (best) {
  console.log("\nOptions summary:");
  console.log(`  best call annualized: ${best.bestCallAnnualized !== null ? (best.bestCallAnnualized * 100).toFixed(1) + "%" : "—"}`);
  console.log(`  best put annualized:  ${best.bestPutAnnualized !== null ? (best.bestPutAnnualized * 100).toFixed(1) + "%" : "—"}`);
}

let view: OptionsView | null = null;
try {
  view = JSON.parse(
    readFileSync(resolve("public/data/options", `${symbol}.json`), "utf8"),
  ) as OptionsView;
} catch {
  /* missing options file */
}
if (view) {
  console.log("\nOptions detail:");
  for (const exp of view.expirations) {
    const dteCall = exp.coveredCalls[0]?.contract.daysToExpiry;
    const dtePut = exp.puts[0]?.contract.daysToExpiry;
    console.log(`  ${exp.expiration} (${exp.selectionReason})`);
    for (const c of exp.coveredCalls) {
      console.log(
        `    CALL K=$${c.contract.strike} bid=$${c.contract.bid?.toFixed(2)} OI=${c.contract.openInterest} IV=${((c.contract.impliedVolatility ?? 0) * 100).toFixed(0)}% DTE=${c.contract.daysToExpiry}`,
      );
      console.log(
        `         static ${(c.staticReturnPct * 100).toFixed(1)}% (annl ${(c.staticAnnualizedPct * 100).toFixed(1)}%) · assigned ${(c.assignedReturnPct * 100).toFixed(1)}% (annl ${(c.assignedAnnualizedPct * 100).toFixed(1)}%) · eff cost $${c.effectiveCostBasis.toFixed(2)}`,
      );
    }
    for (const p of exp.puts) {
      console.log(
        `    PUT  K=$${p.contract.strike} bid=$${p.contract.bid?.toFixed(2)} OI=${p.contract.openInterest} IV=${((p.contract.impliedVolatility ?? 0) * 100).toFixed(0)}% DTE=${p.contract.daysToExpiry}`,
      );
      console.log(
        `         premium ${(p.notAssignedReturnPct * 100).toFixed(1)}% (annl ${(p.notAssignedAnnualizedPct * 100).toFixed(1)}%) · eff cost $${p.effectiveCostBasis.toFixed(2)} (disc ${(p.effectiveDiscountPct * 100).toFixed(1)}%)`,
      );
    }
    void dteCall; void dtePut;
  }
}
