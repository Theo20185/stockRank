import { describe, expect, it } from "vitest";
import {
  cumulativeSplitFactorAfter,
  DEFAULT_MAX_ANNUAL_PERIODS,
  decorateAnnualPeriodsWithPrices,
  decorateQuarterlyPeriodsWithPrices,
  fiscalQuarterOf,
  type HistoricalBar,
  inferSharesScale,
  mapAnnualPeriods,
  mapQuarterlyPeriods,
  normalizeShareMagnitudes,
  rescaleSharesInPeriods,
  splitEventsFrom,
  withAnnualRatios,
} from "./mapper.js";
import type { EdgarCompanyFacts, EdgarFact } from "./types.js";

function fact(end: string, val: number, fp = "FY", filed = "2026-01-01"): EdgarFact {
  // Add a sensible `start` date so flow facts pass the
  // standalone-quarter filter (~90-day period for quarters, ~365 for FY).
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  const offsetDays = fp === "FY" ? 365 : 90;
  const start = new Date(endMs - offsetDays * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    end,
    start,
    val,
    fy: parseInt(end.slice(0, 4), 10),
    fp,
    form: fp === "FY" ? "10-K" : "10-Q",
    filed,
  };
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
    // Q4 is derived from FY annual − (Q1+Q2+Q3 standalones); the FY
    // annual fact is in the synth fixture too, so Q4 is injected at
    // the FY end date (2025-12-31 → "2025Q4").
    expect(quarters).toEqual(["2025Q4", "2025Q3", "2025Q2", "2025Q1"]);
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

describe("truncation defaults", () => {
  it("caps annual periods at DEFAULT_MAX_ANNUAL_PERIODS", () => {
    // Build 10 years of NetIncome facts; mapper should keep only the
    // most-recent DEFAULT_MAX_ANNUAL_PERIODS (newest-first).
    const f = synthFacts();
    const niFacts = [];
    for (let y = 2015; y <= 2025; y += 1) {
      niFacts.push(fact(`${y}-12-31`, y, "FY"));
    }
    f.facts["us-gaap"]!.NetIncomeLoss = { units: { USD: niFacts } };
    const periods = mapAnnualPeriods(f);
    expect(periods.length).toBe(DEFAULT_MAX_ANNUAL_PERIODS);
    expect(periods[0]!.fiscalYear).toBe("2025");
    expect(periods[periods.length - 1]!.fiscalYear).toBe(
      String(2025 - DEFAULT_MAX_ANNUAL_PERIODS + 1),
    );
  });

  it("respects an explicit maxAnnualPeriods override", () => {
    const f = synthFacts();
    const periods = mapAnnualPeriods(f, { maxAnnualPeriods: 1 });
    expect(periods.length).toBe(1);
    expect(periods[0]!.fiscalYear).toBe("2025");
  });

  it("caps quarterly periods at the configured limit", () => {
    const f = synthFacts();
    const niFacts = [];
    for (let y = 2022; y <= 2025; y += 1) {
      for (const q of [1, 2, 3, 4]) {
        niFacts.push(fact(`${y}-${String(q * 3).padStart(2, "0")}-30`, y * 10 + q, `Q${q}`));
      }
    }
    f.facts["us-gaap"]!.NetIncomeLoss = { units: { USD: niFacts } };
    const periods = mapQuarterlyPeriods(f, { maxQuarterlyPeriods: 5 });
    expect(periods.length).toBe(5);
  });
});

describe("inferSharesScale", () => {
  it("returns 1 when EDGAR matches authoritative within 30%", () => {
    expect(inferSharesScale(15_000_000_000, 14_900_000_000)).toBe(1);
  });

  it("detects a 1M scale (filer reports in millions)", () => {
    // MCD case: EDGAR returns 716.4, Yahoo says 716_000_000.
    expect(inferSharesScale(716.4, 716_000_000)).toBe(1_000_000);
  });

  it("detects a 1K scale (filer reports in thousands)", () => {
    expect(inferSharesScale(716_000, 716_000_000)).toBe(1_000);
  });

  it("returns 1 when EDGAR shares are missing", () => {
    expect(inferSharesScale(null, 1_000_000_000)).toBe(1);
    expect(inferSharesScale(0, 1_000_000_000)).toBe(1);
  });

  it("returns 1 when authoritative shares are missing", () => {
    expect(inferSharesScale(100, 0)).toBe(1);
  });

  it("returns 1 when ratio doesn't match any power-of-1000", () => {
    // 47x is not 1×, 1000×, 1M×, or 1B× — leave alone.
    expect(inferSharesScale(100, 4_700)).toBe(1);
  });
});

describe("rescaleSharesInPeriods", () => {
  it("multiplies sharesDiluted across all periods uniformly", () => {
    const periods = mapAnnualPeriods(synthFacts());
    const rescaled = rescaleSharesInPeriods(periods, 1_000_000);
    expect(rescaled[0]!.income.sharesDiluted).toBe(periods[0]!.income.sharesDiluted! * 1_000_000);
    expect(rescaled[1]!.income.sharesDiluted).toBe(periods[1]!.income.sharesDiluted! * 1_000_000);
  });

  it("is a no-op when scale is 1 (returns original array)", () => {
    const periods = mapAnnualPeriods(synthFacts());
    const rescaled = rescaleSharesInPeriods(periods, 1);
    expect(rescaled).toBe(periods);
  });

  it("preserves null sharesDiluted entries", () => {
    const periods = [
      {
        income: { sharesDiluted: null as number | null },
      },
    ];
    const rescaled = rescaleSharesInPeriods(periods, 1_000_000);
    expect(rescaled[0]!.income.sharesDiluted).toBeNull();
  });
});

describe("splitEventsFrom", () => {
  it("normalizes numerator/denominator pairs and Date objects", () => {
    expect(
      splitEventsFrom([
        { date: new Date("2024-06-10T13:30:00.000Z"), numerator: 10, denominator: 1 },
      ]),
    ).toEqual([{ date: "2024-06-10", ratio: 10 }]);
  });

  it("falls back to parsing the splitRatio string", () => {
    expect(
      splitEventsFrom([{ date: "2014-06-09T13:30:00.000Z", splitRatio: "7:1" }]),
    ).toEqual([{ date: "2014-06-09", ratio: 7 }]);
  });

  it("handles reverse splits (ratio < 1)", () => {
    expect(
      splitEventsFrom([{ date: "2023-01-05", numerator: 1, denominator: 20 }]),
    ).toEqual([{ date: "2023-01-05", ratio: 0.05 }]);
  });

  it("drops degenerate entries rather than zeroing per-share values", () => {
    expect(
      splitEventsFrom([
        { date: "2024-01-01", numerator: 1, denominator: 1 },
        { date: "2024-02-01", numerator: 0, denominator: 1 },
        { date: "2024-03-01", numerator: 4, denominator: 0 },
        { date: "not-a-date", numerator: 4, denominator: 1 },
        { date: "2024-05-01" },
      ]),
    ).toEqual([]);
  });

  it("returns an empty list for missing input", () => {
    expect(splitEventsFrom(undefined)).toEqual([]);
    expect(splitEventsFrom(null)).toEqual([]);
  });
});

describe("cumulativeSplitFactorAfter", () => {
  const splits = [
    { date: "2021-07-20", ratio: 4 },
    { date: "2024-06-10", ratio: 10 },
  ];

  it("returns 1 when no split follows the date", () => {
    expect(cumulativeSplitFactorAfter(splits, "2025-01-01")).toBe(1);
  });

  it("compounds every split strictly after the date", () => {
    expect(cumulativeSplitFactorAfter(splits, "2020-01-01")).toBe(40);
    expect(cumulativeSplitFactorAfter(splits, "2022-01-01")).toBe(10);
  });

  it("excludes a split landing exactly on the date (already reflected)", () => {
    expect(cumulativeSplitFactorAfter(splits, "2021-07-20")).toBe(10);
  });

  it("returns 1 for an empty or absent split list", () => {
    expect(cumulativeSplitFactorAfter([], "2020-01-01")).toBe(1);
    expect(cumulativeSplitFactorAfter(undefined, "2020-01-01")).toBe(1);
  });
});

describe("split-basis normalization (mapAnnualPeriods opts.splits)", () => {
  /**
   * Reproduces the NVDA/CMG basis break: `dedupeByPeriod` keeps the
   * latest-filed fact per period, so recent fiscal years carry
   * current-basis per-share values (restated in the newest 10-K's
   * comparatives) while older years keep their pre-split as-filed
   * values. Left uncorrected, an old year's EPS reads N× too high
   * and its share count N× too low.
   */
  function splitBreakFacts(): EdgarCompanyFacts {
    return {
      cik: 998,
      entityName: "Splitter Inc.",
      facts: {
        "us-gaap": {
          Revenues: {
            units: {
              USD: [
                fact("2022-12-31", 100, "FY", "2024-02-01"),
                fact("2024-12-31", 120, "FY", "2026-02-01"),
              ],
            },
          },
          NetIncomeLoss: {
            units: {
              USD: [
                fact("2022-12-31", 20_000_000, "FY", "2024-02-01"),
                fact("2024-12-31", 24_000_000, "FY", "2026-02-01"),
                fact("2024-03-31", 5_000_000, "Q1", "2024-05-01"),
                fact("2024-09-30", 6_000_000, "Q3", "2024-11-01"),
              ],
            },
          },
          // FY2022 last restated in the 2024-02-01 filing — i.e.
          // BEFORE the 2024-06-10 10:1 split. FY2024 filed after.
          // Q1-2024 filed 2024-05-01 (pre-split), Q3-2024 filed
          // 2024-11-01 (post-split) — the break lands mid-year.
          EarningsPerShareDiluted: {
            units: {
              "USD/shares": [
                fact("2022-12-31", 20, "FY", "2024-02-01"),
                fact("2024-12-31", 2.4, "FY", "2026-02-01"),
                fact("2024-03-31", 5, "Q1", "2024-05-01"),
                fact("2024-09-30", 0.6, "Q3", "2024-11-01"),
              ],
            },
          },
          WeightedAverageNumberOfDilutedSharesOutstanding: {
            units: {
              shares: [
                fact("2022-12-31", 1_000_000, "FY", "2024-02-01"),
                fact("2024-12-31", 10_000_000, "FY", "2026-02-01"),
                fact("2024-03-31", 1_000_000, "Q1", "2024-05-01"),
                fact("2024-09-30", 10_000_000, "Q3", "2024-11-01"),
              ],
            },
          },
        },
      },
    } as unknown as EdgarCompanyFacts;
  }

  const splits = [{ date: "2024-06-10", ratio: 10 }];

  it("leaves per-share facts untouched when no splits are supplied", () => {
    const periods = mapAnnualPeriods(splitBreakFacts());
    const fy2022 = periods.find((p) => p.periodEndDate === "2022-12-31")!;
    expect(fy2022.income.epsDiluted).toBe(20);
    expect(fy2022.income.sharesDiluted).toBe(1_000_000);
  });

  it("divides stale-basis EPS by the split factor that followed its filing", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const fy2022 = periods.find((p) => p.periodEndDate === "2022-12-31")!;
    expect(fy2022.income.epsDiluted).toBeCloseTo(2, 10);
  });

  it("multiplies stale-basis share counts by the same factor", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const fy2022 = periods.find((p) => p.periodEndDate === "2022-12-31")!;
    expect(fy2022.income.sharesDiluted).toBe(10_000_000);
  });

  it("leaves already-current-basis periods alone", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const fy2024 = periods.find((p) => p.periodEndDate === "2024-12-31")!;
    expect(fy2024.income.epsDiluted).toBe(2.4);
    expect(fy2024.income.sharesDiluted).toBe(10_000_000);
  });

  it("removes the adjacent-year share-count discontinuity", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const counts = periods
      .map((p) => p.income.sharesDiluted)
      .filter((v): v is number => v !== null);
    for (let i = 0; i < counts.length - 1; i += 1) {
      const ratio = counts[i]! / counts[i + 1]!;
      expect(ratio).toBeLessThan(1.8);
      expect(ratio).toBeGreaterThan(0.55);
    }
  });

  it("does not rescale dollar-denominated concepts", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const fy2022 = periods.find((p) => p.periodEndDate === "2022-12-31")!;
    expect(fy2022.income.revenue).toBe(100);
    expect(fy2022.income.netIncome).toBe(20_000_000);
  });

  it("keeps EPS × shares consistent with reported net income", () => {
    const periods = mapAnnualPeriods(splitBreakFacts(), { splits });
    const fy2022 = periods.find((p) => p.periodEndDate === "2022-12-31")!;
    const implied =
      fy2022.income.epsDiluted! * fy2022.income.sharesDiluted!;
    expect(implied).toBeCloseTo(fy2022.income.netIncome!, 6);
  });

  it("applies the same normalization to quarterly periods", () => {
    const periods = mapQuarterlyPeriods(splitBreakFacts(), { splits });
    // Q1-2024 was filed before the split → stale basis, needs the 10×
    // correction. Q3-2024 was filed after → already current.
    const q1 = periods.find((p) => p.periodEndDate === "2024-03-31")!;
    const q3 = periods.find((p) => p.periodEndDate === "2024-09-30")!;
    expect(q1.income.epsDiluted).toBeCloseTo(0.5, 10);
    expect(q1.income.sharesDiluted).toBe(10_000_000);
    expect(q3.income.epsDiluted).toBe(0.6);
    expect(q3.income.sharesDiluted).toBe(10_000_000);
  });
});

describe("normalizeShareMagnitudes", () => {
  // The COP/DLR/HST family (gaps doc §2.6): SOME periods report
  // share counts in different units than others (thousands vs raw,
  // even millions), producing adjacent-year "jumps" of 959×-1e6×
  // that the annual[0]-anchored inferSharesScale never sees. EPS is
  // per-share-correct regardless, so only sharesDiluted moves.
  const AUTH = 1_000_000_000; // authoritative current count: 1B

  function periods(counts: Array<number | null>) {
    return counts.map((sharesDiluted, i) =>
      makePeriodLike(`${2025 - i}-12-31`, sharesDiluted),
    );
  }
  function makePeriodLike(end: string, sharesDiluted: number | null) {
    return {
      periodEndDate: end,
      income: { sharesDiluted, epsDiluted: 5 },
    };
  }

  it("scales up a thousands-reported period (COP shape)", () => {
    const out = normalizeShareMagnitudes(periods([1_000_000_000, 1_050_000]), AUTH);
    expect(out[0]!.income.sharesDiluted).toBe(1_000_000_000);
    expect(out[1]!.income.sharesDiluted).toBe(1_050_000_000);
  });

  it("scales down a period reported a power-of-1000 too HIGH (HST shape)", () => {
    const out = normalizeShareMagnitudes(periods([1_000_000_000, 950_000_000_000]), AUTH);
    expect(out[1]!.income.sharesDiluted).toBe(950_000_000);
  });

  it("handles the millions-off case (1e6)", () => {
    const out = normalizeShareMagnitudes(periods([1_000_000_000, 1_100]), AUTH);
    expect(out[1]!.income.sharesDiluted).toBe(1_100_000_000);
  });

  it("DLR shape: repairs against the series median when real drift puts today's count out of band", () => {
    // DLR 2020: 262,523 (thousands) among neighbors ~209-348M, with
    // today's authoritative at 377.7M after years of REIT issuance.
    // vs authoritative the bad row is 1438× off (outside ±30% of
    // 1000); vs the series median it's cleanly ×1000. The reference
    // must be the series' own unit-consistent majority.
    const counts = [347_810_000, 331_547_000, 309_065_000, 297_919_000, 283_222_000, 262_523, 209_462_247];
    const out = normalizeShareMagnitudes(periods(counts), 377_700_000);
    expect(out[5]!.income.sharesDiluted).toBe(262_523_000);
    // Everything else untouched.
    expect(out[0]!.income.sharesDiluted).toBe(347_810_000);
    expect(out[6]!.income.sharesDiluted).toBe(209_462_247);
  });

  it("falls back to the authoritative reference when the series MAJORITY is wrong-unit", () => {
    // If most periods are off (median itself a power-of-1000 from
    // authoritative), trusting the median would invert the repair and
    // corrupt the correct rows. The authoritative count referees.
    const out = normalizeShareMagnitudes(
      periods([1_000_000_000, 1_050_000, 1_100_000, 950_000]),
      AUTH,
    );
    expect(out.map((p) => p.income.sharesDiluted)).toEqual([
      1_000_000_000, 1_050_000_000, 1_100_000_000, 950_000_000,
    ]);
  });

  it("leaves legitimate buyback/issuance drift alone (within ~30% of no power-of-1000)", () => {
    const counts = [1_000_000_000, 1_400_000_000, 700_000_000, 2_500_000_000];
    const out = normalizeShareMagnitudes(periods(counts), AUTH);
    expect(out.map((p) => p.income.sharesDiluted)).toEqual(counts);
  });

  it("leaves EPS untouched — the unit error is in the count field only", () => {
    const out = normalizeShareMagnitudes(periods([1_050_000]), AUTH);
    expect(out[0]!.income.epsDiluted).toBe(5);
  });

  it("passes null counts and non-positive references through", () => {
    const rows = periods([null, 1_000_000]);
    expect(normalizeShareMagnitudes(rows, 0)).toBe(rows);
    const out = normalizeShareMagnitudes(rows, AUTH);
    expect(out[0]!.income.sharesDiluted).toBeNull();
  });

  it("returns the same array reference when nothing needed fixing", () => {
    const rows = periods([1_000_000_000, 980_000_000]);
    expect(normalizeShareMagnitudes(rows, AUTH)).toBe(rows);
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
