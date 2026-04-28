#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rank, fairValueFor, bucketRows } from "@stockrank/ranking";
import type { Snapshot } from "@stockrank/core";

const snap = JSON.parse(
  readFileSync(resolve("public/data/snapshot-latest.json"), "utf8"),
) as Snapshot;

console.log(`Snapshot ${snap.snapshotDate} · ${snap.companies.length} companies\n`);

const ranked = rank({ companies: snap.companies, snapshotDate: snap.snapshotDate });
for (const row of ranked.rows) {
  const c = snap.companies.find((x) => x.symbol === row.symbol);
  if (c) row.fairValue = fairValueFor(c, snap.companies);
}
const buckets = bucketRows(ranked.rows);
const candidates = buckets.ranked.slice().sort((a, b) => b.composite - a.composite);

console.log(`Candidates: ${candidates.length}`);
console.log(`Top 30 Candidates with capital required for slightly-OTM CSP:\n`);
console.log(
  "Sym".padEnd(6) +
    "Spot".padStart(8) +
    "p25".padStart(8) +
    "Upside".padStart(8) +
    "Strike".padStart(8) +
    "Capital".padStart(10) +
    "Comp".padStart(7) +
    "  Industry",
);
console.log("─".repeat(100));
for (const c of candidates.slice(0, 30)) {
  const spot = c.price;
  const p25 = c.fairValue?.range?.p25 ?? 0;
  const upsidePct = p25 > 0 ? ((p25 - spot) / spot) * 100 : 0;
  // Slightly OTM strike: round to nearest standard increment
  const increment = spot < 50 ? 2.5 : spot < 200 ? 5 : 10;
  const strike = Math.floor((spot * 0.95) / increment) * increment;
  const capital = strike * 100;
  console.log(
    c.symbol.padEnd(6) +
      `$${spot.toFixed(2)}`.padStart(8) +
      `$${p25.toFixed(2)}`.padStart(8) +
      `${upsidePct.toFixed(1)}%`.padStart(8) +
      `$${strike.toFixed(2)}`.padStart(8) +
      `$${capital.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`.padStart(10) +
      `${c.composite.toFixed(1)}`.padStart(7) +
      `  ${c.industry}`,
  );
}

// Histogram of capital requirements
console.log("\n─────────────────────────────────────────────────");
console.log("Capital required per CSP (slightly-OTM strike) histogram:");
const buckets2 = { "<$3k": 0, "$3-7k": 0, "$7-15k": 0, "$15-30k": 0, "$30k+": 0 };
for (const c of candidates) {
  const spot = c.price;
  const increment = spot < 50 ? 2.5 : spot < 200 ? 5 : 10;
  const strike = Math.floor((spot * 0.95) / increment) * increment;
  const cap = strike * 100;
  if (cap < 3000) buckets2["<$3k"]++;
  else if (cap < 7000) buckets2["$3-7k"]++;
  else if (cap < 15000) buckets2["$7-15k"]++;
  else if (cap < 30000) buckets2["$15-30k"]++;
  else buckets2["$30k+"]++;
}
for (const [k, v] of Object.entries(buckets2)) {
  console.log(`  ${k.padEnd(10)} ${v} candidates`);
}

// Stats
const capitals = candidates.map((c) => {
  const spot = c.price;
  const inc = spot < 50 ? 2.5 : spot < 200 ? 5 : 10;
  return Math.floor((spot * 0.95) / inc) * inc * 100;
}).sort((a, b) => a - b);
const median = capitals[Math.floor(capitals.length / 2)];
console.log(`\nMedian capital per CSP: $${median?.toLocaleString()}`);
console.log(`Total Candidates available: ${candidates.length}`);
