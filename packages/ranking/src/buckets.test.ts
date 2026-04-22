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
    sector: "Industrials",
    industry: "Test Industry",
    marketCap: 50_000_000_000,
    price: 80,
    composite: 0.55,
    industryRank: 1,
    universeRank: 1,
    pctOffYearHigh: 10,
    categoryScores: baseScores,
    factorDetails: [],
    missingFactors: [],
    fairValue: opts.fairValue === undefined ? fv(20) : opts.fairValue,
    negativeEquity: opts.negativeEquity ?? false,
    optionsLiquid: opts.optionsLiquid ?? true,
    annualDividend: 0,
    fvTrend: opts.fvTrend ?? "insufficient_data",
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

  it("watch: illiquid options chain demotes from ranked", () => {
    expect(classifyRow(row({ optionsLiquid: false }))).toBe("watch");
  });

  it("watch: declining FV trend demotes from ranked (avoid until trend reverses)", () => {
    expect(classifyRow(row({ fvTrend: "declining" }))).toBe("watch");
  });

  it("ranked: stable / improving / unknown FV trend does not demote", () => {
    expect(classifyRow(row({ fvTrend: "stable" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "improving" }))).toBe("ranked");
    expect(classifyRow(row({ fvTrend: "insufficient_data" }))).toBe("ranked");
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

describe("bucketRows", () => {
  it("partitions rows into three buckets, preserving order within each", () => {
    const a = row({ symbol: "AAA" });                                            // ranked
    const b = row({ symbol: "BBB", fairValue: fvAtP25() });                      // watch (at tail)
    const c = row({ symbol: "CCC", fvTrend: "declining" });                      // watch (declining)
    const d = row({ symbol: "DDD", optionsLiquid: false });                      // watch (illiquid)
    const e = row({ symbol: "EEE", fairValue: null });                           // excluded (no FV)
    const result = bucketRows([a, b, c, d, e]);
    expect(result.ranked.map((r) => r.symbol)).toEqual(["AAA"]);
    expect(result.watch.map((r) => r.symbol).sort()).toEqual(["BBB", "CCC", "DDD"]);
    expect(result.excluded.map((r) => r.symbol)).toEqual(["EEE"]);
  });

  it("returns empty buckets when given an empty list", () => {
    expect(bucketRows([])).toEqual({ ranked: [], watch: [], excluded: [] });
  });
});
