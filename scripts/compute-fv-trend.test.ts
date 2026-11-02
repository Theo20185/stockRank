import { describe, expect, it } from "vitest";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import type {
  EdgarCompanyFacts,
  EdgarFact,
  SplitEvent,
  SymbolProfile,
} from "@stockrank/data";
import { appendTodaySample, synthesizeUniverseAt } from "./compute-fv-trend.js";

function makeCompany(symbol: string, price: number): CompanySnapshot {
  return {
    symbol,
    name: `${symbol} Inc.`,
    sector: "Technology",
    industry: "Software",
    exchange: "NMS",
    marketCap: price * 1_000_000_000,
    currency: "USD",
    quoteCurrency: "USD",
    quote: { price, yearHigh: price * 1.5, yearLow: price * 0.7, volume: 0, averageVolume: 0 },
    ttm: {
      peRatio: 20,
      evToEbitda: 15,
      priceToFcf: 25,
      priceToBook: 4,
      dividendYield: 0.02,
      currentRatio: null,
      netDebtToEbitda: 1,
      roic: 0.2,
      earningsYield: 0.05,
      fcfYield: 0.04,
      enterpriseValue: price * 1_000_000_000 * 1.1,
      investedCapital: price * 1_000_000_000 * 0.8,
      forwardEps: 5,
    },
    annual: [],
    quarterly: [],
    pctOffYearHigh: 0,
  };
}

function makeSnapshot(date: string, companies: CompanySnapshot[]): Snapshot {
  return {
    schemaVersion: 1,
    snapshotDate: date,
    generatedAt: `${date}T00:00:00.000Z`,
    source: "yahoo-finance",
    universeName: "sp500",
    companies,
    errors: [],
  };
}

describe("appendTodaySample", () => {
  it("adds exactly one sample per symbol from the given snapshot", () => {
    const series = new Map<string, typeof sampleSeed>();
    const sampleSeed: Array<{
      date: string;
      price: number;
      fvP25: number | null;
      fvMedian: number | null;
      fvP75: number | null;
    }> = [];
    const archive = {
      date: "2026-04-23",
      snapshot: makeSnapshot("2026-04-23", [
        makeCompany("AAA", 100),
        makeCompany("BBB", 200),
      ]),
    };

    appendTodaySample(series, archive);

    expect(series.size).toBe(2);
    expect(series.get("AAA")!.length).toBe(1);
    expect(series.get("BBB")!.length).toBe(1);
    expect(series.get("AAA")![0]!.date).toBe("2026-04-23");
    expect(series.get("AAA")![0]!.price).toBe(100);
  });

  it("replaces any existing same-date sample (archive supersedes reconstruction on overlap)", () => {
    const series = new Map<
      string,
      Array<{ date: string; price: number; fvP25: number | null; fvMedian: number | null; fvP75: number | null }>
    >();
    // Pre-seed: historical reconstruction produced a 2026-03-31
    // sample AND (for some reason) a 2026-04-23 sample. The
    // 2026-04-23 archive sample should win.
    series.set("AAA", [
      { date: "2026-03-31", price: 90, fvP25: 85, fvMedian: 88, fvP75: 91 },
      { date: "2026-04-23", price: 99, fvP25: 70, fvMedian: 75, fvP75: 80 },
    ]);
    const archive = {
      date: "2026-04-23",
      snapshot: makeSnapshot("2026-04-23", [makeCompany("AAA", 100)]),
    };

    appendTodaySample(series, archive);

    const samples = series.get("AAA")!;
    expect(samples.length).toBe(2); // reconstruction + today, not 3
    expect(samples[0]!.date).toBe("2026-03-31");
    expect(samples[1]!.date).toBe("2026-04-23");
    expect(samples[1]!.price).toBe(100); // archive price, not the preseed 99
  });

  it("preserves newer historical samples (sort is ascending by date)", () => {
    const series = new Map<
      string,
      Array<{ date: string; price: number; fvP25: number | null; fvMedian: number | null; fvP75: number | null }>
    >();
    series.set("AAA", [
      { date: "2024-06-30", price: 80, fvP25: 75, fvMedian: 78, fvP75: 82 },
      { date: "2026-03-31", price: 95, fvP25: 90, fvMedian: 93, fvP75: 96 },
    ]);
    const archive = {
      date: "2026-04-23",
      snapshot: makeSnapshot("2026-04-23", [makeCompany("AAA", 100)]),
    };

    appendTodaySample(series, archive);

    const dates = series.get("AAA")!.map((s) => s.date);
    expect(dates).toEqual(["2024-06-30", "2026-03-31", "2026-04-23"]);
  });
});

// ---- split rebasing in the historical reconstruction ----
//
// The DECK Dec-'24 case (2026-11-02): reconstruction prices are
// split-adjusted bars, but without split events the pre-split
// per-share EDGAR facts stay on their as-filed basis — own-historical
// multiples read ~ratio× small, normalized EPS ~ratio× big, and the
// reconstructed p25 tail collapses ($35 vs a $107 median). The split
// events must flow from the chart-cache sidecar into
// synthesizeSnapshotAt exactly as production ingest and backtest-ic
// pass them.
describe("synthesizeUniverseAt — split rebasing", () => {
  function fyFact(end: string, val: number, filed: string): EdgarFact {
    const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
    const start = new Date(endMs - 365 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      end,
      start,
      val,
      fy: parseInt(end.slice(0, 4), 10),
      fp: "FY",
      form: "10-K",
      filed,
    };
  }

  // One fiscal year (end 2024-12-31), filed 2025-02-15 — BEFORE the
  // 2025-06-01 6:1 split, so its per-share facts are on the pre-split
  // basis and need rebasing (÷6).
  function facts(): EdgarCompanyFacts {
    return {
      cik: 999,
      entityName: "Split Corp",
      facts: {
        "us-gaap": {
          NetIncomeLoss: {
            units: { USD: [fyFact("2024-12-31", 9_000_000_000, "2025-02-15")] },
          },
          EarningsPerShareDiluted: {
            units: { "USD/shares": [fyFact("2024-12-31", 60, "2025-02-15")] },
          },
          WeightedAverageNumberOfDilutedSharesOutstanding: {
            units: { shares: [fyFact("2024-12-31", 150_000_000, "2025-02-15")] },
          },
        },
      },
    };
  }

  const profile: SymbolProfile = {
    symbol: "SPLT",
    name: "Split Corp",
    sector: "Technology",
    industry: "Software",
    exchange: "NMS",
    currency: "USD",
    authoritativeShares: 900_000_000,
  };
  const bars = [{ date: "2025-11-28", close: 100, high: null, low: null }];
  const SPLITS: SplitEvent[] = [{ date: "2025-06-01", ratio: 6 }];

  function universeAt(splits: Map<string, SplitEvent[]>) {
    return synthesizeUniverseAt(
      "2025-12-31",
      new Map([["SPLT", profile]]),
      new Map([["SPLT", facts()]]),
      new Map([["SPLT", bars]]),
      splits,
    );
  }

  it("rebases pre-split per-share facts when the splits map has the symbol", () => {
    const universe = universeAt(new Map([["SPLT", SPLITS]]));
    expect(universe).toHaveLength(1);
    expect(universe[0]!.annual[0]!.income.epsDiluted).toBeCloseTo(10, 6);
    expect(universe[0]!.annual[0]!.income.sharesDiluted).toBeCloseTo(
      900_000_000,
      -3,
    );
  });

  it("leaves per-share facts as filed when the symbol has no splits entry (legacy cache)", () => {
    const universe = universeAt(new Map());
    expect(universe).toHaveLength(1);
    expect(universe[0]!.annual[0]!.income.epsDiluted).toBe(60);
  });
});
