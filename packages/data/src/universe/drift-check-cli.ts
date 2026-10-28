#!/usr/bin/env tsx
/**
 * Refresh-time S&P 500 drift guard + ledger maintenance.
 *
 *   1. Fetch live constituents from Wikipedia (that table still
 *      parses; the CHANGES table was deleted upstream — see
 *      changes-ledger.ts).
 *   2. Fold the observation into the committed changes ledger.
 *   3. WARN when the committed sp500.json universe has drifted from
 *      the live index (the September 2026 drift went 5 months
 *      unnoticed; the October drift was caught by this ledger's
 *      first run).
 *
 * ALWAYS exits 0 — a Wikipedia hiccup must never kill a refresh.
 * Universe updates remain the operator-reviewed refresh-cli flow.
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSp500FromWikipedia } from "./wikipedia.js";
import {
  appendObservedChanges,
  loadLedger,
  saveLedger,
} from "./changes-ledger.js";

const SP500_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./sp500.json",
);

async function main(): Promise<void> {
  let live;
  try {
    live = await fetchSp500FromWikipedia();
  } catch (err) {
    console.warn(
      `drift-check: live constituents fetch failed (${err instanceof Error ? err.message : err}) — skipping this run.`,
    );
    return;
  }
  if (live.length < 400) {
    console.warn(
      `drift-check: live list implausibly small (${live.length}) — skipping this run.`,
    );
    return;
  }

  const ledger = await loadLedger();
  if (ledger) {
    const today = new Date().toISOString().slice(0, 10);
    const next = appendObservedChanges(ledger, live, today);
    if (next !== ledger) {
      await saveLedger(next);
      const fresh = next.changes.filter(
        (c) => c.source === "observed" && c.date === today,
      );
      console.warn(
        `drift-check: ${fresh.length} new membership change(s) observed and appended to the ledger:`,
      );
      for (const c of fresh) {
        console.warn(`  +${c.added?.ticker ?? "—"} −${c.removed?.ticker ?? "—"}`);
      }
    } else {
      console.log("drift-check: index membership unchanged since last observation.");
    }
  } else {
    console.warn("drift-check: no ledger found — run the seed before relying on PIT history.");
  }

  // Committed-universe drift (operator action needed, not automatic).
  const committed = JSON.parse(await readFile(SP500_PATH, "utf8")) as Array<{
    symbol: string;
  }>;
  const committedSet = new Set(committed.map((e) => e.symbol));
  const liveSet = new Set(live.map((e) => e.symbol));
  const missing = live.filter((e) => !committedSet.has(e.symbol)).map((e) => e.symbol);
  const lingering = committed.map((e) => e.symbol).filter((s) => !liveSet.has(s));
  if (missing.length > 0 || lingering.length > 0) {
    console.warn(
      `drift-check: WARNING — sp500.json has drifted from the live index (missing: ${missing.join(",") || "none"}; lingering: ${lingering.join(",") || "none"}). Run: npx tsx packages/data/src/universe/refresh-cli.ts && npm run refresh-cik`,
    );
  } else {
    console.log("drift-check: sp500.json matches the live index.");
  }
}

main().catch((err) => {
  // Never fail the refresh pipeline from here.
  console.warn(`drift-check: unexpected error — ${err instanceof Error ? err.message : err}`);
});
