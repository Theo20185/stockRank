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

type ProviderName = "yahoo" | "fmp";

type ParsedArgs = {
  limit: number | null;
  symbols: string[] | null;
  outDir: string;
  throttleMs: number;
  provider: ProviderName;
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
      default:
        if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

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
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
