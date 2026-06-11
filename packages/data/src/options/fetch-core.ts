import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";

const gzipAsync = promisify(gzip);
import type {
  CompanySnapshot,
  FvTrendArtifact,
  FvTrendEntry,
  OptionsBestReturns,
  OptionsSummary,
  Snapshot,
} from "@stockrank/core";
import {
  buildOptionsView,
  projectFromQuarterlySamples,
  type ExpirationProjection,
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
  /**
   * Optional per-symbol historical trend entry. When supplied,
   * `fetchSymbolOptions` computes a forward projection of FV anchors +
   * price for each selected expiration and attaches it to the
   * `ExpirationView`. UI uses this to surface "projected FV / price
   * at expiry". When omitted, projections are absent (`null`).
   */
  fvTrendEntry?: FvTrendEntry;
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
  const { symbol, company, fairValue, fvTrendEntry } = input;
  if (!fairValue.range) {
    return { status: "skipped", reason: "no fair-value range" };
  }

  const list = await provider.listExpirations(symbol);
  const selected = selectExpirations(today, list.expirationDates);
  if (selected.length === 0) {
    return { status: "skipped", reason: "no usable expirations in chain" };
  }

  const groups: Array<{
    selected: { expiration: string; selectionReason: "monthly" | "yearly" };
    group: import("./types.js").ExpirationGroup;
    projection: ExpirationProjection | null;
  }> = [];
  for (const sel of selected) {
    const group = await provider.fetchExpirationGroup(symbol, sel.expiration);
    const projection = projectionForExpiration(fvTrendEntry, sel.expiration, today);
    groups.push({ selected: sel, group, projection });
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

export type OptionsArchivePayload = {
  /** Snapshot date the fetch ran against (file is named after this). */
  snapshotDate: string;
  /** ISO timestamp of the archive write. */
  generatedAt: string;
  /** Every per-symbol view written during the full Ranked-bucket fetch. */
  views: OptionsView[];
};

/**
 * Dated chain archive — docs/specs/options.md §6. One gzipped,
 * minified file per day at `<archiveRoot>/<snapshotDate>.json.gz`,
 * never pruned. Synthetic-premium backtests can only rank
 * configurations relative to each other; the archived real
 * bids/asks/IV are what a future real-premium backtest needs to
 * measure absolute alpha. Same-day re-runs overwrite (last full
 * fetch of the day wins).
 */
export async function writeOptionsArchive(
  payload: OptionsArchivePayload,
  archiveRoot: string,
): Promise<string> {
  await mkdir(archiveRoot, { recursive: true });
  const out = resolve(archiveRoot, `${payload.snapshotDate}.json.gz`);
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload), "utf8"));
  await writeFile(out, compressed);
  return out;
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

/**
 * Compose an `ExpirationProjection` from a symbol's quarterly FV
 * trend samples by projecting fvP25 / fvMedian / fvP75 / price out
 * to the expiration date. Returns null when not enough samples are
 * available (the projection module returns null when fewer than 4
 * valid samples remain after null-filtering).
 *
 * Confidence buckets:
 *   high   — R² ≥ 0.5  (strong linear signal)
 *   medium — R² ≥ 0.25 (some signal, treat with care)
 *   weak   — R² < 0.25 (noisy, projection unreliable)
 */
export function projectionForExpiration(
  trendEntry: FvTrendEntry | undefined,
  expirationDate: string,
  today: string,
): ExpirationProjection | null {
  if (!trendEntry || trendEntry.quarterly.length === 0) return null;
  const samples = trendEntry.quarterly;
  const fvP25 = projectFromQuarterlySamples(samples, {
    field: "fvP25", targetDate: expirationDate, today,
  });
  const fvMedian = projectFromQuarterlySamples(samples, {
    field: "fvMedian", targetDate: expirationDate, today,
  });
  const fvP75 = projectFromQuarterlySamples(samples, {
    field: "fvP75", targetDate: expirationDate, today,
  });
  const price = projectFromQuarterlySamples(samples, {
    field: "price", targetDate: expirationDate, today,
  });
  // All four are required — partial projection is more confusing
  // than no projection at all on the UI.
  if (!fvP25 || !fvMedian || !fvP75 || !price) return null;
  return {
    daysAhead: fvMedian.daysAhead,
    fvP25: fvP25.projectedValue,
    fvMedian: fvMedian.projectedValue,
    fvP75: fvP75.projectedValue,
    price: price.projectedValue,
    fvSlopePctPerYear: fvMedian.slopePctPerYear,
    priceSlopePctPerYear: price.slopePctPerYear,
    fvRSquared: fvMedian.rSquared,
    priceRSquared: price.rSquared,
    fvConfidence: fvMedian.confidence,
    priceConfidence: price.confidence,
    fvCapped: fvP25.capped || fvMedian.capped || fvP75.capped,
    priceCapped: price.capped,
    // Fallback flag fires when ANY of the three FV-anchor projections
    // had to use a non-default window. The window size we surface is
    // the median one (fvMedian) since that's what drives the
    // displayed confidence.
    fvFallback: fvP25.fallback || fvMedian.fallback || fvP75.fallback,
    priceFallback: price.fallback,
    fvWindowSize: fvMedian.windowSize,
    priceWindowSize: price.windowSize,
  };
}

/**
 * Build a `Map<symbol, FvTrendEntry>` from the loaded fv-trend
 * artifact. Convenience for the caller that needs to look up by
 * symbol at fetch time.
 */
export function indexFvTrend(
  artifact: FvTrendArtifact | null,
): Map<string, FvTrendEntry> {
  const out = new Map<string, FvTrendEntry>();
  if (!artifact) return out;
  for (const [sym, entry] of Object.entries(artifact.symbols)) {
    out.set(sym, entry);
  }
  return out;
}
