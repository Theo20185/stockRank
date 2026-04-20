import { describe, it, expect, vi } from "vitest";
import type { CompanySnapshot, SnapshotError } from "@stockrank/core";
import type { MarketDataProvider } from "../provider.js";
import { ingest } from "./orchestrator.js";

function makeCompany(symbol: string): CompanySnapshot {
  return {
    symbol,
    name: `${symbol} Corp`,
    sector: "Industrials",
    industry: "Industrial Conglomerates",
    exchange: "NYSE",
    marketCap: 50_000_000_000,
    currency: "USD",
    quoteCurrency: "USD",
    quote: {
      price: 100,
      yearHigh: 120,
      yearLow: 80,
      volume: 0,
      averageVolume: 1_000_000,
    },
    ttm: {
      peRatio: 18,
      evToEbitda: 12,
      priceToFcf: 20,
      priceToBook: 3,
      dividendYield: 0.025,
      currentRatio: 1.25,
      netDebtToEbitda: 0.83,
      roic: 0.15,
      earningsYield: 0.055,
      fcfYield: 0.05,
      enterpriseValue: 50_000_000_000,
      investedCapital: 45_000_000_000,
    },
    annual: Array.from({ length: 5 }, (_, i) => ({
      fiscalYear: String(2025 - i),
      periodEndDate: `${2025 - i}-12-31`,
      filingDate: null,
      reportedCurrency: "USD",
      income: {
        revenue: 100_000_000_000,
        grossProfit: 40_000_000_000,
        operatingIncome: 10_000_000_000,
        ebit: 10_000_000_000,
        ebitda: 12_000_000_000,
        interestExpense: 500_000_000,
        netIncome: 8_000_000_000,
        epsDiluted: 8,
        sharesDiluted: 1_000_000_000,
      },
      balance: {
        cash: 5_000_000_000,
        totalCurrentAssets: 25_000_000_000,
        totalCurrentLiabilities: 20_000_000_000,
        totalDebt: 15_000_000_000,
        totalEquity: 30_000_000_000,
      },
      cashFlow: {
        operatingCashFlow: 11_000_000_000,
        capex: -3_000_000_000,
        freeCashFlow: 8_000_000_000,
        dividendsPaid: 2_000_000_000,
        buybacks: 1_000_000_000,
      },
      ratios: { roic: 0.15, netDebtToEbitda: 0.83, currentRatio: 1.25 },
    })),
    pctOffYearHigh: 16.7,
  };
}

type ProviderBehavior = (
  symbol: string,
  reportError: (e: SnapshotError) => void,
) => CompanySnapshot | null | Promise<CompanySnapshot | null>;

function makeProvider(behavior: ProviderBehavior = (s) => makeCompany(s)): MarketDataProvider {
  return {
    name: "fake",
    fetchCompany: vi.fn(async (symbol, _options, reportError) => {
      return behavior(symbol, reportError);
    }),
  };
}

describe("ingest orchestrator", () => {
  it("walks the universe and produces one CompanySnapshot per success", async () => {
    const provider = makeProvider();
    const snapshot = await ingest({
      provider,
      universe: [
        { symbol: "AAA", name: "AAA Corp" },
        { symbol: "BBB", name: "BBB Corp" },
      ],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
    });

    expect(snapshot.companies).toHaveLength(2);
    expect(snapshot.companies.map((c) => c.symbol)).toEqual(["AAA", "BBB"]);
    expect(snapshot.errors).toHaveLength(0);
    expect(snapshot.snapshotDate).toBe("2026-04-20");
    expect(snapshot.universeName).toBe("sp500");
  });

  it("skips a symbol when the provider returns null", async () => {
    const provider = makeProvider((s, reportError) => {
      if (s === "BAD") {
        reportError({ symbol: "BAD", endpoint: "profile", message: "404 not found" });
        return null;
      }
      return makeCompany(s);
    });
    const snapshot = await ingest({
      provider,
      universe: [
        { symbol: "OK1", name: "OK1" },
        { symbol: "BAD", name: "BAD" },
        { symbol: "OK2", name: "OK2" },
      ],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
    });

    expect(snapshot.companies.map((c) => c.symbol)).toEqual(["OK1", "OK2"]);
    expect(snapshot.errors).toEqual([
      expect.objectContaining({ symbol: "BAD", endpoint: "profile" }),
    ]);
  });

  it("captures provider-thrown exceptions in errors but keeps walking", async () => {
    const provider = makeProvider((s) => {
      if (s === "X") throw new Error("boom");
      return makeCompany(s);
    });
    const snapshot = await ingest({
      provider,
      universe: [
        { symbol: "A", name: "A" },
        { symbol: "X", name: "X" },
        { symbol: "B", name: "B" },
      ],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
    });

    expect(snapshot.companies.map((c) => c.symbol)).toEqual(["A", "B"]);
    expect(snapshot.errors).toEqual([
      expect.objectContaining({ symbol: "X", message: "boom" }),
    ]);
  });

  it("calls the throttle sleep between symbols (n-1 times)", async () => {
    const sleep = vi.fn(async () => {});
    await ingest({
      provider: makeProvider(),
      universe: [
        { symbol: "A", name: "A" },
        { symbol: "B", name: "B" },
        { symbol: "C", name: "C" },
      ],
      snapshotDate: "2026-04-20",
      throttleMs: 100,
      sleep,
    });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("computes a 365-day window for historical prices ending today and passes it to the provider", async () => {
    let captured: { from: string; to: string } | null = null;
    const provider: MarketDataProvider = {
      name: "fake",
      fetchCompany: vi.fn(async (symbol, options) => {
        captured = { from: options.priceFrom, to: options.priceTo };
        return makeCompany(symbol);
      }),
    };

    await ingest({
      provider,
      universe: [{ symbol: "X", name: "X" }],
      snapshotDate: "2026-04-20",
      today: "2026-04-20",
      throttleMs: 0,
    });

    expect(captured).toEqual({ from: "2025-04-20", to: "2026-04-20" });
  });

  it("emits progress callbacks for each symbol", async () => {
    const progress = vi.fn();
    await ingest({
      provider: makeProvider(),
      universe: [
        { symbol: "A", name: "A" },
        { symbol: "B", name: "B" },
      ],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
      onProgress: progress,
    });

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls[0]![0]).toMatchObject({
      index: 0,
      total: 2,
      symbol: "A",
      status: "ok",
    });
  });

  it("sets snapshot.source based on the provider name", async () => {
    const yahooProvider: MarketDataProvider = {
      name: "yahoo",
      fetchCompany: async (s) => makeCompany(s),
    };
    const fmpProvider: MarketDataProvider = {
      name: "fmp",
      fetchCompany: async (s) => makeCompany(s),
    };

    const yResult = await ingest({
      provider: yahooProvider,
      universe: [{ symbol: "A", name: "A" }],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
    });
    const fResult = await ingest({
      provider: fmpProvider,
      universe: [{ symbol: "A", name: "A" }],
      snapshotDate: "2026-04-20",
      throttleMs: 0,
    });

    expect(yResult.source).toBe("yahoo-finance");
    expect(fResult.source).toBe("fmp-stable");
  });
});
