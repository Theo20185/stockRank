import { describe, it, expect } from "vitest";
import { rank } from "./ranking.js";
import { DEFAULT_WEIGHTS } from "./weights.js";
import { makeCompany, makePeriod, makeTtm } from "./test-helpers.js";

function makeUniverse(count: number, industry = "Industrial Conglomerates") {
  return Array.from({ length: count }, (_, i) =>
    makeCompany({
      symbol: `S${i.toString().padStart(2, "0")}`,
      industry,
      sector: "Industrials",
    }),
  );
}

describe("rank() — main composite", () => {
  it("returns one row per eligible company plus an empty turnaround list when all pass the floor", () => {
    const result = rank({
      companies: makeUniverse(10),
      snapshotDate: "2026-04-20",
    });
    expect(result.rows.length).toBe(10);
    expect(result.turnaroundWatchlist.length).toBe(0);
    expect(result.universeSize).toBe(10);
    expect(result.excludedCount).toBe(0);
  });

  it("uses the default weights when none provided", () => {
    const result = rank({
      companies: makeUniverse(10),
      snapshotDate: "2026-04-20",
    });
    // normalizeWeights divides each weight by the sum, which can
    // introduce tiny float drift (e.g., 0.5+0.2+0.1+0.1+0.1 in IEEE
    // 754 sums to 0.9999… not exactly 1). Compare with tolerance.
    for (const cat of Object.keys(DEFAULT_WEIGHTS) as Array<
      keyof typeof DEFAULT_WEIGHTS
    >) {
      expect(result.weights[cat]).toBeCloseTo(DEFAULT_WEIGHTS[cat], 10);
    }
  });

  it("normalizes user-provided weights to sum to 1", () => {
    const result = rank({
      companies: makeUniverse(10),
      snapshotDate: "2026-04-20",
      weights: { valuation: 2, health: 2, quality: 1, shareholderReturn: 1, growth: 1 },
    });
    const sum = Object.values(result.weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("ranks the highest-composite company at universeRank 1", () => {
    const universe = makeUniverse(10);
    // Make S05 unambiguously cheaper (better Valuation) — composite weight 35%
    universe[5] = makeCompany({
      symbol: "S05",
      industry: "Industrial Conglomerates",
      sector: "Industrials",
      ttm: makeTtm({
        evToEbitda: 4,
        priceToFcf: 6,
        peRatio: 5,
        priceToBook: 0.8,
      }),
    });

    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    expect(result.rows[0]!.symbol).toBe("S05");
    expect(result.rows[0]!.universeRank).toBe(1);
  });

  it("computes industryRank within each industry independently", () => {
    const universe = [
      ...makeUniverse(8, "Pharmaceuticals"),
      ...makeUniverse(8, "Discount Stores"),
    ];
    // Tag the second batch's symbols so we can disambiguate
    for (let i = 8; i < 16; i += 1) {
      universe[i] = {
        ...universe[i]!,
        symbol: `T${i.toString().padStart(2, "0")}`,
        industry: "Discount Stores",
      };
    }

    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    const pharmaRanks = result.rows
      .filter((r) => r.industry === "Pharmaceuticals")
      .map((r) => r.industryRank)
      .sort((a, b) => a - b);
    expect(pharmaRanks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("excludes companies that fail the quality floor (3-of-5 unprofitable)", () => {
    const universe = makeUniverse(10);
    // Tank one of them: make all 5 years unprofitable.
    universe[3] = makeCompany({
      symbol: "BAD",
      annual: Array.from({ length: 5 }, (_, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: {
            revenue: 50_000_000_000,
            grossProfit: 10_000_000_000,
            operatingIncome: -5_000_000_000,
            ebit: -5_000_000_000,
            ebitda: -1_000_000_000,
            interestExpense: 500_000_000,
            netIncome: -2_000_000_000,
            epsDiluted: -2,
            sharesDiluted: 1_000_000_000,
          },
        }),
      ),
    });

    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    expect(result.rows.find((r) => r.symbol === "BAD")).toBeUndefined();
    expect(result.excludedCount).toBe(1);
  });
});

describe("rank() — turnaround watchlist", () => {
  it("places a long-track-record name with TTM losses + 40%+ drawdown on the watchlist", () => {
    // Universe of 10 healthy peers, plus one fallen-blue-chip.
    const universe = makeUniverse(10);
    const fallen = makeCompany({
      symbol: "FALL",
      industry: "Industrial Conglomerates",
      sector: "Industrials",
      pctOffYearHigh: 55,
      quote: { price: 50, yearHigh: 110, yearLow: 40, volume: 0, averageVolume: 1_000_000 },
      annual: [
        // Trough year (TTM-equivalent for the fixture) — net income negative
        makePeriod({
          fiscalYear: "2025",
          income: {
            revenue: 50_000_000_000,
            grossProfit: 10_000_000_000,
            operatingIncome: -2_000_000_000,
            ebit: -2_000_000_000,
            ebitda: 1_000_000_000,
            interestExpense: 500_000_000,
            netIncome: -3_000_000_000,
            epsDiluted: -3,
            sharesDiluted: 1_000_000_000,
          },
          ratios: { roic: -0.05, netDebtToEbitda: 5, currentRatio: 1.2 },
        }),
        // Earlier years strong — long-term avg ROIC > 12%
        makePeriod({ fiscalYear: "2024", ratios: { roic: 0.18, netDebtToEbitda: 1, currentRatio: 1.2 } }),
        makePeriod({ fiscalYear: "2023", ratios: { roic: 0.20, netDebtToEbitda: 1, currentRatio: 1.2 } }),
        makePeriod({ fiscalYear: "2022", ratios: { roic: 0.22, netDebtToEbitda: 1, currentRatio: 1.2 } }),
        makePeriod({ fiscalYear: "2021", ratios: { roic: 0.18, netDebtToEbitda: 1, currentRatio: 1.2 } }),
      ],
    });
    universe.push(fallen);

    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    expect(result.rows.find((r) => r.symbol === "FALL")).toBeUndefined();
    expect(result.turnaroundWatchlist.find((r) => r.symbol === "FALL")).toBeDefined();
    const tw = result.turnaroundWatchlist.find((r) => r.symbol === "FALL")!;
    expect(tw.reasons).toContain("longTermQuality");
    expect(tw.reasons).toContain("ttmTrough");
    expect(tw.reasons).toContain("deepDrawdown");
  });

  it("does NOT add a name to turnaround when drawdown is shallow", () => {
    const universe = makeUniverse(10);
    universe.push(
      makeCompany({
        symbol: "MEHFALL",
        pctOffYearHigh: 10, // not deep
        annual: [
          makePeriod({
            fiscalYear: "2025",
            income: { ...makePeriod().income, netIncome: -1_000_000_000 },
          }),
          ...Array.from({ length: 4 }, (_, i) =>
            makePeriod({ fiscalYear: String(2024 - i), ratios: { roic: 0.18, netDebtToEbitda: 1, currentRatio: 1.2 } }),
          ),
        ],
      }),
    );

    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    expect(result.turnaroundWatchlist.find((r) => r.symbol === "MEHFALL")).toBeUndefined();
  });
});

describe("rank() — tie-breaking and missing data", () => {
  it("breaks identical composites by Quality, then ShareholderReturn, then market cap", () => {
    // Build A and B with all factor inputs neutralized to defaults except
    // market cap. Buyback yield depends on mcap (buybacks / mcap) so we set
    // buybacks=0 across the universe to ensure the composite truly only
    // differs by market cap via the tie-break path.
    const neutralAnnual = Array.from({ length: 5 }, (_, i) => {
      const p = makePeriod({ fiscalYear: String(2025 - i) });
      p.cashFlow = { ...p.cashFlow, buybacks: 0 };
      return p;
    });
    const a = makeCompany({
      symbol: "A",
      marketCap: 100_000_000_000,
      annual: neutralAnnual,
    });
    const b = makeCompany({
      symbol: "B",
      marketCap: 200_000_000_000,
      annual: neutralAnnual,
    });
    const peers = makeUniverse(8).map((c) => ({ ...c, annual: neutralAnnual }));
    const universe = [a, b, ...peers];
    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    const aRank = result.rows.find((r) => r.symbol === "A")!.universeRank;
    const bRank = result.rows.find((r) => r.symbol === "B")!.universeRank;
    expect(bRank).toBeLessThan(aRank);
  });

  it("re-weights category averages over only present factors when one is null", () => {
    const universe = makeUniverse(10);
    // Wipe one valuation factor on S00 — others should still average it correctly
    universe[0] = makeCompany({
      symbol: "S00",
      ttm: makeTtm({ evToEbitda: null }),
    });
    const result = rank({ companies: universe, snapshotDate: "2026-04-20" });
    const r = result.rows.find((x) => x.symbol === "S00")!;
    expect(r.missingFactors).toContain("evToEbitda");
    expect(r.categoryScores.valuation).not.toBeNull();
  });
});
