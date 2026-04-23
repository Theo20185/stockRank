import { describe, expect, it } from "vitest";
import {
  quarterEndsBetween,
  synthesizeSnapshotAt,
  type SymbolProfile,
} from "./historical.js";
import type { HistoricalBar } from "./mapper.js";
import type { EdgarCompanyFacts, EdgarFact } from "./types.js";

function fact(end: string, val: number, fp: string, filed = "2026-01-01"): EdgarFact {
  return {
    end,
    val,
    fy: parseInt(end.slice(0, 4), 10),
    fp,
    form: fp === "FY" ? "10-K" : "10-Q",
    filed,
  };
}

function profile(): SymbolProfile {
  return {
    symbol: "TEST",
    name: "Test Corp",
    sector: "Technology",
    industry: "Software",
    exchange: "NMS",
    currency: "USD",
    authoritativeShares: 1_000_000_000,
  };
}

/** Synthetic facts: 6 quarters of NetIncome, EPS, OpInc, D&A, OCF,
 * Capex, plus 2 fiscal-year balance sheet snapshots. Enough to
 * reconstruct a TTM snapshot at any 2025 quarter end. */
function synthFacts(): EdgarCompanyFacts {
  return {
    cik: 999,
    entityName: "Test Corp",
    facts: {
      "us-gaap": {
        NetIncomeLoss: {
          units: {
            USD: [
              fact("2024-06-30", 5e9, "Q2"),
              fact("2024-09-30", 6e9, "Q3"),
              fact("2024-12-31", 7e9, "Q4"),
              fact("2024-12-31", 22e9, "FY", "2025-02-15"),
              fact("2025-03-31", 5.5e9, "Q1"),
              fact("2025-06-30", 6.5e9, "Q2"),
              fact("2025-09-30", 7.5e9, "Q3"),
            ],
          },
        },
        EarningsPerShareDiluted: {
          units: {
            "USD/shares": [
              fact("2024-06-30", 0.5, "Q2"),
              fact("2024-09-30", 0.6, "Q3"),
              fact("2024-12-31", 0.7, "Q4"),
              fact("2024-12-31", 2.2, "FY", "2025-02-15"),
              fact("2025-03-31", 0.55, "Q1"),
              fact("2025-06-30", 0.65, "Q2"),
              fact("2025-09-30", 0.75, "Q3"),
            ],
          },
        },
        WeightedAverageNumberOfDilutedSharesOutstanding: {
          units: {
            shares: [
              fact("2024-12-31", 1_000_000_000, "FY", "2025-02-15"),
              fact("2025-03-31", 1_000_000_000, "Q1"),
              fact("2025-06-30", 1_000_000_000, "Q2"),
              fact("2025-09-30", 1_000_000_000, "Q3"),
            ],
          },
        },
        OperatingIncomeLoss: {
          units: {
            USD: [
              fact("2024-06-30", 7e9, "Q2"),
              fact("2024-09-30", 8e9, "Q3"),
              fact("2024-12-31", 9e9, "Q4"),
              fact("2024-12-31", 30e9, "FY", "2025-02-15"),
              fact("2025-03-31", 7.5e9, "Q1"),
              fact("2025-06-30", 8.5e9, "Q2"),
              fact("2025-09-30", 9.5e9, "Q3"),
            ],
          },
        },
        DepreciationDepletionAndAmortization: {
          units: {
            USD: [
              fact("2024-06-30", 1e9, "Q2"),
              fact("2024-09-30", 1.1e9, "Q3"),
              fact("2024-12-31", 1.2e9, "Q4"),
              fact("2025-03-31", 1.3e9, "Q1"),
              fact("2025-06-30", 1.4e9, "Q2"),
              fact("2025-09-30", 1.5e9, "Q3"),
            ],
          },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: {
            USD: [
              fact("2024-06-30", 6e9, "Q2"),
              fact("2024-09-30", 7e9, "Q3"),
              fact("2024-12-31", 8e9, "Q4"),
              fact("2025-03-31", 6.5e9, "Q1"),
              fact("2025-06-30", 7.5e9, "Q2"),
              fact("2025-09-30", 8.5e9, "Q3"),
            ],
          },
        },
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: {
            USD: [
              fact("2024-06-30", 1e9, "Q2"),
              fact("2024-09-30", 1e9, "Q3"),
              fact("2024-12-31", 1.5e9, "Q4"),
              fact("2025-03-31", 1.2e9, "Q1"),
              fact("2025-06-30", 1.2e9, "Q2"),
              fact("2025-09-30", 1.3e9, "Q3"),
            ],
          },
        },
        StockholdersEquity: {
          units: {
            USD: [
              fact("2024-12-31", 100e9, "FY", "2025-02-15"),
              fact("2025-03-31", 105e9, "Q1"),
              fact("2025-06-30", 110e9, "Q2"),
              fact("2025-09-30", 115e9, "Q3"),
            ],
          },
        },
        CashAndCashEquivalentsAtCarryingValue: {
          units: {
            USD: [
              fact("2024-12-31", 30e9, "FY", "2025-02-15"),
              fact("2025-09-30", 35e9, "Q3"),
            ],
          },
        },
        LongTermDebt: {
          units: {
            USD: [
              fact("2024-12-31", 50e9, "FY", "2025-02-15"),
              fact("2025-09-30", 48e9, "Q3"),
            ],
          },
        },
      },
    },
  };
}

function bars(): HistoricalBar[] {
  return [
    { date: "2024-06-28", close: 100, high: 105, low: 95 },
    { date: "2024-09-30", close: 110, high: 115, low: 105 },
    { date: "2024-12-31", close: 120, high: 125, low: 115 },
    { date: "2025-03-31", close: 130, high: 135, low: 125 },
    { date: "2025-06-30", close: 140, high: 145, low: 135 },
    { date: "2025-09-30", close: 150, high: 155, low: 145 },
    { date: "2025-12-31", close: 160, high: 165, low: 155 },
  ];
}

describe("synthesizeSnapshotAt", () => {
  it("reconstructs a snapshot at a quarter end with correct TTM sums", () => {
    // At 2025-12-31, public quarterly = those with end ≤ 2025-12-31 - 45d = 2025-11-16
    // → Q3 2025 (2025-09-30) is the most recent; trailing 4 quarters
    // for TTM: Q4 2024, Q1 2025, Q2 2025, Q3 2025.
    const snap = synthesizeSnapshotAt(synthFacts(), bars(), "2025-12-31", profile());
    expect(snap).not.toBeNull();
    expect(snap!.symbol).toBe("TEST");
    expect(snap!.quote.price).toBe(160);
    // TTM EPS = 0.7 + 0.55 + 0.65 + 0.75 = 2.65
    expect(snap!.ttm.peRatio).toBeCloseTo(160 / 2.65, 2);
    // TTM EBITDA = (Q4 OpInc 9 + Q4 D&A 1.2) + (Q1 OpInc 7.5 + Q1 D&A 1.3) +
    //              (Q2 OpInc 8.5 + Q2 D&A 1.4) + (Q3 OpInc 9.5 + Q3 D&A 1.5)
    //            = (9+1.2)+(7.5+1.3)+(8.5+1.4)+(9.5+1.5) = 39.9e9
    const ev = snap!.marketCap + 48e9 - 35e9; // marketCap + debt - cash (latest balance: Q3 2025)
    expect(snap!.ttm.evToEbitda).toBeCloseTo(ev / 39.9e9, 2);
  });

  it("respects the 90-day annual filing lag (FY2024 not public on 2025-01-15)", () => {
    // FY2024 (period end 2024-12-31) was filed 2025-02-15. Reconstruct
    // at 2025-01-15 (annual cutoff = 2025-01-15 - 90d = 2024-10-17).
    // FY2024 wasn't public yet → should not appear in annual[].
    const snap = synthesizeSnapshotAt(synthFacts(), bars(), "2025-01-15", profile());
    if (snap) {
      const fy24 = snap.annual.find((a) => a.fiscalYear === "2024");
      expect(fy24).toBeUndefined();
    }
  });

  it("returns null when no chart bar covers the date", () => {
    const snap = synthesizeSnapshotAt(synthFacts(), bars(), "2020-01-01", profile());
    expect(snap).toBeNull();
  });

  it("returns null when no quarterly fundamentals are public yet", () => {
    const facts: EdgarCompanyFacts = {
      cik: 999,
      entityName: "Test Corp",
      facts: { "us-gaap": {} },
    };
    const snap = synthesizeSnapshotAt(facts, bars(), "2025-12-31", profile());
    expect(snap).toBeNull();
  });

  it("yearHigh/yearLow are computed from the trailing-365d bar window", () => {
    const snap = synthesizeSnapshotAt(synthFacts(), bars(), "2025-12-31", profile());
    expect(snap).not.toBeNull();
    // Trailing year (2024-12-31 → 2025-12-31): bars with high 125, 135, 145, 155, 165
    expect(snap!.quote.yearHigh).toBe(165);
    expect(snap!.quote.yearLow).toBe(115); // 2024-12-31 low
  });
});

describe("quarterEndsBetween", () => {
  it("enumerates Mar/Jun/Sep/Dec 31s within the window (exclusive start, inclusive end)", () => {
    const ends = quarterEndsBetween("2024-12-31", "2025-12-31");
    expect(ends).toEqual([
      "2025-03-31",
      "2025-06-30",
      "2025-09-30",
      "2025-12-31",
    ]);
  });

  it("returns empty when the window is shorter than a quarter", () => {
    expect(quarterEndsBetween("2025-04-01", "2025-05-31")).toEqual([]);
  });

  it("spans multiple years", () => {
    const ends = quarterEndsBetween("2023-06-30", "2025-09-30");
    expect(ends.length).toBeGreaterThan(8);
    expect(ends[0]).toBe("2023-09-30");
    expect(ends[ends.length - 1]).toBe("2025-09-30");
  });
});
