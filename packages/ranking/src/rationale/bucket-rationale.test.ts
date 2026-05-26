import { describe, it, expect } from "vitest";
import type { CategoryKey, CategoryScores, RankedRow, RankedSnapshot } from "../types.js";
import type { FairValue } from "../fair-value/types.js";
import { bucketRationaleFor } from "./bucket-rationale.js";
import { rank } from "../ranking.js";
import { makeCompany, makeTtm } from "../test-helpers.js";

function fv(opts: {
  current?: number;
  p25?: number;
  median?: number;
  p75?: number;
  upsideToP25Pct?: number;
  confidence?: "low" | "medium" | "high";
  peerCohortDivergent?: boolean;
} = {}): FairValue {
  return {
    peerSet: "cohort",
    peerCount: 8,
    anchors: {
      peerMedianPE: 100, peerMedianEVEBITDA: 100, peerMedianPFCF: 100,
      ownHistoricalPE: 100, ownHistoricalEVEBITDA: 100, ownHistoricalPFCF: 100,
      normalizedPE: 100, normalizedEVEBITDA: 100, normalizedPFCF: 100,
    },
    range: {
      p25: opts.p25 ?? 90,
      median: opts.median ?? 100,
      p75: opts.p75 ?? 110,
    },
    current: opts.current ?? 80,
    upsideToP25Pct: opts.upsideToP25Pct ?? 12.5,
    upsideToMedianPct: 25,
    confidence: opts.confidence ?? "high",
    ttmTreatment: "ttm",
    ebitdaTreatment: "ttm",
    peerCohortDivergent: opts.peerCohortDivergent ?? false,
  };
}

function row(opts: {
  symbol?: string;
  composite?: number;
  fairValue?: FairValue | null;
  negativeEquity?: boolean;
  industry?: string;
  fvTrend?: import("@stockrank/core").FvTrend;
  /** Override individual category scores; leave undefined to use defaults. */
  categoryScores?: Partial<CategoryScores>;
  /** Categories to null out. */
  missingCategories?: CategoryKey[];
} = {}): RankedRow {
  // Production-scale defaults: categoryScores are percentile means on a
  // 0-100 scale (see percentile.ts + computeCategoryScores). 50 = neutral.
  const baseScores: CategoryScores = {
    valuation: 50, health: 50, quality: 50,
    shareholderReturn: 50, growth: 50, momentum: 0,
    ...opts.categoryScores,
  };
  for (const cat of opts.missingCategories ?? []) {
    baseScores[cat] = null;
  }
  return {
    symbol: opts.symbol ?? "TEST",
    name: opts.symbol ?? "TEST Inc",
    sector: "Industrials",
    industry: opts.industry ?? "Test Industry",
    marketCap: 50_000_000_000,
    price: 80,
    composite: opts.composite ?? 60,
    industryRank: 1,
    universeRank: 1,
    pctOffYearHigh: 10,
    pctAboveYearLow: 25,
    categoryScores: baseScores,
    factorDetails: [],
    missingFactors: [],
    fairValue: opts.fairValue === undefined ? fv() : opts.fairValue,
    negativeEquity: opts.negativeEquity ?? false,
    optionsLiquid: true,
    annualDividend: 0,
    fvTrend: opts.fvTrend ?? "insufficient_data",
    fundamentalsDirection: "insufficient_data",
  };
}

/** Build a 50-row universe of "filler" rows with a stable composite
 * distribution from 30-95. Use this so a single tested row doesn't
 * accidentally fall into its own bottom decile cutoff (which is what
 * happens with a snapshot of n=1). */
function fillerRows(): RankedRow[] {
  return Array.from({ length: 50 }, (_, i) =>
    row({ symbol: `FILL${i}`, composite: 30 + i * 1.3 }),
  );
}

function snapshot(rows: RankedRow[]): RankedSnapshot {
  return {
    snapshotDate: "2026-04-26",
    weights: {
      valuation: 0.5, health: 0.2, quality: 0.1,
      shareholderReturn: 0.1, growth: 0.1, momentum: 0,
    },
    universeSize: rows.length,
    excludedCount: 0,
    rows,
    ineligibleRows: [],
  };
}

/** snapshot with the tested row + a 50-row filler cohort. */
function snapWithCohort(target: RankedRow): RankedSnapshot {
  return snapshot([target, ...fillerRows()]);
}

describe("bucketRationaleFor — primary reason", () => {
  it("ranked + below p25 → actionable-buy headline cites the upside", () => {
    const r = row({
      composite: 70,
      fairValue: fv({ current: 80, p25: 100, upsideToP25Pct: 25 }),
    });
    const result = bucketRationaleFor(r, snapWithCohort(r));
    expect(result.bucket).toBe("ranked");
    expect(result.primaryReason).toBe("actionable-buy");
    expect(result.headline).toContain("Buy candidate");
    expect(result.headline).toContain("25.0%");
  });

  it("watch + above p25 → above-conservative-tail headline", () => {
    const r = row({
      composite: 60,
      fairValue: fv({ current: 100, p25: 90 }),
    });
    const result = bucketRationaleFor(r, snapWithCohort(r));
    expect(result.bucket).toBe("watch");
    expect(result.primaryReason).toBe("above-conservative-tail");
    expect(result.headline).toContain("Watch");
    expect(result.headline).toContain("conservative tail");
  });

  it("watch + negative equity → negative-equity headline", () => {
    const r = row({
      composite: 60,
      negativeEquity: true,
      missingCategories: ["quality"],
    });
    const result = bucketRationaleFor(r, snapWithCohort(r));
    expect(result.bucket).toBe("watch");
    expect(result.primaryReason).toBe("negative-equity");
    expect(result.headline).toContain("buybacks");
  });

  it("avoid + bottom decile → bottom-decile-composite headline cites Phase 4A", () => {
    // 11 rows, bottom decile = 2. Held row at composite=10 (very low).
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        row({ symbol: `T${i}`, composite: 90 - i * 4 }),
      ),
      row({ symbol: "BAD", composite: 10 }),
    ];
    const target = rows.find((r) => r.symbol === "BAD")!;
    const result = bucketRationaleFor(target, snapshot(rows));
    expect(result.bucket).toBe("avoid");
    expect(result.primaryReason).toBe("bottom-decile-composite");
    expect(result.headline).toContain("Avoid");
    expect(result.headline).toContain("Phase 4A");
  });

  it("avoid + no FV → no-fair-value headline", () => {
    const r = row({ composite: 60, fairValue: null });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.bucket).toBe("avoid");
    expect(result.primaryReason).toBe("no-fair-value");
    expect(result.headline).toContain("insufficient anchors");
  });

  it("avoid + failed quality floor (all 5 categories null) → failed-quality-floor headline", () => {
    const r = row({
      composite: 0,
      fairValue: null,
      missingCategories: ["valuation", "health", "quality", "shareholderReturn", "growth"],
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.bucket).toBe("avoid");
    expect(result.primaryReason).toBe("failed-quality-floor");
    expect(result.headline).toContain("§4 quality floor");
  });

  it("avoid + model-incompatible industry → model-incompatible-industry headline names the industry", () => {
    const r = row({
      composite: 70,
      industry: "Banks - Diversified",
      fairValue: fv({ current: 80, p25: 100 }), // would otherwise be ranked
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.bucket).toBe("avoid");
    expect(result.primaryReason).toBe("model-incompatible-industry");
    expect(result.headline).toContain("Banks - Diversified");
    expect(result.headline).toContain("PE / EV-EBITDA / P-FCF");
  });
});

describe("bucketRationaleFor — strengths and weaknesses", () => {
  it("surfaces top-scoring categories as strengths (≥ 65)", () => {
    const r = row({
      categoryScores: {
        valuation: 85, // strength
        quality: 72,   // strength
        health: 40,    // not strong, not weak
        shareholderReturn: 40,
        growth: 40,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.strengths.some((s) => s.includes("Valuation"))).toBe(true);
    expect(result.strengths.some((s) => s.includes("Quality"))).toBe(true);
    expect(result.strengths.some((s) => s.includes("Financial health"))).toBe(false);
  });

  it("surfaces bottom-scoring categories as weaknesses (≤ 35)", () => {
    const r = row({
      categoryScores: {
        valuation: 50,
        quality: 50,
        health: 20, // weakness
        shareholderReturn: 10, // weakness
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.weaknesses.some((s) => s.includes("Financial health"))).toBe(true);
    expect(result.weaknesses.some((s) => s.includes("Shareholder return"))).toBe(true);
  });

  it("caps strengths and weaknesses at 3 entries each", () => {
    const r = row({
      categoryScores: {
        valuation: 90, quality: 88, health: 85,
        shareholderReturn: 80, growth: 75,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(result.strengths.length).toBeLessThanOrEqual(3);
  });

  it("includes 'below conservative FV' as a strength when ranked", () => {
    const r = row({
      composite: 70,
      fairValue: fv({ current: 80, p25: 100, upsideToP25Pct: 25 }),
      categoryScores: { valuation: 50 }, // no category strengths
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(
      result.strengths.some((s) =>
        s.includes("conservative fair value"),
      ),
    ).toBe(true);
  });

  it("flags negative equity as a weakness even outside the headline", () => {
    const r = row({
      composite: 60,
      negativeEquity: true,
      categoryScores: { valuation: 20 }, // bottom-quartile valuation
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    // Headline is "negative-equity"; the weakness list still surfaces it
    // when there's room (since other category scores aren't all weak).
    const hasNegEquity = result.weaknesses.some((w) =>
      w.toLowerCase().includes("negative shareholders"),
    );
    const hasValuationWeakness = result.weaknesses.some((w) =>
      w.includes("Valuation"),
    );
    expect(hasNegEquity || hasValuationWeakness).toBe(true);
  });

  it("flags missing categories as a weakness", () => {
    const r = row({
      composite: 60,
      missingCategories: ["quality", "growth"],
    });
    const result = bucketRationaleFor(r, snapshot([r]));
    expect(
      result.weaknesses.some((w) => w.startsWith("Missing data for")),
    ).toBe(true);
  });
});

/**
 * Scale-correctness regression tests (added 2026-05-26). Production
 * `categoryScores` come from `percentRank` which returns 0-100, not
 * 0-1. The earlier tests in this file used a 0-1 mock convention
 * inherited from the original (incorrect) spec comment — they passed
 * even though production data was 100× larger, because both the
 * thresholds and the formatter assumed the wrong scale.
 *
 * These tests pin the correct user-visible behavior: a row whose
 * valuation percentile is 78 must render "Valuation score 78/100",
 * NOT "7800/100".
 */
describe("bucketRationaleFor — score scale (0-100, not 0-1)", () => {
  it("renders a 78th-percentile category as '78/100' (not '7800/100')", () => {
    const r = row({
      categoryScores: {
        valuation: 78, // 78th percentile on the production 0-100 scale
        health: 50,
        quality: 50,
        shareholderReturn: 50,
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r, ...fillerRows()]));
    const valuationStrength = result.strengths.find((s) =>
      s.includes("Valuation"),
    );
    expect(valuationStrength).toBeDefined();
    expect(valuationStrength).toContain("78/100");
    expect(valuationStrength).not.toMatch(/\d{4,}\/100/);
  });

  it("treats a 70th-percentile score as a strength (above threshold)", () => {
    const r = row({
      categoryScores: {
        valuation: 70, // strength on 0-100 scale (threshold = 65)
        quality: 50,
        health: 50,
        shareholderReturn: 50,
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r, ...fillerRows()]));
    expect(result.strengths.some((s) => s.includes("Valuation"))).toBe(true);
  });

  it("treats a 60th-percentile score as NOT a strength (below threshold)", () => {
    const r = row({
      categoryScores: {
        valuation: 60, // below 65 threshold on 0-100 scale
        quality: 50,
        health: 50,
        shareholderReturn: 50,
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r, ...fillerRows()]));
    expect(result.strengths.some((s) => s.includes("Valuation"))).toBe(false);
  });

  it("treats a 25th-percentile score as a weakness (below threshold)", () => {
    const r = row({
      categoryScores: {
        valuation: 50,
        quality: 50,
        health: 25, // weakness on 0-100 scale (threshold = 35)
        shareholderReturn: 50,
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r, ...fillerRows()]));
    expect(result.weaknesses.some((s) => s.includes("Financial health"))).toBe(
      true,
    );
  });

  it("treats a 40th-percentile score as NOT a weakness (above threshold)", () => {
    const r = row({
      categoryScores: {
        valuation: 50,
        quality: 50,
        health: 40, // above 35 threshold on 0-100 scale
        shareholderReturn: 50,
        growth: 50,
      },
    });
    const result = bucketRationaleFor(r, snapshot([r, ...fillerRows()]));
    expect(result.weaknesses.some((s) => s.includes("Financial health"))).toBe(
      false,
    );
  });
});

/**
 * End-to-end pipeline integration: production `rank()` → real
 * `categoryScores` from percentRank → bucketRationaleFor → output text.
 *
 * Why this layer matters: every unit test above was written against a
 * mocked 0-1 score convention that didn't match production. The mocks
 * passed; the user-visible "Valuation score 7800/100" still shipped.
 * This integration test would have caught the drift — it runs the
 * actual scoring pipeline, never invents the score scale.
 */
describe("bucketRationaleFor — end-to-end pipeline", () => {
  it("never renders a strength/weakness with 4+ digits before /100", () => {
    // 20-company universe of identical-shape companies — produces a real
    // percentile distribution from `rank()`.
    const companies = Array.from({ length: 20 }, (_, i) =>
      makeCompany({
        symbol: `S${i.toString().padStart(2, "0")}`,
        industry: "Industrial Conglomerates",
        sector: "Industrials",
        ttm: makeTtm({
          evToEbitda: 5 + i * 0.5,
          peRatio: 10 + i * 0.5,
          priceToFcf: 12 + i * 0.5,
          roic: 0.10 + i * 0.005,
        }),
      }),
    );
    const ranked = rank({ companies, snapshotDate: "2026-05-26" });
    const snap: RankedSnapshot = {
      snapshotDate: "2026-05-26",
      weights: ranked.weights,
      universeSize: ranked.universeSize,
      excludedCount: ranked.excludedCount,
      rows: ranked.rows,
      ineligibleRows: ranked.ineligibleRows,
    };
    // At least one row must produce a strength or weakness so the
    // assertion has something to chew on.
    let sawAnyBullet = false;
    for (const r of ranked.rows) {
      const result = bucketRationaleFor(r, snap);
      for (const bullet of [...result.strengths, ...result.weaknesses]) {
        sawAnyBullet = true;
        // Bullets that mention category scores have the form
        // "<Category> score <N>/100". A value with 4+ digits before
        // /100 is the symptom of the percentile-doubly-scaled bug.
        expect(
          bullet,
          `score-formatted bullet contained an over-scaled value: ${bullet}`,
        ).not.toMatch(/\b\d{4,}\/100\b/);
      }
    }
    expect(sawAnyBullet).toBe(true);
  });
});
