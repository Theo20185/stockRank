import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { FmpClient } from "../fmp/client.js";
import { FmpProvider } from "../fmp/provider.js";
import { YahooProvider } from "../yahoo/provider.js";
import type { MarketDataProvider } from "../provider.js";
import { loadSp500Universe } from "../universe/loader.js";
import type { UniverseEntry } from "../universe/loader.js";
import { ingest } from "./orchestrator.js";
import { writeSnapshot } from "../snapshot/writer.js";
import {
  bucketRows,
  fairValueFor,
  rank,
} from "@stockrank/ranking";
import { YahooOptionsProvider } from "../yahoo/options-provider.js";
import {
  bestStaticReturns,
  fetchSymbolOptions,
  indexFvTrend,
  pruneStaleOptionsFiles,
  writeOptionsSummary,
  writeOptionsView,
} from "../options/fetch-core.js";
import type { FvTrendArtifact, OptionsBestReturns } from "@stockrank/core";
import { readFile } from "node:fs/promises";

type ProviderName = "yahoo" | "fmp";

type ParsedArgs = {
  limit: number | null;
  symbols: string[] | null;
  outDir: string;
  throttleMs: number;
  provider: ProviderName;
  fetchOptions: boolean;
  optionsThrottleMs: number;
  optionsOutDir: string;
};

function repoRoot(): string {
  // packages/data/src/ingest/cli.ts → up 5 levels → repo root
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

function parseArgs(argv: string[]): ParsedArgs {
  const root = repoRoot();
  const args: ParsedArgs = {
    limit: null,
    symbols: null,
    outDir: resolve(root, "public/data"),
    throttleMs: 250,
    provider: "yahoo",
    fetchOptions: true,
    optionsThrottleMs: 1500,
    optionsOutDir: resolve(root, "public/data/options"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    switch (a) {
      case "--limit":
        if (!next) throw new Error("--limit requires a number");
        args.limit = parseInt(next, 10);
        i += 1;
        break;
      case "--symbols":
        if (!next) throw new Error("--symbols requires a comma-separated list");
        args.symbols = next.split(",").map((s) => s.trim().toUpperCase());
        i += 1;
        break;
      case "--out":
        if (!next) throw new Error("--out requires a path");
        args.outDir = resolve(next);
        args.optionsOutDir = resolve(next, "options");
        i += 1;
        break;
      case "--throttle":
        if (!next) throw new Error("--throttle requires ms");
        args.throttleMs = parseInt(next, 10);
        i += 1;
        break;
      case "--provider":
        if (!next || (next !== "yahoo" && next !== "fmp")) {
          throw new Error("--provider must be 'yahoo' or 'fmp'");
        }
        args.provider = next;
        i += 1;
        break;
      case "--no-options":
        args.fetchOptions = false;
        break;
      case "--options-throttle":
        if (!next) throw new Error("--options-throttle requires ms");
        args.optionsThrottleMs = parseInt(next, 10);
        i += 1;
        break;
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildProvider(name: ProviderName): MarketDataProvider {
  if (name === "yahoo") {
    return new YahooProvider();
  }
  loadDotenv({ path: resolve(repoRoot(), ".env") });
  const apiKey = process.env["FMP_API_KEY"];
  if (!apiKey) {
    console.error("error: FMP_API_KEY not set in .env or environment");
    process.exit(1);
  }
  return new FmpProvider(new FmpClient({ apiKey }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allSymbols = await loadSp500Universe();

  let universe: UniverseEntry[];
  if (args.symbols) {
    const symbolSet = new Set(args.symbols);
    universe = allSymbols.filter((e) => symbolSet.has(e.symbol));
    const missing = args.symbols.filter(
      (s) => !allSymbols.some((e) => e.symbol === s),
    );
    if (missing.length > 0) {
      for (const sym of missing) universe.push({ symbol: sym, name: sym });
    }
  } else if (args.limit !== null) {
    universe = allSymbols.slice(0, args.limit);
  } else {
    universe = allSymbols;
  }

  if (universe.length === 0) {
    console.error("error: empty universe — nothing to ingest");
    process.exit(1);
  }

  const date = todayIso();
  console.log(
    `stockRank ingest — ${universe.length} symbols, snapshot ${date}, provider ${args.provider}`,
  );
  console.log(`output dir: ${args.outDir}`);
  console.log(`throttle:   ${args.throttleMs}ms`);
  console.log("");

  const provider = buildProvider(args.provider);

  const snapshot = await ingest({
    provider,
    universe,
    snapshotDate: date,
    throttleMs: args.throttleMs,
    onProgress: ({ index, total, symbol, status, message }) => {
      const idx = String(index + 1).padStart(String(total).length);
      const tag = status === "ok" ? "  ok" : "FAIL";
      const detail = message ? ` — ${message}` : "";
      console.log(`[${idx}/${total}] ${tag} ${symbol}${detail}`);
    },
  });

  if (snapshot.companies.length === 0) {
    console.error("");
    console.error(
      `error: snapshot is empty (${snapshot.errors.length} errors) — refusing to overwrite existing snapshot`,
    );
    process.exit(1);
  }

  const result = await writeSnapshot(snapshot, args.outDir);

  console.log("");
  console.log(`done — ${snapshot.companies.length} companies, ${snapshot.errors.length} errors`);
  console.log(`wrote: ${result.datedPath}`);
  console.log(`wrote: ${result.latestPath}`);

  if (args.fetchOptions) {
    await runOptionsFetch(snapshot, args.optionsOutDir, args.optionsThrottleMs);
  }
}

/**
 * Best-effort load of the existing fv-trend artifact. Returns null
 * when the file doesn't exist yet (first run, before scripts/
 * compute-fv-trend.ts has produced an output) or when it's
 * unparseable. Projection lookup tolerates the null — symbols
 * without an entry simply get `projection: null` on their views.
 */
async function loadFvTrendArtifact(): Promise<FvTrendArtifact | null> {
  const path = resolve(repoRoot(), "public/data/fv-trend.json");
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as FvTrendArtifact;
  } catch {
    return null;
  }
}

async function runOptionsFetch(
  snapshot: Awaited<ReturnType<typeof ingest>>,
  outDir: string,
  throttleMs: number,
): Promise<void> {
  console.log("");
  console.log("options:fetch — Ranked bucket only");

  const ranked = rank({
    companies: snapshot.companies,
    snapshotDate: snapshot.snapshotDate,
  });
  for (const row of ranked.rows) {
    const company = snapshot.companies.find((c) => c.symbol === row.symbol);
    if (company) row.fairValue = fairValueFor(company, snapshot.companies);
  }
  const buckets = bucketRows(ranked.rows);
  console.log(
    `buckets: ranked=${buckets.ranked.length} watch=${buckets.watch.length} avoid=${buckets.avoid.length}`,
  );

  if (buckets.ranked.length === 0) {
    console.log("no ranked names — skipping options fetch");
    return;
  }

  const provider = new YahooOptionsProvider();
  const today = snapshot.snapshotDate;
  // Load the existing fv-trend artifact if present — used to project
  // FV / price forward at each option expiration. The artifact is
  // refreshed AFTER this step in the orchestrator, so we're reading
  // yesterday's data here. That's fine: the regression slope is
  // computed over 2 years of quarterly samples — one day stale
  // doesn't shift it meaningfully.
  const fvTrendBySymbol = indexFvTrend(await loadFvTrendArtifact());
  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const bestBySymbol: Record<string, OptionsBestReturns> = {};

  for (let i = 0; i < buckets.ranked.length; i += 1) {
    const row = buckets.ranked[i]!;
    const tag = `[${i + 1}/${buckets.ranked.length}]`;
    const company = snapshot.companies.find((c) => c.symbol === row.symbol);
    if (!company || !row.fairValue) {
      console.log(`${tag} skip ${row.symbol} — missing company or fair value`);
      skipCount += 1;
      continue;
    }
    try {
      const result = await fetchSymbolOptions(
        provider,
        {
          symbol: row.symbol,
          company,
          fairValue: row.fairValue,
          fvTrendEntry: fvTrendBySymbol.get(row.symbol),
        },
        today,
      );
      if (result.status === "ok") {
        await writeOptionsView(result.view, outDir);
        bestBySymbol[row.symbol] = bestStaticReturns(result.view);
        console.log(
          `${tag}   ok ${row.symbol} — ${result.view.expirations.length} exp, ${result.callCount}c/${result.putCount}p`,
        );
        okCount += 1;
      } else {
        console.log(`${tag} skip ${row.symbol} — ${result.reason}`);
        skipCount += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} FAIL ${row.symbol} — ${msg}`);
      failCount += 1;
    }
    if (i < buckets.ranked.length - 1 && throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  // Drop any leftover options files for stocks that fell out of Ranked.
  const keep = new Set(buckets.ranked.map((r) => r.symbol));
  const pruned = await pruneStaleOptionsFiles(outDir, keep);
  if (pruned.deleted.length > 0) {
    console.log(`pruned ${pruned.deleted.length} stale options file(s): ${pruned.deleted.join(", ")}`);
  }

  // Roll best-static-return numbers into a single summary file the web
  // UI consumes alongside the snapshot.
  const summaryPath = await writeOptionsSummary(
    {
      snapshotDate: snapshot.snapshotDate,
      generatedAt: new Date().toISOString(),
      symbols: bestBySymbol,
    },
    resolve(outDir, ".."),
  );
  console.log(`wrote: ${summaryPath}`);

  console.log("");
  console.log(`options done — ${okCount} ok, ${skipCount} skipped, ${failCount} failed`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
