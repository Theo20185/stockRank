import { describe, it, expect } from "vitest";
import type { Portfolio } from "@stockrank/core";
import { EMPTY_PORTFOLIO } from "@stockrank/core";
import { loadPortfolio, savePortfolio, PORTFOLIO_STORAGE_KEY } from "./portfolio-loader.js";

function makeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    _data: data,
  };
}

describe("portfolio-loader (localStorage)", () => {
  it("returns EMPTY_PORTFOLIO when storage is null", () => {
    expect(loadPortfolio(null)).toBe(EMPTY_PORTFOLIO);
  });

  it("returns EMPTY_PORTFOLIO when key is unset", () => {
    expect(loadPortfolio(makeStorage())).toBe(EMPTY_PORTFOLIO);
  });

  it("returns EMPTY_PORTFOLIO when stored value is malformed JSON", () => {
    const storage = makeStorage({ [PORTFOLIO_STORAGE_KEY]: "not-json" });
    expect(loadPortfolio(storage)).toBe(EMPTY_PORTFOLIO);
  });

  it("returns empty portfolio (positions: []) when positions field is not an array", () => {
    // After v2 migration this returns {updatedAt, positions: []} rather
    // than the EMPTY_PORTFOLIO sentinel; the migrator preserves whatever
    // updatedAt was in the input.
    const storage = makeStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify({ updatedAt: "x", positions: "oops" }),
    });
    const result = loadPortfolio(storage);
    expect(result.positions).toEqual([]);
  });

  it("loads a valid v2 portfolio from storage", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "stock",
          id: "abc",
          symbol: "AAPL",
          entryDate: "2025-01-01",
          shares: 10,
          costBasis: 1500,
        },
      ],
    };
    const storage = makeStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify(portfolio),
    });
    const loaded = loadPortfolio(storage);
    expect(loaded.positions).toHaveLength(1);
    expect(loaded.positions[0]).toMatchObject({
      kind: "stock",
      symbol: "AAPL",
      shares: 10,
      costBasis: 1500,
    });
  });

  it("migrates v1 (legacy) portfolio shape on load", () => {
    const v1Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "AAPL", entryDate: "2025-01-01", entryPrice: 150, sharesOwned: 10 },
      ],
    };
    const storage = makeStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify(v1Portfolio),
    });
    const loaded = loadPortfolio(storage);
    expect(loaded.positions).toHaveLength(1);
    expect(loaded.positions[0]).toMatchObject({
      kind: "stock",
      symbol: "AAPL",
      shares: 10,
      costBasis: 1500, // 150 × 10
    });
  });

  it("savePortfolio round-trips through loadPortfolio", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "stock",
          id: "xyz",
          symbol: "MSFT",
          entryDate: "2024-06-01",
          shares: 5,
          costBasis: 2000,
        },
      ],
    };
    const storage = makeStorage();
    savePortfolio(portfolio, storage);
    const loaded = loadPortfolio(storage);
    expect(loaded.positions).toHaveLength(1);
    expect(loaded.positions[0]).toMatchObject({
      kind: "stock",
      id: "xyz",
      symbol: "MSFT",
      shares: 5,
      costBasis: 2000,
    });
  });

  it("savePortfolio is a no-op when storage is null", () => {
    expect(() => savePortfolio(EMPTY_PORTFOLIO, null)).not.toThrow();
  });
});
