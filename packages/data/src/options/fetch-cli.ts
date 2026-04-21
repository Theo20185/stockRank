import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "@stockrank/core";
import {
  fairValueFor,
  rank,
  type FairValue,
  type RankedSnapshot,
} from "@stockrank/ranking";
import { fetchSymbolOptions, writeOptionsView } from "./fetch-core.js";
import { YahooOptionsProvider } from "../yahoo/options-provider.js";

/**
 * Standalone per-symbol options fetch CLI for ad-hoc work. The nightly
 * ingest path (packages/data/src/ingest/cli.ts) now bakes options
 * fetching for the entire Ranked bucket — this CLI stays useful for
 * targeted refreshes outside the ingest cadence.
 *
 * Usage:
 *   npm run options:fetch -- DECK NVO INCY
 *   npm run options:fetch -- DECK --throttle 2000
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
  return JSON.parse(await readFile(path, "utf8")) as Snapshot;
}

function resolveFairValue(snapshot: Snapshot, symbol: string): FairValue | null {
  // Prefer pre-baked ranking when present; otherwise compute on the fly.
  const baked = snapshot.ranking as RankedSnapshot | undefined;
  if (baked) {
    const row = baked.rows.find((r) => r.symbol === symbol);
    if (row?.fairValue) return row.fairValue;
  }
  const company = snapshot.companies.find((c) => c.symbol === symbol);
  if (!company) return null;
  return fairValueFor(company, snapshot.companies);
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
  // Stamp pre-baked rankings into memory so resolveFairValue is fast.
  if (!snapshot.ranking) {
    const ranked = rank({ companies: snapshot.companies, snapshotDate: snapshot.snapshotDate });
    for (const row of ranked.rows) {
      const company = snapshot.companies.find((c) => c.symbol === row.symbol);
      if (company) row.fairValue = fairValueFor(company, snapshot.companies);
    }
    (snapshot as unknown as { ranking: RankedSnapshot }).ranking = ranked;
  }

  const provider = new YahooOptionsProvider();

  for (let i = 0; i < args.symbols.length; i += 1) {
    const symbol = args.symbols[i]!;
    const tag = `[${i + 1}/${args.symbols.length}]`;
    console.log(`${tag} ${symbol}`);
    try {
      const company = snapshot.companies.find((c) => c.symbol === symbol);
      if (!company) {
        console.error(`  skip — not in snapshot`);
        continue;
      }
      const fairValue = resolveFairValue(snapshot, symbol);
      if (!fairValue) {
        console.error(`  skip — no fair value`);
        continue;
      }
      const result = await fetchSymbolOptions(provider, { symbol, company, fairValue });
      if (result.status === "ok") {
        const path = await writeOptionsView(result.view, args.outDir);
        console.log(`  ok — ${result.view.expirations.length} expirations, ${result.callCount} calls, ${result.putCount} puts → ${path}`);
      } else {
        console.error(`  skip — ${result.reason}`);
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
