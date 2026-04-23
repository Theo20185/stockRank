import { describe, expect, it } from "vitest";
import {
  annualMap,
  balanceMap,
  dedupeByPeriod,
  deriveQ4FromAnnual,
  firstAvailable,
  isStandaloneQuarterFact,
  quarterlyMap,
  standaloneQuarterlyMap,
  unitFacts,
} from "./concepts.js";
import type { EdgarFact, EdgarFactsByConcept } from "./types.js";

function fact(over: Partial<EdgarFact> & { end: string }): EdgarFact {
  return {
    val: 100,
    fy: 2025,
    fp: "FY",
    form: "10-K",
    filed: "2025-11-01",
    ...over,
  };
}

const sample: EdgarFactsByConcept = {
  Revenues: {
    units: {
      USD: [
        fact({ end: "2024-12-31", fp: "FY", val: 50, filed: "2025-02-01" }),
        fact({ end: "2024-12-31", fp: "FY", val: 55, filed: "2025-04-01" }), // restatement, latest filed
        fact({ end: "2025-12-31", fp: "FY", val: 60, filed: "2026-02-01" }),
        fact({ end: "2025-03-31", fp: "Q1", val: 14 }),
      ],
    },
  },
  RevenueFromContractWithCustomerExcludingAssessedTax: {
    units: {
      USD: [
        fact({ end: "2025-12-31", fp: "FY", val: 65, filed: "2026-02-15" }),
      ],
    },
  },
  StockholdersEquity: {
    units: {
      USD: [
        fact({ end: "2025-09-30", fp: "Q3", val: 1_000 }),
        fact({ end: "2025-12-31", fp: "FY", val: 1_100 }),
      ],
    },
  },
};

describe("unitFacts", () => {
  it("returns the preferred unit when present", () => {
    expect(unitFacts(sample, "Revenues", "USD").length).toBe(4);
  });

  it("falls back to the first declared unit when preferred missing", () => {
    expect(unitFacts(sample, "Revenues").length).toBe(4);
  });

  it("returns empty for missing concept", () => {
    expect(unitFacts(sample, "MissingConcept")).toEqual([]);
  });
});

describe("firstAvailable", () => {
  it("returns the first concept in the chain that has data", () => {
    const hit = firstAvailable(sample, [
      "RevenueFromContractWithCustomerExcludingAssessedTax",
      "Revenues",
    ]);
    expect(hit?.concept).toBe(
      "RevenueFromContractWithCustomerExcludingAssessedTax",
    );
  });

  it("falls through when the first concept is empty", () => {
    const hit = firstAvailable(sample, ["MissingConcept", "Revenues"]);
    expect(hit?.concept).toBe("Revenues");
  });

  it("returns null when no concept in the chain has data", () => {
    expect(firstAvailable(sample, ["X", "Y"])).toBeNull();
  });
});

describe("dedupeByPeriod", () => {
  it("keeps the latest filed fact when (concept, end) repeats", () => {
    const facts = sample.Revenues!.units.USD!;
    const map = dedupeByPeriod(facts, (f) => f.fp === "FY");
    expect(map.get("2024-12-31")?.val).toBe(55); // restated value wins
  });

  it("filters out facts that fail the predicate", () => {
    const facts = sample.Revenues!.units.USD!;
    const map = dedupeByPeriod(facts, (f) => f.fp === "FY");
    expect(map.has("2025-03-31")).toBe(false); // Q1 excluded
  });
});

describe("isStandaloneQuarterFact", () => {
  // EDGAR's quarterly flow concepts (NetIncome, EPS, OCF, etc.) are
  // reported in TWO flavors per 10-Q filing:
  //   - standalone-quarter:  start ≈ end - 3 months  (~90 days)
  //   - YTD-cumulative:      start ≈ start of fiscal year (~180/270 days)
  // Summing trailing 4 quarters requires standalone values; including
  // YTDs double-counts and inflates TTM.
  it("returns true for a ~90-day period (standalone Q3)", () => {
    expect(
      isStandaloneQuarterFact({
        end: "2025-11-02",
        start: "2025-08-04",
        val: 2.59,
        fy: 2025,
        fp: "Q3",
        form: "10-Q",
        filed: "2025-12-11",
      }),
    ).toBe(true);
  });

  it("returns false for a ~270-day YTD-Q3 period", () => {
    expect(
      isStandaloneQuarterFact({
        end: "2025-11-02",
        start: "2025-02-03",
        val: 8.29,
        fy: 2025,
        fp: "Q3",
        form: "10-Q",
        filed: "2025-12-11",
      }),
    ).toBe(false);
  });

  it("returns false for a ~180-day YTD-Q2 period", () => {
    expect(
      isStandaloneQuarterFact({
        end: "2025-08-03",
        start: "2025-02-03",
        val: 5.7,
        fy: 2025,
        fp: "Q2",
        form: "10-Q",
        filed: "2025-09-04",
      }),
    ).toBe(false);
  });

  it("returns true for Q1 (standalone == YTD == ~90 days)", () => {
    expect(
      isStandaloneQuarterFact({
        end: "2025-05-04",
        start: "2025-02-03",
        val: 2.6,
        fy: 2025,
        fp: "Q1",
        form: "10-Q",
        filed: "2025-06-05",
      }),
    ).toBe(true);
  });

  it("returns false when start date is missing (cannot determine duration)", () => {
    expect(
      isStandaloneQuarterFact({
        end: "2025-11-02",
        val: 1,
        fy: 2025,
        fp: "Q3",
        form: "10-Q",
        filed: "2025-12-11",
      }),
    ).toBe(false);
  });
});

describe("standaloneQuarterlyMap", () => {
  it("picks the standalone-Q fact when both standalone and YTD are present (LULU regression)", () => {
    // Mimic LULU's actual EDGAR data: Q3 FY2025 has both YTD ($8.29)
    // and standalone ($2.59) entries. The standalone one must win.
    const facts: EdgarFactsByConcept = {
      EarningsPerShareDiluted: {
        units: {
          "USD/shares": [
            // Q3 YTD (Feb→Nov, ~270 days)
            {
              end: "2025-11-02",
              start: "2025-02-03",
              val: 8.29,
              fy: 2025,
              fp: "Q3",
              form: "10-Q",
              filed: "2025-12-11",
            },
            // Q3 standalone (Aug→Nov, ~90 days)
            {
              end: "2025-11-02",
              start: "2025-08-04",
              val: 2.59,
              fy: 2025,
              fp: "Q3",
              form: "10-Q",
              filed: "2025-12-11",
            },
          ],
        },
      },
    };
    const m = standaloneQuarterlyMap(facts, ["EarningsPerShareDiluted"]);
    expect(m.get("2025-11-02")?.val).toBe(2.59);
  });

  it("falls back to no-standalone-available behavior (returns empty) when only YTD facts exist", () => {
    const facts: EdgarFactsByConcept = {
      Revenues: {
        units: {
          USD: [
            {
              end: "2025-11-02",
              start: "2025-02-03",
              val: 8_000_000,
              fy: 2025,
              fp: "Q3",
              form: "10-Q",
              filed: "2025-12-11",
            },
          ],
        },
      },
    };
    const m = standaloneQuarterlyMap(facts, ["Revenues"]);
    expect(m.size).toBe(0);
  });
});

describe("deriveQ4FromAnnual", () => {
  // Companies file a 10-K (not 10-Q) for Q4 — EDGAR therefore has no
  // standalone-Q4 fact for income/cashflow concepts. We derive it as
  // FY annual minus standalone Q1+Q2+Q3.
  it("injects standalone Q4 = annual − (Q1+Q2+Q3) for each fiscal year", () => {
    // LULU FY2025: annual EPS $14.64, standalone Q1+Q2+Q3 = $8.29
    // → derived standalone Q4 = $14.64 − $8.29 = $6.35
    const quarterly = new Map<string, EdgarFact>([
      [
        "2025-05-04",
        { end: "2025-05-04", start: "2025-02-03", val: 2.6, fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-06-05" },
      ],
      [
        "2025-08-03",
        { end: "2025-08-03", start: "2025-05-05", val: 3.1, fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-09-04" },
      ],
      [
        "2025-11-02",
        { end: "2025-11-02", start: "2025-08-04", val: 2.59, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-12-11" },
      ],
    ]);
    const annual = new Map<string, EdgarFact>([
      [
        "2026-02-01",
        { end: "2026-02-01", start: "2025-02-03", val: 14.64, fy: 2025, fp: "FY", form: "10-K", filed: "2026-03-21" },
      ],
    ]);

    const enriched = deriveQ4FromAnnual(quarterly, annual);
    expect(enriched.size).toBe(4);
    const q4 = enriched.get("2026-02-01");
    expect(q4).toBeDefined();
    expect(q4!.fp).toBe("Q4");
    expect(q4!.fy).toBe(2025);
    expect(q4!.val).toBeCloseTo(14.64 - 8.29, 5);
  });

  it("does not inject Q4 when the fiscal year is missing one of Q1/Q2/Q3", () => {
    const quarterly = new Map<string, EdgarFact>([
      ["2025-05-04", { end: "2025-05-04", start: "2025-02-03", val: 2.6, fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-06-05" }],
      ["2025-08-03", { end: "2025-08-03", start: "2025-05-05", val: 3.1, fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-09-04" }],
      // Q3 missing
    ]);
    const annual = new Map<string, EdgarFact>([
      ["2026-02-01", { end: "2026-02-01", start: "2025-02-03", val: 14.64, fy: 2025, fp: "FY", form: "10-K", filed: "2026-03-21" }],
    ]);
    const enriched = deriveQ4FromAnnual(quarterly, annual);
    expect(enriched.size).toBe(2); // unchanged
  });

  it("does not inject Q4 when FY annual is missing", () => {
    const quarterly = new Map<string, EdgarFact>([
      ["2025-05-04", { end: "2025-05-04", start: "2025-02-03", val: 2.6, fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-06-05" }],
      ["2025-08-03", { end: "2025-08-03", start: "2025-05-05", val: 3.1, fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-09-04" }],
      ["2025-11-02", { end: "2025-11-02", start: "2025-08-04", val: 2.59, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-12-11" }],
    ]);
    const annual = new Map<string, EdgarFact>(); // empty
    const enriched = deriveQ4FromAnnual(quarterly, annual);
    expect(enriched.size).toBe(3); // unchanged
  });

  it("handles multiple fiscal years independently", () => {
    const quarterly = new Map<string, EdgarFact>([
      // FY2024 quarters
      ["2024-04-28", { end: "2024-04-28", start: "2024-01-29", val: 2.54, fy: 2024, fp: "Q1", form: "10-Q", filed: "2024-06-05" }],
      ["2024-07-28", { end: "2024-07-28", start: "2024-04-29", val: 3.15, fy: 2024, fp: "Q2", form: "10-Q", filed: "2024-09-04" }],
      ["2024-10-27", { end: "2024-10-27", start: "2024-07-29", val: 2.87, fy: 2024, fp: "Q3", form: "10-Q", filed: "2024-12-11" }],
      // FY2025 quarters
      ["2025-05-04", { end: "2025-05-04", start: "2025-02-03", val: 2.6, fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-06-05" }],
      ["2025-08-03", { end: "2025-08-03", start: "2025-05-05", val: 3.1, fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-09-04" }],
      ["2025-11-02", { end: "2025-11-02", start: "2025-08-04", val: 2.59, fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-12-11" }],
    ]);
    const annual = new Map<string, EdgarFact>([
      ["2025-02-02", { end: "2025-02-02", start: "2024-01-29", val: 12.2, fy: 2024, fp: "FY", form: "10-K", filed: "2025-03-21" }],
      ["2026-02-01", { end: "2026-02-01", start: "2025-02-03", val: 14.64, fy: 2025, fp: "FY", form: "10-K", filed: "2026-03-21" }],
    ]);
    const enriched = deriveQ4FromAnnual(quarterly, annual);
    expect(enriched.size).toBe(8);
    expect(enriched.get("2025-02-02")?.val).toBeCloseTo(12.2 - 8.56, 5);
    expect(enriched.get("2026-02-01")?.val).toBeCloseTo(14.64 - 8.29, 5);
  });
});

describe("annualMap / quarterlyMap / balanceMap", () => {
  it("annualMap returns only FY periods", () => {
    const m = annualMap(sample, ["Revenues"]);
    expect([...m.keys()].sort()).toEqual(["2024-12-31", "2025-12-31"]);
  });

  it("quarterlyMap returns only Q* periods", () => {
    const m = quarterlyMap(sample, ["Revenues"]);
    expect([...m.keys()]).toEqual(["2025-03-31"]);
  });

  it("balanceMap returns FY and Q* periods (point-in-time snapshots)", () => {
    const m = balanceMap(sample, ["StockholdersEquity"]);
    expect([...m.keys()].sort()).toEqual(["2025-09-30", "2025-12-31"]);
  });
});
