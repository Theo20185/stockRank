/**
 * Self-maintained S&P 500 membership-changes ledger.
 *
 * Wikipedia removed the changes table from "List of S&P 500
 * companies" (discovered 2026-10-28; the dedicated "List of S&P 500
 * index changes" article is a soft 404), so the scraped feed that
 * powered point-in-time membership reconstruction is gone upstream.
 * This ledger replaces it:
 *
 *   - SEEDED from the last good Wikipedia fetch (effective dates
 *     through 2026-06-22, cached 2026-06-11).
 *   - EXTENDED at refresh time by diffing the LIVE constituents
 *     table (that parser still works) against the ledger's own last
 *     observed membership. New entries carry the OBSERVATION date —
 *     accurate to the refresh cadence rather than the index's
 *     effective date. Membership reconstruction (`membersAt`) only
 *     needs ordered consistency, so this is an honest approximation,
 *     and `source: "observed"` marks the dating semantics.
 *
 * The ledger is a committed artifact (`sp500-changes.json` beside
 * this module) so backtests are reproducible from a checkout.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexChange } from "./wikipedia-history.js";
import type { UniverseEntry } from "./loader.js";

export type LedgerChange = IndexChange & {
  /** "wikipedia" = effective-dated seed rows; "observed" =
   * refresh-time diff rows dated at observation. */
  source: "wikipedia" | "observed";
};

export type ChangesLedger = {
  seededFrom: string;
  updatedAt: string;
  /** Last observed live membership — the diff baseline. */
  currentConstituents: string[];
  changes: LedgerChange[];
};

export const LEDGER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./sp500-changes.json",
);

export function diffConstituents(
  previous: readonly string[],
  live: readonly UniverseEntry[],
): { added: UniverseEntry[]; removed: string[] } {
  const prevSet = new Set(previous);
  const liveSet = new Set(live.map((e) => e.symbol));
  return {
    added: live.filter((e) => !prevSet.has(e.symbol)),
    removed: previous.filter((s) => !liveSet.has(s)),
  };
}

/**
 * Fold a live constituents observation into the ledger. Pure; returns
 * the input ledger (same reference) when there is no drift, so
 * callers can cheaply detect "nothing happened".
 */
export function appendObservedChanges(
  ledger: ChangesLedger,
  live: readonly UniverseEntry[],
  observedDateIso: string,
): ChangesLedger {
  const { added, removed } = diffConstituents(ledger.currentConstituents, live);
  if (added.length === 0 && removed.length === 0) return ledger;

  const nameBySymbol = new Map(live.map((e) => [e.symbol, e.name]));
  const changes: LedgerChange[] = [...ledger.changes];
  // Pair adds and removes positionally where possible (index swaps
  // usually come in pairs); leftovers become one-sided entries —
  // identical convention to the Wikipedia table's asymmetric rows.
  const n = Math.max(added.length, removed.length);
  for (let i = 0; i < n; i += 1) {
    const add = added[i];
    const rem = removed[i];
    changes.push({
      date: observedDateIso,
      added: add ? { ticker: add.symbol, name: add.name } : null,
      removed: rem
        ? { ticker: rem, name: nameBySymbol.get(rem) ?? rem }
        : null,
      reason: "observed via constituents diff (date = observation, not effective)",
      source: "observed",
    });
  }
  return {
    ...ledger,
    updatedAt: new Date(`${observedDateIso}T00:00:00.000Z`).toISOString(),
    currentConstituents: live.map((e) => e.symbol).sort(),
    changes,
  };
}

/** The ledger's rows in the `wikipedia-history` IndexChange shape —
 * drop-in for `buildMembershipHistory`. */
export function ledgerChangesAsIndexChanges(
  ledger: ChangesLedger,
): IndexChange[] {
  return ledger.changes.map(({ date, added, removed, reason }) => ({
    date,
    added,
    removed,
    reason,
  }));
}

export async function loadLedger(
  path: string = LEDGER_PATH,
): Promise<ChangesLedger | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ChangesLedger;
  } catch {
    return null;
  }
}

export async function saveLedger(
  ledger: ChangesLedger,
  path: string = LEDGER_PATH,
): Promise<void> {
  await writeFile(path, JSON.stringify(ledger, null, 2) + "\n", "utf8");
}
