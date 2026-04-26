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
    // Earlier rule: missing===1 → watch, missing>=2 → excluded. Reverted
    // because that wasn't a data-driven decision — the composite score
    // already handles missing categories by averaging across what's
    // available. Thin-data rows now flow through the FV / belowP25 /
    // trend / liquid gates like any other row.
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
    // Until 2026-04-26 this test asserted Watch. The fvTrend rule
    // was removed after Phase 4C H10 audit showed declining-trend
    // names actually OUTPERFORM stable+improving by +5.30 pp at 3y
    // in PIT 2018-2023 + delisted, and within-noise in pre-COVID.
    // See docs/specs/backtest-actions-2026-04-26-phase4.md §3.
    expect(classifyRow(row({ fvTrend: "declining" }))).toBe("ranked");
  });

  it("ranked: stable / unknown FV trend does not demote", () => {
    expect(classifyRow(row({ fvTrend: "stable" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "insufficient_data" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "improving" }))).toBe("ranked");
  });

  // ---- fundamentalsDirection — informational only as of 2026-04-25 ----
  // The bucket classifier no longer demotes on fundamentalsDirection
  // (any value). Phase 2B PIT weight-validation evidence
  // (docs/specs/backtest-actions-2026-04-25-phase2.md §1) showed
  // the filter is regime-unstable: -5.36 pp at 3y in pre-COVID, the
  // opposite of what it should do. The fundamentalsDirection field
  // stays on RankedRow as informational; no bucket consequence.

  it("ranked: DECLINING fundamentals does NOT demote (Phase 2B rejected the filter)", () => {
    expect(
      classifyRow(row({ fundamentalsDirection: "declining" })),
    ).toBe("ranked");
  });

  it("ranked: STABLE fundamentals does NOT demote", () => {
    expect(
      classifyRow(row({ fundamentalsDirection: "stable" })),
    ).toBe("ranked");
  });

  it("ranked: INSUFFICIENT fundamentals data does NOT demote", () => {
    expect(
      classifyRow(row({ fundamentalsDirection: "insufficient_data" })),
    ).toBe("ranked");
  });

  it("ranked: IMPROVING fundamentals does NOT demote", () => {
    expect(
      classifyRow(row({ fundamentalsDirection: "improving" })),
    ).toBe("ranked");
  });

  it("ranked: both fundamentalsDirection and fvTrend declining → ranked (both rules removed)", () => {
    // Both fundamentalsDirection (Phase 2B, 2026-04-25) and fvTrend
    // (Phase 4C, 2026-04-26) demote-on-declining rules were removed
    // after PIT weight-validation evidence. A row with BOTH signals
    // declining now goes to Ranked, not Watch — the engine's only
    // remaining demotion conditions are price ≥ p25 (above FV) or
    // negative-equity / no-FV-range (excluded).
    expect(
      classifyRow(
        row({ fvTrend: "declining", fundamentalsDirection: "declining" }),
      ),
    ).toBe("ranked");
  });

  it("excluded: missing all 5 categories (ineligible-row stub)", () => {
    expect(
      classifyRow(
        row({
          missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
          fairValue: null,
        }),
      ),
    ).toBe("excluded");
  });

  it("excluded: ineligible-row stub even when fair value is somehow present", () => {
    // Failed-quality-floor names should still land in Excluded regardless
    // of whether a fair value happens to be computable.
    expect(
      classifyRow(
        row({
          missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
          fairValue: fv(20),
        }),
      ),
    ).toBe("excluded");
  });

  it("excluded: no fair value at all", () => {
    expect(classifyRow(row({ fairValue: null }))).toBe("excluded");
  });

  it("excluded: fair value present but range is null", () => {
    const noRange = { ...fv(null), range: null };
    expect(classifyRow(row({ fairValue: noRange }))).toBe("excluded");
  });

  // ---- Model-incompatible industries: hard-exclude ----
  // The engine's PE / EV-EBITDA / P-FCF anchors don't fit banks (no
  // meaningful EBITDA, deposits ≠ debt), capital markets (carry-comp
  // accounting), or reinsurers (claims-reserve accounting). Force
  // these to Excluded regardless of how attractive the FV looks —
  // it's a value the engine can't reliably compute.

  it("excluded: Banks - Regional industry (engine can't value bank balance sheets)", () => {
    expect(
      classifyRow(row({ symbol: "FITB", industry: "Banks - Regional", sector: "Financial Services" })),
    ).toBe("excluded");
  });

  it("excluded: Banks - Diversified industry", () => {
    expect(
      classifyRow(row({ symbol: "JPM", industry: "Banks - Diversified", sector: "Financial Services" })),
    ).toBe("excluded");
  });

  it("excluded: Capital Markets industry", () => {
    expect(
      classifyRow(row({ symbol: "SCHW", industry: "Capital Markets", sector: "Financial Services" })),
    ).toBe("excluded");
  });

  it("excluded: Insurance - Reinsurance industry", () => {
    expect(
      classifyRow(row({ symbol: "EG", industry: "Insurance - Reinsurance", sector: "Financial Services" })),
    ).toBe("excluded");
  });

  it("model-incompatible: hard-exclude wins over fair-value-attractive setup", () => {
    // Even with great category scores + below-p25 + improving fundamentals
    // + liquid options, JPM goes to Excluded because the model doesn't apply.
    expect(
      classifyRow(
        row({
          symbol: "JPM",
          industry: "Banks - Diversified",
          sector: "Financial Services",
          fundamentalsDirection: "improving",
        }),
      ),
    ).toBe("excluded");
  });

  it("does NOT exclude other Financial Services industries (Asset Management still allowed)", () => {
    // Asset Management has partial coverage (50% EV/EBITDA + P/FCF
    // missing). Soft-flag is handled in the fair-value confidence layer
    // (B2), not here. Bucket logic still allows it through.
    expect(
      classifyRow(row({ industry: "Asset Management", sector: "Financial Services" })),
    ).toBe("ranked");
  });

  it("does NOT exclude other Insurance subindustries (only Reinsurance)", () => {
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

  it("watch: negative equity with multiple categories null still gets Watch (not Excluded)", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        missingCategories: ["quality", "valuation"],
        fairValue: fv(50),
      })),
    ).toBe("watch");
  });

  it("excluded: negative equity but no fair value at all", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        fairValue: null,
      })),
    ).toBe("excluded");
  });
});

describe("bucketRows — Avoid bucket (Phase 4A)", () => {
  it("reassigns bottom-decile composites to Avoid (would otherwise be Ranked)", () => {
    // 10 ranked-eligible rows with varied composites. 10% = 1 →
    // the lowest-composite row gets reassigned to Avoid.
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
    // Build 5 rows: 4 normal ranked + 1 watch (price >= p25) with low composite.
    // The watch row's composite is bottom decile → Avoid wins.
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

  it("Excluded keeps priority over Avoid (failed-floor names don't get re-tagged)", () => {
    // Need enough eligible rows that the bottom-decile cutoff doesn't
    // sweep R1 in by accident. With 11 eligible rows and 10% = 2,
    // the cutoff is the 2nd-lowest composite among eligible rows; R1
    // at 90 is well above that.
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
    expect(result.excluded.map((r) => r.symbol)).toEqual(["INELIG"]);
    // 11 eligible × 10% = 1.1 → ceil = 2 → bottom 2 by composite go
    // to avoid: R1 (50) and R2 (55).
    expect(result.avoid.map((r) => r.symbol).sort()).toEqual(["R1", "R2"]);
    // INELIG (composite 0, excluded) is not in avoid.
    expect(result.avoid.find((r) => r.symbol === "INELIG")).toBeUndefined();
  });

  it("respects the avoidPercentile option", () => {
    const rows = [
      row({ symbol: "T1", composite: 90 }),
      row({ symbol: "T2", composite: 80 }),
      row({ symbol: "B1", composite: 30 }),
      row({ symbol: "B2", composite: 20 }),
      row({ symbol: "B3", composite: 10 }),
    ];
    // Default 10% of 5 = 1
    expect(bucketRows(rows).avoid.map((r) => r.symbol)).toEqual(["B3"]);
    // 60% of 5 = 3
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
    // Use avoidPercentile=0 so the bottom-decile reassignment doesn't
    // pull any of the small fixture's rows into Avoid (this test is
    // about the 3-way semantic partition, not the Avoid override).
    const a = row({ symbol: "AAA" });                                            // ranked
    const b = row({ symbol: "BBB", fairValue: fvAtP25() });                      // watch (at tail)
    const c = row({ symbol: "CCC", fvTrend: "declining" });                      // ranked (Phase 4C removed this demote)
    const d = row({ symbol: "DDD", optionsLiquid: false });                      // ranked (illiquid options no longer demotes)
    const e = row({ symbol: "EEE", fairValue: null });                           // excluded (no FV)
    const result = bucketRows([a, b, c, d, e], { avoidPercentile: 0 });
    expect(result.ranked.map((r) => r.symbol).sort()).toEqual(["AAA", "CCC", "DDD"]);
    expect(result.watch.map((r) => r.symbol).sort()).toEqual(["BBB"]);
    expect(result.avoid).toEqual([]);
    expect(result.excluded.map((r) => r.symbol)).toEqual(["EEE"]);
  });

  it("returns empty buckets when given an empty list", () => {
    expect(bucketRows([])).toEqual({ ranked: [], watch: [], avoid: [], excluded: [] });
  });
});
