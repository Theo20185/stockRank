import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { CompanySnapshot } from "@stockrank/core";
import type { FairValue } from "@stockrank/ranking";
import {
  fetchSymbolOptions,
  pruneStaleOptionsFiles,
  writeOptionsView,
} from "./fetch-core.js";
import type { OptionsProvider } from "./types.js";

function makeCompany(symbol: string): CompanySnapshot {
  return {
    symbol,
    name: `${symbol} Corp`,
    sector: "Industrials",
    industry: "Test Industry",
    exchange: "NYSE",
    marketCap: 10_000_000_000,
    currency: "USD",
    quoteCurrency: "USD",
    quote: { price: 100, yearHigh: 120, yearLow: 80, volume: 0, averageVolume: 1_000_000 },
    ttm: {
      peRatio: 15, evToEbitda: 10, priceToFcf: 18, priceToBook: 3,
      dividendYield: 0.02, currentRatio: 2, netDebtToEbitda: 1, roic: 0.15,
      earningsYield: 0.066, fcfYield: 0.055, enterpriseValue: 11_000_000_000,
      investedCapital: 8_000_000_000, forwardEps: 7,
    },
    annual: [],
    pctOffYearHigh: 16.7,
  };
}

function makeFairValue(): FairValue {
  return {
    peerSet: "cohort", peerCount: 8,
    anchors: {
      peerMedianPE: 100, peerMedianEVEBITDA: 100, peerMedianPFCF: 100,
      ownHistoricalPE: 100, ownHistoricalEVEBITDA: 100, ownHistoricalPFCF: 100,
      normalizedPE: 100, normalizedEVEBITDA: 100, normalizedPFCF: 100,
    },
    range: { p25: 95, median: 110, p75: 130 },
    current: 90, upsideToMedianPct: 22, confidence: "high", ttmTreatment: "ttm",
  };
}

function makeProvider(): OptionsProvider {
  return {
    name: "fake",
    listExpirations: vi.fn(async (symbol: string) => ({
      // Above p25=95 so puts aren't suppressed by §3.2.
      symbol, fetchedAt: "2026-04-20T00:00:00.000Z", underlyingPrice: 100,
      expirationDates: ["2027-01-15", "2028-01-21"],
    })),
    fetchExpirationGroup: vi.fn(async (_symbol: string, expiration: string) => ({
      expiration,
      calls: [{
        contractSymbol: `T${expiration}C`, expiration, daysToExpiry: 270,
        strike: 110, bid: 5, ask: 5.1, lastPrice: 5, volume: 10, openInterest: 100,
        impliedVolatility: 0.3, inTheMoney: false,
      }],
      puts: [{
        contractSymbol: `T${expiration}P`, expiration, daysToExpiry: 270,
        strike: 95, bid: 4, ask: 4.1, lastPrice: 4, volume: 10, openInterest: 100,
        impliedVolatility: 0.3, inTheMoney: false,
      }],
    })),
  };
}

describe("fetchSymbolOptions", () => {
  it("returns ok with view + counts when chain is healthy", async () => {
    const provider = makeProvider();
    const result = await fetchSymbolOptions(
      provider,
      { symbol: "TEST", company: makeCompany("TEST"), fairValue: makeFairValue() },
      "2026-04-20",
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.view.symbol).toBe("TEST");
      expect(result.view.expirations).toHaveLength(2);
      expect(result.callCount).toBeGreaterThan(0);
      expect(result.putCount).toBeGreaterThan(0);
    }
  });

  it("skips when fair-value range is null", async () => {
    const fv = { ...makeFairValue(), range: null };
    const result = await fetchSymbolOptions(
      makeProvider(),
      { symbol: "TEST", company: makeCompany("TEST"), fairValue: fv },
      "2026-04-20",
    );
    expect(result.status).toBe("skipped");
  });

  it("skips when chain has no usable expirations after the today filter", async () => {
    const provider: OptionsProvider = {
      name: "fake",
      listExpirations: vi.fn(async (symbol: string) => ({
        symbol, fetchedAt: "2026-04-20T00:00:00.000Z", underlyingPrice: 90,
        expirationDates: ["2025-01-17"],  // in the past
      })),
      fetchExpirationGroup: vi.fn(),
    };
    const result = await fetchSymbolOptions(
      provider,
      { symbol: "TEST", company: makeCompany("TEST"), fairValue: makeFairValue() },
      "2026-04-20",
    );
    expect(result.status).toBe("skipped");
  });
});

describe("pruneStaleOptionsFiles", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(resolve(tmpdir(), "stockrank-prune-"));
  });

  it("deletes JSON files for symbols not in the keep set, leaves others alone", async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(resolve(tmp, "DECK.json"), "{}", "utf8");
    await writeFile(resolve(tmp, "BKNG.json"), "{}", "utf8");
    await writeFile(resolve(tmp, "INCY.json"), "{}", "utf8");
    await writeFile(resolve(tmp, "notes.txt"), "ignore me", "utf8");  // not .json

    const result = await pruneStaleOptionsFiles(tmp, new Set(["DECK", "INCY"]));

    expect(result.deleted.sort()).toEqual(["BKNG"]);
    const remaining = (await readdir(tmp)).sort();
    expect(remaining).toEqual(["DECK.json", "INCY.json", "notes.txt"]);
  });

  it("returns empty deleted list when the dir doesn't exist", async () => {
    const result = await pruneStaleOptionsFiles(resolve(tmp, "missing"), new Set());
    expect(result.deleted).toEqual([]);
  });
});

describe("writeOptionsView", () => {
  it("writes a JSON file at outDir/SYMBOL.json", async () => {
    const tmp = await mkdtemp(resolve(tmpdir(), "stockrank-write-"));
    const view = {
      symbol: "DECK",
      fetchedAt: "2026-04-20T00:00:00.000Z",
      currentPrice: 100,
      expirations: [],
    };
    const path = await writeOptionsView(view, tmp);
    expect(path.endsWith("DECK.json")).toBe(true);
  });
});
