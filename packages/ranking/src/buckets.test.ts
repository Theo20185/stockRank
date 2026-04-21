import { describe, it, expect } from "vitest";
import type { CategoryScores, FactorContribution, FactorKey, RankedRow } from "./types.js";
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
    upsideToP25Pct: 12.5,   // (90 - 80) / 80
    upsideToMedianPct: upside,
    confidence: "high",
    ttmTreatment: "ttm",
  };
}

function fvAtP25(): FairValue {
  // current = p25, so NOT strictly below the conservative tail
  return { ...fv(20), current: 90, upsideToP25Pct: 0 };
}

function detail(key: FactorKey, rawValue: number | null): FactorContribution {
  return { key, category: "quality", rawValue, percentile: rawValue === null ? null : 50 };
}

function row(opts: {
  symbol?: string;
  qualityScore?: number | null;
  hasPB?: boolean;
  hasROIC?: boolean;
  fairValue?: FairValue | null;
  missing?: FactorKey[];
  negativeEquity?: boolean;
  optionsLiquid?: boolean;
}): RankedRow {
  const factorDetails: FactorContribution[] = [
    detail("priceToBook", opts.hasPB === false ? null : 2.5),
    detail("roic", opts.hasROIC === false ? null : 0.15),
  ];
  const missingFactors: FactorKey[] = opts.missing ?? [
    ...(opts.hasPB === false ? ["priceToBook" as FactorKey] : []),
    ...(opts.hasROIC === false ? ["roic" as FactorKey] : []),
  ];
  const categoryScores: CategoryScores = {
    valuation: 0.5, health: 0.5, growth: 0.5, shareholderReturn: 0.5,
    quality: opts.qualityScore === undefined ? 0.6 : opts.qualityScore,
  };
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
    categoryScores,
    factorDetails,
    missingFactors,
    fairValue: opts.fairValue === undefined ? fv(20) : opts.fairValue,
    negativeEquity: opts.negativeEquity ?? false,
    optionsLiquid: opts.optionsLiquid ?? true,
  };
}

describe("classifyRow", () => {
  it("ranked: below conservative tail + complete data + liquid options", () => {
    expect(classifyRow(row({}))).toBe("ranked");
  });

  it("watch: missing one of {quality, P/B, ROIC}", () => {
    expect(classifyRow(row({ qualityScore: null }))).toBe("watch");
    expect(classifyRow(row({ hasPB: false }))).toBe("watch");
    expect(classifyRow(row({ hasROIC: false }))).toBe("watch");
  });

  it("watch: stock is at or above the conservative tail (current ≥ p25)", () => {
    expect(classifyRow(row({ fairValue: fvAtP25() }))).toBe("watch");
  });

  it("watch: illiquid options chain demotes from ranked", () => {
    expect(classifyRow(row({ optionsLiquid: false }))).toBe("watch");
  });

  it("excluded: missing two of {quality, P/B, ROIC}", () => {
    expect(classifyRow(row({ qualityScore: null, hasPB: false }))).toBe("excluded");
    expect(classifyRow(row({ hasPB: false, hasROIC: false }))).toBe("excluded");
    expect(classifyRow(row({ qualityScore: null, hasROIC: false }))).toBe("excluded");
  });

  it("excluded: missing all three", () => {
    expect(classifyRow(row({ qualityScore: null, hasPB: false, hasROIC: false }))).toBe(
      "excluded",
    );
  });

  it("excluded: no fair value at all (cannot determine upside)", () => {
    expect(classifyRow(row({ fairValue: null }))).toBe("excluded");
  });

  it("excluded: fair value present but range is null", () => {
    const noRange = { ...fv(null), range: null };
    expect(classifyRow(row({ fairValue: noRange }))).toBe("excluded");
  });

  it("excluded: missing 2+ wins over fair-value status", () => {
    // Even with positive upside, missing 2 signals → excluded.
    expect(classifyRow(row({ qualityScore: null, hasPB: false, fairValue: fv(20) }))).toBe(
      "excluded",
    );
  });

  it("respects missingFactors when factorDetails would otherwise look populated", () => {
    // A row that lists priceToBook as missing but has a stale rawValue
    // should still be treated as missing.
    const r = row({});
    r.missingFactors = ["priceToBook"];
    expect(classifyRow(r)).toBe("watch");
  });
});

describe("classifyRow — negative-equity rows (BKNG, MCD, MO, etc.)", () => {
  it("watch: negative equity with quality + P/B + ROIC all missing (structural, not gap)", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        qualityScore: null,
        hasPB: false,
        hasROIC: false,
      })),
    ).toBe("watch");
  });

  it("watch: negative equity with positive upside still goes to watch (cannot be 'Ranked' without quality view)", () => {
    expect(
      classifyRow(row({
        negativeEquity: true,
        qualityScore: null,
        hasPB: false,
        hasROIC: false,
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
    const a = row({ symbol: "AAA" });                                       // ranked
    const b = row({ symbol: "BBB", fairValue: fvAtP25() });                 // watch (at conservative tail)
    const c = row({ symbol: "CCC", hasPB: false });                         // watch (1 missing)
    const d = row({ symbol: "DDD", qualityScore: null, hasROIC: false });   // excluded
    const e = row({ symbol: "EEE", fairValue: null });                      // excluded
    const f = row({ symbol: "FFF", optionsLiquid: false });                 // watch (illiquid)
    const result = bucketRows([a, b, c, d, e, f]);
    expect(result.ranked.map((r) => r.symbol)).toEqual(["AAA"]);
    expect(result.watch.map((r) => r.symbol).sort()).toEqual(["BBB", "CCC", "FFF"]);
    expect(result.excluded.map((r) => r.symbol)).toEqual(["DDD", "EEE"]);
  });

  it("returns empty buckets when given an empty list", () => {
    expect(bucketRows([])).toEqual({ ranked: [], watch: [], excluded: [] });
  });
});
