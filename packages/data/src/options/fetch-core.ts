import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CompanySnapshot,
  OptionsBestReturns,
  OptionsSummary,
  Snapshot,
} from "@stockrank/core";
import {
  buildOptionsView,
  type FairValue,
  type OptionsView,
} from "@stockrank/ranking";
import { selectExpirations } from "./expiration-selector.js";
import type { OptionsProvider } from "./types.js";

/**
 * Pure-ish options-fetch core shared by the standalone CLI and the
 * baked-into-ingest path. Side effects (Yahoo I/O via the provider) are
 * isolated; the caller decides which symbols to feed in.
 */

export type FetchSymbolInput = {
  symbol: string;
  company: CompanySnapshot;
  fairValue: FairValue;
};

export type FetchSymbolResult =
  | { status: "ok"; view: OptionsView; callCount: number; putCount: number }
  | { status: "skipped"; reason: string };

/**
 * Fetch options for a single symbol. The caller is responsible for
 * deciding eligibility (Ranked bucket, fair-value present, etc.) — this
 * function just runs the Yahoo round-trips and returns the view.
 */
export async function fetchSymbolOptions(
  provider: OptionsProvider,
  input: FetchSymbolInput,
  today = new Date().toISOString().slice(0, 10),
): Promise<FetchSymbolResult> {
  const { symbol, company, fairValue } = input;
  if (!fairValue.range) {
    return { status: "skipped", reason: "no fair-value range" };
  }

  const list = await provider.listExpirations(symbol);
  const selected = selectExpirations(today, list.expirationDates);
  if (selected.length === 0) {
    return { status: "skipped", reason: "no usable expirations in chain" };
  }

  const groups = [];
  for (const sel of selected) {
    const group = await provider.fetchExpirationGroup(symbol, sel.expiration);
    groups.push({ selected: sel, group });
  }

  const dividendYield = company.ttm.dividendYield ?? 0;
  const annualDividendPerShare = (dividendYield ?? 0) * company.quote.price;

  const view = buildOptionsView({
    symbol,
    fetchedAt: list.fetchedAt,
    currentPrice: list.underlyingPrice || company.quote.price,
    annualDividendPerShare,
    fairValue,
    expirations: groups,
  });

  const callCount = view.expirations.reduce((s, e) => s + e.coveredCalls.length, 0);
  const putCount = view.expirations.reduce((s, e) => s + e.puts.length, 0);
  return { status: "ok", view, callCount, putCount };
}

export async function writeOptionsView(view: OptionsView, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const out = resolve(outDir, `${view.symbol}.json`);
  await writeFile(out, JSON.stringify(view, null, 2), "utf8");
  return out;
}

/**
 * Roll an OptionsView up to the two headline numbers the ranked-table
 * shows: best annualized covered-call premium and best annualized
 * cash-secured-put premium. "Best" = max across all expirations and all
 * strikes, **excluding short-dated contracts** (DTE < 30) — annualizing
 * a sub-30-day premium dramatically inflates the displayed return
 * relative to anything actually repeatable. The detail panel still
 * shows the short-dated rows with the `shortDated` chip; they just
 * don't count toward the headline number.
 *
 * Returns null for either side when no qualifying contract exists.
 */
const SHORT_DATED_DAYS = 30;

export function bestStaticReturns(view: OptionsView): OptionsBestReturns {
  let bestCall: number | null = null;
  let bestPut: number | null = null;
  for (const exp of view.expirations) {
    for (const c of exp.coveredCalls) {
      if (c.contract.daysToExpiry < SHORT_DATED_DAYS) continue;
      if (bestCall === null || c.staticAnnualizedPct > bestCall) {
        bestCall = c.staticAnnualizedPct;
      }
    }
    for (const p of exp.puts) {
      if (p.contract.daysToExpiry < SHORT_DATED_DAYS) continue;
      if (bestPut === null || p.notAssignedAnnualizedPct > bestPut) {
        bestPut = p.notAssignedAnnualizedPct;
      }
    }
  }
  return { bestCallAnnualized: bestCall, bestPutAnnualized: bestPut };
}

export async function writeOptionsSummary(
  summary: OptionsSummary,
  parentDir: string,
): Promise<string> {
  await mkdir(parentDir, { recursive: true });
  const out = resolve(parentDir, "options-summary.json");
  await writeFile(out, JSON.stringify(summary, null, 2), "utf8");
  return out;
}

/**
 * Remove options JSON files for symbols no longer in the keep set.
 * Returns the number of files deleted. Silently ignores anything that
 * doesn't end in .json.
 */
export async function pruneStaleOptionsFiles(
  outDir: string,
  keepSymbols: Set<string>,
): Promise<{ deleted: string[] }> {
  const deleted: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return { deleted };
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const sym = name.slice(0, -".json".length).toUpperCase();
    if (keepSymbols.has(sym)) continue;
    await unlink(resolve(outDir, name));
    deleted.push(sym);
  }
  return { deleted };
}

export type ResolvedSubject = {
  symbol: string;
  company: CompanySnapshot;
  fairValue: FairValue | null;
};

/**
 * Convenience: walk a snapshot's companies and pair each with its
 * fair-value from a `RankedRow[]`-style lookup map. Useful in the ingest
 * path where ranking is already computed in-process.
 */
export function resolveSubjects(
  snapshot: Snapshot,
  fairValueBySymbol: Map<string, FairValue | null>,
): ResolvedSubject[] {
  return snapshot.companies.map((company) => ({
    symbol: company.symbol,
    company,
    fairValue: fairValueBySymbol.get(company.symbol) ?? null,
  }));
}
