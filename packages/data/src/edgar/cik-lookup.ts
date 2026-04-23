import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOOKUP_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./cik-lookup.json",
);

let cache: Record<string, number> | null = null;

async function loadLookup(): Promise<Record<string, number>> {
  if (cache) return cache;
  const raw = await readFile(LOOKUP_PATH, "utf8");
  cache = JSON.parse(raw) as Record<string, number>;
  return cache;
}

/** Resolve a ticker to a CIK. Returns null if the ticker isn't in
 * the baked S&P 500 mapping. */
export async function cikFor(symbol: string): Promise<number | null> {
  const lookup = await loadLookup();
  const cik = lookup[symbol];
  return cik !== undefined ? cik : null;
}

/** 10-digit zero-padded CIK string for use in the EDGAR URL. */
export function formatCik(cik: number): string {
  return `CIK${String(cik).padStart(10, "0")}`;
}

/** Reset the in-memory cache. Tests use this to avoid leakage. */
export function _resetLookupCache(): void {
  cache = null;
}
