/**
 * End-to-end regression test for the LULU pattern.
 *
 * Background: LULU 2026 has rolled over from peak earnings ($14.64
 * FY2025) to flat ($13.26 TTM, $13.27 forward). Our FV-trend signal
 * still classifies it as "improving" because peer-cohort multiples
 * expanded; without the fundamentals-direction filter LULU would
 * sit in Candidates despite the deteriorating story.
 *
 * The fundamentalsDirection classifier (with the recent-decay
 * signal that compares TTM to peak-of-recent-annuals) flags LULU
 * as "declining"; the bucket classifier then demotes it to Watch.
 *
 * This test pins the entire path: company snapshot → rank() →
 * bucketRows() → Watch. Unit tests on the components alone (which
 * we have) can pass while this end-to-end behavior breaks. Catches
 * regressions in the wiring between layers.
 */

import { describe, expect, it } from "vitest";
import type { CompanySnapshot } from "@stockrank/core";
import { bucketRows, fairValueFor, rank } from "./index.js";
import { makeCompany, makePeriod, makeTtm } from "./test-helpers.js";

/** LULU-shape: peak FY2025 EPS $14.64, just-released FY2026 $13.26
 * (down 9.4% from peak), forward $13.27 (no recovery). FV-trend
 * defaults to "insufficient_data" — this test pins the bucket
 * regardless of fvTrend overlay. */
function makeLulu(): CompanySnapshot {
  // Build 7 annuals matching the snapshot we observed (newest first).
  const eps = [13.26, 14.64, 12.20, 6.68, 7.49, 4.50, 4.93];
  return makeCompany({
    symbol: "LULU",
    name: "Lululemon Athletica",
    sector: "Consumer Cyclical",
    industry: "Apparel Retail",
    marketCap: 16_900_000_000,
    quote: {
      price: 144.02,
      yearHigh: 340.25,
      yearLow: 143.19,
      volume: 0,
      averageVolume: 1_000_000,
    },
    ttm: makeTtm({
      peRatio: 144.02 / 13.26, // implies TTM EPS = $13.26
      forwardEps: 13.27,
      // The remaining TTM fields don't matter for the bucket rule;
      // leave defaults from makeTtm.
    }),
    annual: eps.map((v, i) => {
      const base = makePeriod({ fiscalYear: String(2026 - i) });
      // makePeriod does shallow merge — preserve all the other income
      // fields (netIncome, sharesDiluted, etc.) needed by quality
      // floor + factor scoring; just override EPS to LULU's value.
      return {
        ...base,
        income: { ...base.income, epsDiluted: v, netIncome: v * 1.2e8 },
      };
    }),
    pctOffYearHigh: 57.7,
    pctAboveYearLow: 0.6,
  });
}

/** Build a peer cohort large enough for the FV engine to compute a
 * stable peer-median anchor. Cohort is irrelevant to the bucket
 * decision — we just need fairValueFor to return a usable range so
 * the bucket logic doesn't fall to Excluded. */
function makePeerCohort(): CompanySnapshot[] {
  return Array.from({ length: 12 }, (_, i) =>
    makeCompany({
      symbol: `PEER${i.toString().padStart(2, "0")}`,
      industry: "Apparel Retail",
      sector: "Consumer Cyclical",
      marketCap: (15 + i) * 1e9,
      quote: {
        price: 80 + i * 5,
        yearHigh: 120 + i * 5,
        yearLow: 60 + i * 5,
        volume: 0,
        averageVolume: 1_000_000,
      },
    }),
  );
}

describe("LULU bucket placement (end-to-end regression)", () => {
  it("classifies LULU's snapshot as 'declining' fundamentals", () => {
    const universe = [makeLulu(), ...makePeerCohort()];
    const result = rank({
      companies: universe,
      snapshotDate: "2026-04-23",
    });
    const lulu = result.rows.find((r) => r.symbol === "LULU");
    expect(lulu).toBeDefined();
    expect(lulu!.fundamentalsDirection).toBe("declining");
  });

  it("places LULU in the Watch bucket — NOT Candidates", () => {
    const universe = [makeLulu(), ...makePeerCohort()];
    const result = rank({
      companies: universe,
      snapshotDate: "2026-04-23",
    });
    // Stamp fair value just like App.tsx does, so the bucket logic
    // can evaluate price-vs-p25.
    for (const row of result.rows) {
      const co = universe.find((c) => c.symbol === row.symbol);
      if (co) row.fairValue = fairValueFor(co, universe);
    }
    const buckets = bucketRows(result.rows);
    expect(buckets.watch.some((r) => r.symbol === "LULU")).toBe(true);
    expect(buckets.ranked.some((r) => r.symbol === "LULU")).toBe(false);
    expect(buckets.excluded.some((r) => r.symbol === "LULU")).toBe(false);
  });

  it("LULU stays in Watch even when fvTrend overlay is 'improving'", () => {
    // The web layer overlays fvTrend = "improving" for LULU from the
    // fv-trend.json artifact. The fundamentals-declining filter must
    // still demote regardless of the FV trend.
    const universe = [makeLulu(), ...makePeerCohort()];
    const result = rank({
      companies: universe,
      snapshotDate: "2026-04-23",
    });
    for (const row of result.rows) {
      const co = universe.find((c) => c.symbol === row.symbol);
      if (co) row.fairValue = fairValueFor(co, universe);
      if (row.symbol === "LULU") row.fvTrend = "improving";
    }
    const buckets = bucketRows(result.rows);
    expect(buckets.watch.some((r) => r.symbol === "LULU")).toBe(true);
  });
});
