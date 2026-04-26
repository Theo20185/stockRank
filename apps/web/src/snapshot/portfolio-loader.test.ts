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

  it("returns EMPTY_PORTFOLIO when positions field is not an array", () => {
    const storage = makeStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify({ updatedAt: "x", positions: "oops" }),
    });
    expect(loadPortfolio(storage)).toBe(EMPTY_PORTFOLIO);
  });

  it("loads a valid portfolio from storage", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "AAPL", entryDate: "2025-01-01", entryPrice: 150, sharesOwned: 10 },
      ],
    };
    const storage = makeStorage({
      [PORTFOLIO_STORAGE_KEY]: JSON.stringify(portfolio),
    });
    expect(loadPortfolio(storage)).toEqual(portfolio);
  });

  it("savePortfolio round-trips through loadPortfolio", () => {
    const portfolio: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { symbol: "MSFT", entryDate: "2024-06-01", entryPrice: 400, sharesOwned: 5 },
      ],
    };
    const storage = makeStorage();
    savePortfolio(portfolio, storage);
    expect(loadPortfolio(storage)).toEqual(portfolio);
  });

  it("savePortfolio is a no-op when storage is null", () => {
    expect(() => savePortfolio(EMPTY_PORTFOLIO, null)).not.toThrow();
  });
});
