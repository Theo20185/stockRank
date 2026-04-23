import { describe, expect, it } from "vitest";
import {
  decorateAnnualPeriodsWithPrices,
  decorateQuarterlyPeriodsWithPrices,
  fiscalQuarterOf,
  type HistoricalBar,
  mapAnnualPeriods,
  mapQuarterlyPeriods,
  withAnnualRatios,
} from "./mapper.js";
import type { EdgarCompanyFacts, EdgarFact } from "./types.js";

function fact(end: string, val: number, fp = "FY", filed = "2026-01-01"): EdgarFact {
  return { end, val, fy: parseInt(end.slice(0, 4), 10), fp, form: "10-K", filed };
}

/** Compact synthetic companyfacts payload: enough to exercise EBITDA
 * reconstruction, FCF reconstruction, capex sign flip, total-debt
 * fallback, and the dividend chain. */
function synthFacts(): EdgarCompanyFacts {
  return {
    cik: 999,
    entityName: "Synthetic Inc.",
    facts: {
      "us-gaap": {
        Revenues: { units: { USD: [fact("2024-12-31", 100), fact("2025-12-31", 110)] } },
        NetIncomeLoss: { units: { USD: [fact("2024-12-31", 20), fact("2025-12-31", 25)] } },
        EarningsPerShareDiluted: {
          units: { "USD/shares": [fact("2024-12-31", 2), fact("2025-12-31", 2.5)] },
        },
        WeightedAverageNumberOfDilutedSharesOutstanding: {
          units: { shares: [fact("2024-12-31", 10), fact("2025-12-31", 10)] },
        },
        OperatingIncomeLoss: {
          units: { USD: [fact("2024-12-31", 30), fact("2025-12-31", 35)] },
        },
        DepreciationDepletionAndAmortization: {
          units: { USD: [fact("2024-12-31", 5), fact("2025-12-31", 6)] },
        },
        NetCashProvidedByUsedInOperatingActivities: {
          units: { USD: [fact("2024-12-31", 28), fact("2025-12-31", 32)] },
        },
        // EDGAR reports capex as a positive magnitude — mapper must flip the sign.
        PaymentsToAcquirePropertyPlantAndEquipment: {
          units: { USD: [fact("2024-12-31", 8), fact("2025-12-31", 9)] },
        },
        PaymentsOfDividends: {
          units: { USD: [fact("2024-12-31", 4), fact("2025-12-31", 5)] },
        },
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [fact("2024-12-31", 15), fact("2025-12-31", 18)] },
        },
        StockholdersEquity: {
          units: { USD: [fact("2024-12-31", 200), fact("2025-12-31", 220)] },
        },
        AssetsCurrent: { units: { USD: [fact("2025-12-31", 80)] } },
        LiabilitiesCurrent: { units: { USD: [fact("2025-12-31", 40)] } },
        // Total-debt fallback: only the split tags exist (no LongTermDebt total).
        LongTermDebtNoncurrent: { units: { USD: [fact("2025-12-31", 50)] } },
        LongTermDebtCurrent: { units: { USD: [fact("2025-12-31", 10)] } },
      },
    },
  };
}

describe("mapAnnualPeriods", () => {
  it("extracts a full panel and reconstructs EBITDA + FCF", () => {
    const periods = mapAnnualPeriods(synthFacts());
    expect(periods).toHaveLength(2);

    // newest-first
    expect(periods[0]!.fiscalYear).toBe("2025");
    expect(periods[1]!.fiscalYear).toBe("2024");

    const fy25 = periods[0]!;
    expect(fy25.income.revenue).toBe(110);
    expect(fy25.income.netIncome).toBe(25);
    expect(fy25.income.epsDiluted).toBe(2.5);
    expect(fy25.income.ebitda).toBe(35 + 6); // OpInc + D&A
    expect(fy25.cashFlow.operatingCashFlow).toBe(32);
    expect(fy25.cashFlow.capex).toBe(-9); // sign flipped from EDGAR's positive magnitude
    expect(fy25.cashFlow.freeCashFlow).toBe(32 - 9);
    expect(fy25.cashFlow.dividendsPaid).toBe(5);
  });

  it("falls back to LongTermDebtNoncurrent + LongTermDebtCurrent when LongTermDebt missing", () => {
    const fy25 = mapAnnualPeriods(synthFacts())[0]!;
    expect(fy25.balance.totalDebt).toBe(60); // 50 noncurrent + 10 current
  });

  it("uses LongTermDebt directly when present (already sums noncurrent + current)", () => {
    const f = synthFacts();
    f.facts["us-gaap"]!.LongTermDebt = {
      units: { USD: [fact("2025-12-31", 75)] },
    };
    const fy25 = mapAnnualPeriods(f)[0]!;
    expect(fy25.balance.totalDebt).toBe(75);
  });

  it("computes ratios when withAnnualRatios is applied", () => {
    const fy25 = mapAnnualPeriods(synthFacts()).map(withAnnualRatios)[0]!;
    expect(fy25.ratios.currentRatio).toBe(80 / 40);
    // netDebt = 60 - 18 = 42, EBITDA = 41 → ratio ≈ 1.024
    expect(fy25.ratios.netDebtToEbitda).toBeCloseTo(42 / 41, 3);
    // ROIC ≈ EBIT * 0.79 / IC; IC = 220 + 60 - 18 = 262; EBIT=35
    expect(fy25.ratios.roic).toBeCloseTo((35 * 0.79) / 262, 3);
  });

  it("dedupe keeps the latest restatement", () => {
    const f = synthFacts();
    f.facts["us-gaap"]!.NetIncomeLoss = {
      units: {
        USD: [
          fact("2025-12-31", 25, "FY", "2026-01-01"),
          fact("2025-12-31", 26, "FY", "2026-04-01"), // restated up
        ],
      },
    };
    const fy25 = mapAnnualPeriods(f)[0]!;
    expect(fy25.income.netIncome).toBe(26);
  });
});

describe("mapQuarterlyPeriods", () => {
  it("returns Q* periods only, newest-first", () => {
    const f = synthFacts();
    f.facts["us-gaap"]!.NetIncomeLoss = {
      units: {
        USD: [
          fact("2025-03-31", 5, "Q1"),
          fact("2025-06-30", 6, "Q2"),
          fact("2025-09-30", 7, "Q3"),
          fact("2025-12-31", 8, "FY"), // FY excluded from quarterly
        ],
      },
    };
    const q = mapQuarterlyPeriods(f);
    const quarters = q.map((p) => p.fiscalQuarter);
    expect(quarters).toEqual(["2025Q3", "2025Q2", "2025Q1"]);
  });
});

describe("decorateAnnualPeriodsWithPrices", () => {
  it("fills priceAtYearEnd, priceHighInYear, priceLowInYear from monthly bars", () => {
    const periods = mapAnnualPeriods(synthFacts());
    const bars: HistoricalBar[] = [
      { date: "2024-06-30", close: 100, high: 105, low: 95 },
      { date: "2025-03-31", close: 120, high: 130, low: 115 },
      { date: "2025-09-30", close: 130, high: 132, low: 118 },
      { date: "2025-12-31", close: 140, high: 145, low: 135 },
    ];

    const decorated = decorateAnnualPeriodsWithPrices(periods, bars);
    const fy25 = decorated.find((p) => p.fiscalYear === "2025")!;
    expect(fy25.priceAtYearEnd).toBe(140);
    // Window is [2024-12-31, 2025-12-31]; max high = 145, min low = 115.
    expect(fy25.priceHighInYear).toBe(145);
    expect(fy25.priceLowInYear).toBe(115);
  });

  it("leaves prices null when no bars cover the period", () => {
    const periods = mapAnnualPeriods(synthFacts());
    const decorated = decorateAnnualPeriodsWithPrices(periods, []);
    for (const p of decorated) {
      expect(p.priceAtYearEnd).toBeNull();
      expect(p.priceHighInYear).toBeNull();
      expect(p.priceLowInYear).toBeNull();
    }
  });
});

describe("decorateQuarterlyPeriodsWithPrices", () => {
  it("fills priceAtQuarterEnd from the closest at-or-before bar", () => {
    const f = synthFacts();
    f.facts["us-gaap"]!.NetIncomeLoss = {
      units: {
        USD: [fact("2025-03-31", 5, "Q1"), fact("2025-06-30", 6, "Q2")],
      },
    };
    const periods = mapQuarterlyPeriods(f);
    const bars: HistoricalBar[] = [
      { date: "2025-03-15", close: 110, high: null, low: null },
      { date: "2025-06-15", close: 130, high: null, low: null },
    ];
    const decorated = decorateQuarterlyPeriodsWithPrices(periods, bars);
    const q1 = decorated.find((p) => p.fiscalQuarter === "2025Q1")!;
    const q2 = decorated.find((p) => p.fiscalQuarter === "2025Q2")!;
    expect(q1.priceAtQuarterEnd).toBe(110);
    expect(q2.priceAtQuarterEnd).toBe(130);
  });
});

describe("fiscalQuarterOf", () => {
  it("computes calendar-quarter labels from period-end dates", () => {
    expect(fiscalQuarterOf("2025-03-31")).toBe("2025Q1");
    expect(fiscalQuarterOf("2025-06-30")).toBe("2025Q2");
    expect(fiscalQuarterOf("2025-09-30")).toBe("2025Q3");
    expect(fiscalQuarterOf("2025-12-31")).toBe("2025Q4");
  });
});
