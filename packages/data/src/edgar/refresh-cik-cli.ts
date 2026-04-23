#!/usr/bin/env tsx
/**
 * Regenerate `packages/data/src/edgar/cik-lookup.json` from SEC's
 * authoritative `company_tickers.json`. Walks every symbol in the
 * S&P 500 universe, normalizes ticker forms (BRK.B → BRK-B), and
 * writes a baked symbol → CIK mapping.
 *
 * Run when:
 *   - the S&P 500 list changes (`npm run refresh-universe`)
 *   - SEC adds new filers we want to track
 *   - a new ticker resolves to a wrong CIK and needs an override
 *
 * Usage:
 *   npm run refresh-cik
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSp500Universe } from "../universe/loader.js";

const SEC_URL = "https://www.sec.gov/files/company_tickers.json";
const USER_AGENT = "StockRank brandon.theolet@gmail.com";
const OUT_PATH = resolve(
  process.cwd(),
  "packages/data/src/edgar/cik-lookup.json",
);

type SecRow = { cik_str: number; ticker: string; title: string };

async function fetchTickers(): Promise<Record<string, SecRow>> {
  const res = await fetch(SEC_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SEC fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Record<string, SecRow>;
}

function normalizeTicker(symbol: string): string[] {
  // SEC uses dashes for share-class delimiters; canonical S&P 500
  // list uses dots. Try multiple forms.
  return [
    symbol,
    symbol.replace(/\./g, "-"),
    symbol.replace(/\./g, ""),
  ];
}

async function main(): Promise<void> {
  console.log("Fetching SEC ticker → CIK table…");
  const rows = await fetchTickers();
  const byTicker = new Map<string, number>();
  for (const row of Object.values(rows)) {
    byTicker.set(row.ticker.toUpperCase(), row.cik_str);
  }
  console.log(`SEC table has ${byTicker.size} tickers.`);

  console.log("Loading S&P 500 universe…");
  const universe = await loadSp500Universe();

  const out: Record<string, number> = {};
  const missing: string[] = [];
  for (const co of universe) {
    let cik: number | undefined;
    for (const candidate of normalizeTicker(co.symbol.toUpperCase())) {
      cik = byTicker.get(candidate);
      if (cik !== undefined) break;
    }
    if (cik !== undefined) {
      out[co.symbol] = cik;
    } else {
      missing.push(co.symbol);
    }
  }

  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${Object.keys(out).length} mappings to ${OUT_PATH}`);
  if (missing.length > 0) {
    console.warn(
      `WARNING: ${missing.length} symbols had no CIK match: ${missing.join(", ")}`,
    );
  } else {
    console.log("All S&P 500 symbols mapped.");
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
