import { describe, expect, it } from "vitest";
import type { CompanySnapshot, Snapshot } from "@stockrank/core";
import { appendTodaySample } from "./compute-fv-trend.js";

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
