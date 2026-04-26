import type { CompanySnapshot, Snapshot, SnapshotError } from "@stockrank/core";
import { SNAPSHOT_SCHEMA_VERSION } from "@stockrank/core";
import { rank, fairValueFor } from "@stockrank/ranking";
import type { MarketDataProvider } from "../provider.js";
import type { UniverseEntry } from "../universe/loader.js";

export type IngestOptions = {
  provider: MarketDataProvider;
  universe: UniverseEntry[];
  /** ISO date "YYYY-MM-DD" — the snapshot date. */
  snapshotDate: string;
  /** Milliseconds between symbol fetches. Default 250 (4 req/s). */
  throttleMs?: number;
  /** Per-symbol progress callback. */
  onProgress?: (state: ProgressState) => void;
  /** Sleep implementation (overridable in tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Today's date in ISO YYYY-MM-DD; used to compute the historical price window. */
  today?: string;
};

export type ProgressState = {
  index: number;
  total: number;
  symbol: string;
  status: "ok" | "error";
  message?: string;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function dateMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function ingest(options: IngestOptions): Promise<Snapshot> {
  const {
    provider,
    universe,
    snapshotDate,
    throttleMs = 250,
    onProgress,
    sleep = defaultSleep,
    today = snapshotDate,
  } = options;

  const companies: CompanySnapshot[] = [];
  const errors: SnapshotError[] = [];
  const reportError = (e: SnapshotError) => errors.push(e);

  const priceFrom = dateMinusDays(today, 365);
  const priceTo = today;

  for (let i = 0; i < universe.length; i += 1) {
    const entry = universe[i]!;
    const symbol = entry.symbol;

    if (i > 0 && throttleMs > 0) await sleep(throttleMs);

    try {
      const company = await provider.fetchCompany(
        symbol,
        { priceFrom, priceTo },
        reportError,
      );
      if (company) {
        companies.push(company);
        onProgress?.({ index: i, total: universe.length, symbol, status: "ok" });
      } else {
        onProgress?.({
          index: i,
          total: universe.length,
          symbol,
          status: "error",
          message: "skipped (essential data missing)",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ symbol, endpoint: "*", message });
      onProgress?.({
        index: i,
        total: universe.length,
        symbol,
        status: "error",
        message,
      });
    }
  }

  // Pre-bake the default-weights ranking + fair value so the UI is
  // useful on first load. Web app re-runs ranking in-browser when the
  // user changes weights.
  const ranked = rank({ companies, snapshotDate });
  for (const row of ranked.rows) {
    const company = companies.find((c) => c.symbol === row.symbol);
    if (company) row.fairValue = fairValueFor(company, companies);
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotDate,
    generatedAt: new Date().toISOString(),
    source: provider.name === "yahoo" ? "yahoo-finance" : "fmp-stable",
    universeName: "sp500",
    companies,
    errors,
    ranking: ranked,
  };
}
