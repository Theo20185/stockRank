import { describe, it, expect } from "vitest";
import type { CategoryKey, CategoryScores, RankedRow } from "./types.js";
import type { FairValue } from "./fair-value/types.js";
import { bucketRows, classifyRow } from "./buckets.js";

function fv(upside: number | null): FairValue {
  // current $80, p25 $90 → already below conservative tail (good for Ranked)
  return {
    peerSet: "cohort",
    peerCount: 8,
    anchors: {
      peerMedianPE: 100, peerMedianEVEBITDA: 100, peerMedianPFCF: 100,
      ownHistoricalPE: 100, ownHistoricalEVEBITDA: 100, ownHistoricalPFCF: 100,
      normalizedPE: 100, normalizedEVEBITDA: 100, normalizedPFCF: 100,
    },
    range: { p25: 90, median: 100, p75: 110 },
    current: 80,
    upsideToP25Pct: 12.5,
    upsideToMedianPct: upside,
    confidence: "high",
    ttmTreatment: "ttm",
    ebitdaTreatment: "ttm",
    peerCohortDivergent: false,
  };
}

function fvAtP25(): FairValue {
  return { ...fv(20), current: 90, upsideToP25Pct: 0 };
}

/** Build a RankedRow with a controlled categoryScores shape. Pass an
 * array of categories to null out for "missing" scenarios. */
function row(opts: {
  symbol?: string;
  /** Categories whose score should be null. */
  missingCategories?: CategoryKey[];
  fairValue?: FairValue | null;
  negativeEquity?: boolean;
  optionsLiquid?: boolean;
  fvTrend?: import("@stockrank/core").FvTrend;
  fundamentalsDirection?: import("./fundamentals.js").FundamentalsDirection;
  industry?: string;
  sector?: string;
  /** Composite score override. Default 50 — high enough that a 10-row
   * test fixture's bottom decile (1 row) doesn't accidentally pull
   * the fixture row into Avoid. Use a low value (e.g., 5) when you
   * want to test the Avoid bucket. */
  composite?: number;
}): RankedRow {
  const baseScores: CategoryScores = {
    valuation: 0.5, health: 0.5, quality: 0.6,
    shareholderReturn: 0.5, growth: 0.5,
  };
  for (const cat of opts.missingCategories ?? []) {
    baseScores[cat] = null;
  }
  return {
    symbol: opts.symbol ?? "TEST",
    name: opts.symbol ?? "TEST Inc",
    sector: opts.sector ?? "Industrials",
    industry: opts.industry ?? "Test Industry",
    marketCap: 50_000_000_000,
    price: 80,
    composite: opts.composite ?? 50,
    industryRank: 1,
    universeRank: 1,
    pctOffYearHigh: 10,
    pctAboveYearLow: 25,
    categoryScores: baseScores,
    factorDetails: [],
    missingFactors: [],
    fairValue: opts.fairValue === undefined ? fv(20) : opts.fairValue,
    negativeEquity: opts.negativeEquity ?? false,
    optionsLiquid: opts.optionsLiquid ?? true,
    annualDividend: 0,
    fvTrend: opts.fvTrend ?? "insufficient_data",
    fundamentalsDirection: opts.fundamentalsDirection ?? "insufficient_data",
  };
}

describe("classifyRow", () => {
  it("ranked: all 5 category scores present + below conservative tail + liquid options", () => {
    expect(classifyRow(row({}))).toBe("ranked");
  });

  it("ranked: missing some-but-not-all category scores no longer demotes", () => {
    expect(classifyRow(row({ missingCategories: ["quality"] }))).toBe("ranked");
    expect(classifyRow(row({ missingCategories: ["quality", "growth"] }))).toBe("ranked");
    expect(classifyRow(row({ missingCategories: ["valuation", "health", "growth"] }))).toBe("ranked");
  });

  it("watch: stock is at or above the conservative tail (current ≥ p25)", () => {
    expect(classifyRow(row({ fairValue: fvAtP25() }))).toBe("watch");
  });

  it("ranked: illiquid options chain does NOT demote from ranked (share-purchase strategy still actionable)", () => {
    expect(classifyRow(row({ optionsLiquid: false }))).toBe("ranked");
  });

  it("ranked: declining FV trend does NOT demote (Phase 4C H10 rejected the filter)", () => {
    expect(classifyRow(row({ fvTrend: "declining" }))).toBe("ranked");
  });

  it("ranked: stable / unknown FV trend does not demote", () => {
    expect(classifyRow(row({ fvTrend: "stable" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "insufficient_data" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "improving" }))).toBe("ranked");
  });

  // ---- fundamentalsDirection — informational only as of 2026-04-25 ----

  it("ranked: DECLINING fundamentals does NOT demote (Phase 2B rejected the filter)", () => {
    expect(classifyRow(row({ fundamentalsDirection: "declining" }))).toBe("ranked");
  });

  it("ranked: STABLE fundamentals does NOT demote", () => {
    expect(classifyRow(row({ fundamentalsDirection: "stable" }))).toBe("ranked");
  });

  it("ranked: INSUFFICIENT fundamentals data does NOT demote", () => {
    expect(classifyRow(row({ fundamentalsDirection: "insufficient_data" }))).toBe("ranked");
  });

  it("ranked: IMPROVING fundamentals does NOT demote", () => {
    expect(classifyRow(row({ fundamentalsDirection: "improving" }))).toBe("ranked");
  });

  it("ranked: both fundamentalsDirection and fvTrend declining → ranked (both rules removed)", () => {
    expect(
      classifyRow(
        row({ fvTrend: "declining", fundamentalsDirection: "declining" }),
      ),
    ).toBe("ranked");
  });

  // ---- Avoid bucket diagnostic sub-cases (formerly "Excluded") ----
  // 2026-04-26: Excluded was rolled into Avoid. classifyRow returns
  // "avoid" for failed-quality-floor, no-FV, model-incompatible-industry.
  // The per-stock rationale module surfaces the WHY on the detail page.

  it("avoid: missing all 5 categories (ineligible-row stub)", () => {
    expect(
      classifyRow(
        row({
          missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
          fairValue: null,
        }),
      ),
    ).toBe("avoid");
  });

  it("avoid: ineligible-row stub even when fair value is somehow present", () => {
    expect(
      classifyRow(
        row({
          missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
          fairValue: fv(20),
        }),
      ),
    ).toBe("avoid");
  });

  it("avoid: no fair value at all", () => {
    expect(classifyRow(row({ fairValue: null }))).toBe("avoid");
  });

  it("avoid: fair value present but range is null", () => {
    const noRange = { ...fv(null), range: null };
    expect(classifyRow(row({ fairValue: noRange }))).toBe("avoid");
  });

  // ---- Model-incompatible industries: hard-avoid ----

  it("avoid: Banks - Regional industry (engine can't value bank balance sheets)", () => {
    expect(
      classifyRow(row({ symbol: "FITB", industry: "Banks - Regional", sector: "Financial Services" })),
    ).toBe("avoid");
  });

  it("avoid: Banks - Diversified industry", () => {
    expect(
      classifyRow(row({ symbol: "JPM", industry: "Banks - Diversified", sector: "Financial Services" })),
    ).toBe("avoid");
  });

  it("avoid: Capital Markets industry", () => {
    expect(
      classifyRow(row({ symbol: "SCHW", industry: "Capital Markets", sector: "Financial Services" })),
    ).toBe("avoid");
  });

  it("avoid: Insurance - Reinsurance industry", () => {
    expect(
      classifyRow(row({ symbol: "EG", industry: "Insurance - Reinsurance", sector: "Financial Services" })),
    ).toBe("avoid");
  });

  it("model-incompatible: hard-avoid wins over fair-value-attractive setup", () => {
    expect(
      classifyRow(
        row({
          symbol: "JPM",
          industry: "Banks - Diversified",
          sector: "Financial Services",
          fundamentalsDirection: "improving",
        }),
      ),
    ).toBe("avoid");
  });

  it("does NOT avoid other Financial Services industries (Asset Management still allowed)", () => {
    expect(
      classifyRow(row({ industry: "Asset Management", sector: "Financial Services" })),
    ).toBe("ranked");
  });

  it("does NOT avoid other Insurance subindustries (only Reinsurance)", () => {
    expect(
      classifyRow(row({ industry: "Insurance - Property & Casualty", sector: "Financial Services" })),
    ).toBe("ranked");
    expect(
      classifyRow(row({ industry: "Insurance - Life", sector: "Financial Services" })),
    ).toBe("ranked");
  });
});

describe("classifyRow — negative-equity rows (BKNG, MCD, MO, etc.)", () => {
  it("watch: negative equity with Quality category null (structural, not gap)", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        missingCategories: ["quality"],
      })),
    ).toBe("watch");
  });

  it("watch: negative equity with multiple categories null still gets Watch (not Avoid)", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        missingCategories: ["quality", "valuation"],
        fairValue: fv(50),
      })),
    ).toBe("watch");
  });

  it("avoid: negative equity but no fair value at all", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        fairValue: null,
      })),
    ).toBe("avoid");
  });
});

describe("bucketRows — Avoid bucket (Phase 4A + diagnostic merge)", () => {
  it("reassigns bottom-decile composites to Avoid (would otherwise be Ranked)", () => {
    const rows = [
      row({ symbol: "T1", composite: 95 }),
      row({ symbol: "T2", composite: 90 }),
      row({ symbol: "T3", composite: 85 }),
      row({ symbol: "T4", composite: 80 }),
      row({ symbol: "T5", composite: 75 }),
      row({ symbol: "T6", composite: 70 }),
      row({ symbol: "T7", composite: 65 }),
      row({ symbol: "T8", composite: 60 }),
      row({ symbol: "T9", composite: 55 }),
      row({ symbol: "B1", composite: 5 }), // bottom
    ];
    const result = bucketRows(rows);
    expect(result.avoid.map((r) => r.symbol)).toEqual(["B1"]);
    expect(result.ranked.length).toBe(9);
    expect(result.ranked.map((r) => r.symbol)).not.toContain("B1");
  });

  it("Avoid takes priority over Watch (a watch-classified low-composite row goes to Avoid)", () => {
    const rows = [
      row({ symbol: "R1", composite: 90 }),
      row({ symbol: "R2", composite: 85 }),
      row({ symbol: "R3", composite: 80 }),
      row({ symbol: "R4", composite: 75 }),
      row({
        symbol: "WATCH_LOW",
        composite: 10,
        fairValue: fvAtP25(), // forces classifyRow → watch
      }),
    ];
    const result = bucketRows(rows);
    expect(result.avoid.map((r) => r.symbol)).toEqual(["WATCH_LOW"]);
    expect(result.watch.map((r) => r.symbol)).not.toContain("WATCH_LOW");
  });

  it("diagnostic-avoid (failed floor) and bottom-decile-avoid both land in same Avoid bucket", () => {
    // 2026-04-26 merge: previously the failed-floor row would have
    // gone to Excluded; now it lands in Avoid alongside bottom-decile
    // names. Both share the user-facing "don't buy" answer.
    const rows = [
      ...Array.from({ length: 11 }, (_, i) =>
        row({ symbol: `R${i + 1}`, composite: 50 + i * 5 }),
      ),
      row({
        symbol: "INELIG",
        composite: 0,
        missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
        fairValue: null,
      }),
    ];
    const result = bucketRows(rows);
    // INELIG (failed floor) + bottom-2 by composite (R1=50, R2=55) all in avoid.
    expect(result.avoid.map((r) => r.symbol).sort()).toEqual(["INELIG", "R1", "R2"]);
  });

  it("respects the avoidPercentile option", () => {
    const rows = [
      row({ symbol: "T1", composite: 90 }),
      row({ symbol: "T2", composite: 80 }),
      row({ symbol: "B1", composite: 30 }),
      row({ symbol: "B2", composite: 20 }),
      row({ symbol: "B3", composite: 10 }),
    ];
    expect(bucketRows(rows).avoid.map((r) => r.symbol)).toEqual(["B3"]);
    expect(
      bucketRows(rows, { avoidPercentile: 0.6 })
        .avoid.map((r) => r.symbol)
        .sort(),
    ).toEqual(["B1", "B2", "B3"]);
  });

  it("Avoid is empty when there are no eligible rows", () => {
    expect(bucketRows([]).avoid).toEqual([]);
  });
});

describe("bucketRows", () => {
  it("partitions rows into three buckets, preserving order within each", () => {
    const a = row({ symbol: "AAA" });                                            // ranked
    const b = row({ symbol: "BBB", fairValue: fvAtP25() });                      // watch (at tail)
    const c = row({ symbol: "CCC", fvTrend: "declining" });                      // ranked (Phase 4C removed this demote)
    const d = row({ symbol: "DDD", optionsLiquid: false });                      // ranked (illiquid options no longer demotes)
    const e = row({ symbol: "EEE", fairValue: null });                           // avoid (no FV)
    const result = bucketRows([a, b, c, d, e], { avoidPercentile: 0 });
    expect(result.ranked.map((r) => r.symbol).sort()).toEqual(["AAA", "CCC", "DDD"]);
    expect(result.watch.map((r) => r.symbol).sort()).toEqual(["BBB"]);
    expect(result.avoid.map((r) => r.symbol)).toEqual(["EEE"]);
  });

  it("returns empty buckets when given an empty list", () => {
    expect(bucketRows([])).toEqual({ ranked: [], watch: [], avoid: [] });
  });
});
