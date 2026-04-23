import { describe, expect, it } from "vitest";
import {
  annualMap,
  balanceMap,
  dedupeByPeriod,
  firstAvailable,
  quarterlyMap,
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
