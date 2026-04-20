import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "@stockrank/core";
import {
  buildOptionsView,
  type FairValue,
  type OptionsView,
  type RankedSnapshot,
} from "@stockrank/ranking";
import { selectExpirations } from "./expiration-selector.js";
import { YahooOptionsProvider } from "../yahoo/options-provider.js";

/**
 * Per-symbol options fetch CLI. Reads the latest pre-baked snapshot,
 * looks up the company's FairValue + spot price + dividend yield,
 * fetches the chain via Yahoo, builds the OptionsView and writes
 * one JSON file per symbol the web UI loads on demand.
 *
 * Usage:
 *   npm run options:fetch -- DECK NVO INCY
 *   npm run options:fetch -- DECK --throttle 2000
 *
 * Per docs/specs/options.md §6, this is on-demand only — never run
 * against the full universe.
 */

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
}

type ParsedArgs = {
  symbols: string[];
  outDir: string;
  snapshotPath: string;
  throttleMs: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const root = repoRoot();
  const args: ParsedArgs = {
    symbols: [],
    outDir: resolve(root, "public/data/options"),
    snapshotPath: resolve(root, "public/data/snapshot-latest.json"),
    throttleMs: 1500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--out") {
      if (!next) throw new Error("--out requires a path");
      args.outDir = resolve(next);
      i += 1;
    } else if (a === "--snapshot") {
      if (!next) throw new Error("--snapshot requires a path");
      args.snapshotPath = resolve(next);
      i += 1;
    } else if (a === "--throttle") {
      if (!next) throw new Error("--throttle requires ms");
      args.throttleMs = parseInt(next, 10);
      i += 1;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args.symbols.push(a.toUpperCase());
    }
  }
  return args;
}

async function loadSnapshotFile(path: string): Promise<Snapshot> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function findFairValueFor(snapshot: Snapshot, symbol: string): FairValue | null {
  const ranking = snapshot.ranking as RankedSnapshot | undefined;
  if (!ranking) return null;
  const row = ranking.rows.find((r) => r.symbol === symbol);
  return row?.fairValue ?? null;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function fetchSymbol(
  provider: YahooOptionsProvider,
  symbol: string,
  snapshot: Snapshot,
): Promise<OptionsView | null> {
  const company = snapshot.companies.find((c) => c.symbol === symbol);
  if (!company) {
    console.error(`  skip ${symbol}: not in snapshot`);
    return null;
  }
  const fairValue = findFairValueFor(snapshot, symbol);
  if (!fairValue || !fairValue.range) {
    console.error(`  skip ${symbol}: no fair-value range available`);
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const list = await provider.listExpirations(symbol);
  const selected = selectExpirations(today, list.expirationDates);
  if (selected.length === 0) {
    console.error(`  skip ${symbol}: no usable expirations in chain`);
    return null;
  }

  const groups: Array<{
    selected: { expiration: string; selectionReason: "leap" | "leap-fallback" | "quarterly" | "monthly" };
    group: Awaited<ReturnType<typeof provider.fetchExpirationGroup>>;
  }> = [];
  for (const sel of selected) {
    const group = await provider.fetchExpirationGroup(symbol, sel.expiration);
    groups.push({ selected: sel, group });
  }

  const dividendYield = company.ttm.dividendYield ?? 0;
  const annualDividendPerShare = (dividendYield ?? 0) * company.quote.price;

  return buildOptionsView({
    symbol,
    fetchedAt: list.fetchedAt,
    currentPrice: list.underlyingPrice || company.quote.price,
    annualDividendPerShare,
    fairValue,
    expirations: groups,
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.symbols.length === 0) {
    console.error("usage: options:fetch SYMBOL [SYMBOL...] [--throttle ms] [--out dir]");
    process.exit(1);
  }

  console.log(`stockRank options:fetch — ${args.symbols.length} symbols`);
  console.log(`snapshot:  ${args.snapshotPath}`);
  console.log(`output:    ${args.outDir}`);
  console.log(`throttle:  ${args.throttleMs}ms\n`);

  const snapshot = await loadSnapshotFile(args.snapshotPath);
  await mkdir(args.outDir, { recursive: true });
  const provider = new YahooOptionsProvider();

  for (let i = 0; i < args.symbols.length; i += 1) {
    const symbol = args.symbols[i]!;
    const tag = `[${i + 1}/${args.symbols.length}]`;
    console.log(`${tag} ${symbol}`);
    try {
      const view = await fetchSymbol(provider, symbol, snapshot);
      if (view) {
        const out = resolve(args.outDir, `${symbol}.json`);
        await writeFile(out, JSON.stringify(view, null, 2), "utf8");
        const callCount = view.expirations.reduce((s, e) => s + e.coveredCalls.length, 0);
        const putCount = view.expirations.reduce((s, e) => s + e.puts.length, 0);
        console.log(`  ok — ${view.expirations.length} expirations, ${callCount} calls, ${putCount} puts → ${out}`);
      }
    } catch (err) {
      console.error(`  FAIL ${symbol}:`, err instanceof Error ? err.message : err);
    }
    if (i < args.symbols.length - 1 && args.throttleMs > 0) {
      await sleep(args.throttleMs);
    }
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
