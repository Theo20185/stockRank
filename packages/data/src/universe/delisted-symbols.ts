/**
 * Phase 2D — recover historical data for symbols that were once in
 * the S&P 500 but no longer are (delisted, acquired, dropped for
 * cap change, etc.). Used by the backtest pipeline to fix the
 * survivorship-bias gap that v1 PIT couldn't address: the floor's
 * biggest job is filtering names that subsequently went bankrupt,
 * but those names were invisible to the old PIT pipeline because
 * we only had data for surviving names in today's S&P 500.
 *
 * Pure helpers; the caller does the network fetches.
 */

import type { IndexChange } from "./wikipedia-history.js";

export type DelistedSymbol = {
  ticker: string;
  /** Company name as it appeared in the changes table. */
  name: string;
  /** Date the symbol was removed from the S&P 500. */
  removalDate: string;
  /** Wikipedia's reason text — heuristically classified into a
   * removalReason category below. */
  rawReason: string | null;
  /** Heuristic classification of why the symbol left the index. */
  removalReason:
    | "market-cap-change" // still trading, dropped from index
    | "acquired" // bought out — likely positive realized return
    | "bankruptcy" // -100% realized return
    | "spinoff" // restructured; need to look at child entities
    | "other"; // unclassified
};

/**
 * Extract the deduplicated list of removed tickers from a changes
 * table. When the same ticker appears multiple times (e.g., removed
 * then re-added later), the EARLIEST removal is kept — that's the
 * most informative for backtest purposes (we want to know when the
 * symbol first stopped being a member).
 *
 * Currently-trading symbols (anything in `currentConstituents`) are
 * EXCLUDED — those names still exist and are already in the
 * universe.
 */
export function extractDelistedSymbols(
  changes: ReadonlyArray<IndexChange>,
  currentConstituents: ReadonlyArray<string>,
): DelistedSymbol[] {
  const current = new Set(currentConstituents);
  // Map: ticker → earliest removal record (so re-adds don't override
  // the original removal — though a re-added ticker is an edge case).
  const byTicker = new Map<string, DelistedSymbol>();
  for (const change of changes) {
    if (!change.removed) continue;
    const ticker = change.removed.ticker;
    if (current.has(ticker)) continue; // still in the index
    const existing = byTicker.get(ticker);
    if (existing && existing.removalDate <= change.date) continue;
    byTicker.set(ticker, {
      ticker,
      name: change.removed.name,
      removalDate: change.date,
      rawReason: change.reason,
      removalReason: classifyRemovalReason(change.reason),
    });
  }
  // Sort by removal date for deterministic iteration.
  return [...byTicker.values()].sort((a, b) =>
    a.removalDate < b.removalDate ? -1 : a.removalDate > b.removalDate ? 1 : 0,
  );
}

/**
 * Heuristic classifier for Wikipedia's free-form reason text.
 * Conservative — most removals tagged with vague language end up
 * "other"; specific keywords trigger more informative tags.
 */
export function classifyRemovalReason(
  reason: string | null,
): DelistedSymbol["removalReason"] {
  if (!reason) return "other";
  const r = reason.toLowerCase();
  if (r.includes("bankrupt") || r.includes("chapter 11") || r.includes("liquidat")) {
    return "bankruptcy";
  }
  if (r.includes("acqui") || r.includes("merger") || r.includes("merge ") || r.includes("buyout") || r.includes("taken private")) {
    return "acquired";
  }
  if (r.includes("spin") || r.includes("split off")) {
    return "spinoff";
  }
  if (r.includes("market cap") || r.includes("size") || r.includes("eligibility")) {
    return "market-cap-change";
  }
  return "other";
}
