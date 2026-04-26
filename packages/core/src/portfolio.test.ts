import { describe, it, expect } from "vitest";
import {
  EMPTY_PORTFOLIO,
  isCashPosition,
  isOptionPosition,
  isStockPosition,
  migratePortfolio,
  newPositionId,
  type Portfolio,
} from "./portfolio.js";

describe("Position type guards", () => {
  it("isStockPosition narrows correctly", () => {
    expect(
      isStockPosition({
        kind: "stock",
        id: "x",
        symbol: "AAPL",
        entryDate: "2025-01-01",
        shares: 10,
        costBasis: 1500,
      }),
    ).toBe(true);
  });

  it("isOptionPosition narrows correctly", () => {
    expect(
      isOptionPosition({
        kind: "option",
        id: "x",
        symbol: "AAPL",
        optionType: "call",
        contracts: -1,
        strike: 200,
        expiration: "2026-06-19",
        entryDate: "2026-01-15",
        premium: 350,
      }),
    ).toBe(true);
  });

  it("isCashPosition narrows correctly", () => {
    expect(
      isCashPosition({
        kind: "cash",
        id: "x",
        symbol: "SPAXX",
        entryDate: "2026-01-01",
        amount: 5000,
        yieldPct: 4.85,
      }),
    ).toBe(true);
  });
});

describe("newPositionId", () => {
  it("generates a non-empty string", () => {
    expect(newPositionId().length).toBeGreaterThan(0);
  });

  it("generates unique ids across rapid calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(newPositionId());
    expect(ids.size).toBe(100);
  });
});

describe("migratePortfolio", () => {
  it("returns EMPTY_PORTFOLIO for non-object input", () => {
    expect(migratePortfolio(null)).toBe(EMPTY_PORTFOLIO);
    expect(migratePortfolio("string")).toBe(EMPTY_PORTFOLIO);
    expect(migratePortfolio(42)).toBe(EMPTY_PORTFOLIO);
  });

  it("preserves valid v2 portfolios verbatim (only minting missing ids)", () => {
    const p: Portfolio = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "stock",
          id: "abc",
          symbol: "MSFT",
          entryDate: "2025-06-01",
          shares: 5,
          costBasis: 2000,
        },
      ],
    };
    const result = migratePortfolio(p);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      kind: "stock",
      symbol: "MSFT",
      shares: 5,
      costBasis: 2000,
    });
  });

  it("migrates v1 stock-only positions to StockPosition shape", () => {
    const v1 = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          symbol: "AAPL",
          entryDate: "2025-01-01",
          entryPrice: 150,
          sharesOwned: 10,
        },
      ],
    };
    const result = migratePortfolio(v1);
    expect(result.positions).toHaveLength(1);
    const p = result.positions[0]!;
    expect(p.kind).toBe("stock");
    expect(p.id).toMatch(/.+/);
    if (isStockPosition(p)) {
      expect(p.symbol).toBe("AAPL");
      expect(p.shares).toBe(10);
      expect(p.costBasis).toBe(1500); // 150 * 10
      expect(p.entryDate).toBe("2025-01-01");
    }
  });

  it("mints id for v2 positions that lack one (hand-edited JSON)", () => {
    const raw = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "stock",
          symbol: "MSFT",
          entryDate: "2025-06-01",
          shares: 5,
          costBasis: 2000,
          // id missing
        },
      ],
    };
    const result = migratePortfolio(raw);
    expect(result.positions[0]?.id).toMatch(/.+/);
  });

  it("preserves notes through migration", () => {
    const v1 = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          symbol: "AAPL",
          entryDate: "2025-01-01",
          entryPrice: 150,
          sharesOwned: 10,
          notes: "Bought after iPhone launch",
        },
      ],
    };
    const result = migratePortfolio(v1);
    expect(result.positions[0]?.notes).toBe("Bought after iPhone launch");
  });

  it("drops malformed entries silently (no throw)", () => {
    const raw = {
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        { kind: "stock", id: "ok", symbol: "OK", entryDate: "2026-01-01", shares: 1, costBasis: 100 },
        "not a position",
        null,
        { kind: "unknown_type" },
      ],
    };
    const result = migratePortfolio(raw);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]?.kind).toBe("stock");
  });
});
