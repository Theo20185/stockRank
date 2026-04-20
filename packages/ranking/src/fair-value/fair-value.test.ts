import { describe, it, expect } from "vitest";
import type { CompanySnapshot } from "@stockrank/core";
import { fairValueFor, buildFairValueCohort } from "./index.js";
import { makeCompany, makePeriod, makeTtm } from "../test-helpers.js";

function buildPharmaPeer(symbol: string, marketCap: number, peMultiple: number): CompanySnapshot {
  return makeCompany({
    symbol,
    industry: "Pharmaceuticals",
    sector: "Healthcare",
    marketCap,
    ttm: makeTtm({
      peRatio: peMultiple,
      evToEbitda: 14,
      priceToFcf: 22,
    }),
  });
}

describe("buildFairValueCohort", () => {
  it("returns 'cohort' when ≥ 8 peers share industry + cap bucket", () => {
    const subject = buildPharmaPeer("NVO", 150_000_000_000, 10);
    const peers = Array.from({ length: 10 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 100_000_000_000, 18),
    );
    const cohort = buildFairValueCohort(subject, [subject, ...peers]);
    expect(cohort.peerSet).toBe("cohort");
    expect(cohort.peers).toHaveLength(10);
  });

  it("returns 'narrow' when 3 ≤ N < 8 peers in cohort", () => {
    const subject = buildPharmaPeer("NVO", 150_000_000_000, 10);
    const peers = Array.from({ length: 4 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 100_000_000_000, 18),
    );
    const cohort = buildFairValueCohort(subject, [subject, ...peers]);
    expect(cohort.peerSet).toBe("narrow");
  });

  it("falls back to 'industry' when cap-bucketed cohort is too thin", () => {
    const subject = buildPharmaPeer("NVO", 150_000_000_000, 10);
    // Only 2 large-cap pharma peers but plenty of mid-caps
    const peers = [
      buildPharmaPeer("LP1", 100_000_000_000, 18),
      buildPharmaPeer("LP2", 100_000_000_000, 18),
      ...Array.from({ length: 5 }, (_, i) =>
        buildPharmaPeer(`MP${i}`, 5_000_000_000, 18),
      ),
    ];
    const cohort = buildFairValueCohort(subject, [subject, ...peers]);
    expect(cohort.peerSet).toBe("industry");
    expect(cohort.peers.length).toBe(7);
  });

  it("excludes the subject from its own peers", () => {
    const subject = buildPharmaPeer("NVO", 150_000_000_000, 10);
    const peers = Array.from({ length: 10 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 100_000_000_000, 18),
    );
    const cohort = buildFairValueCohort(subject, [subject, ...peers]);
    expect(cohort.peers.find((p) => p.symbol === "NVO")).toBeUndefined();
  });
});

describe("fairValueFor", () => {
  it("computes a fair-value range above the current price for a cheap subject", () => {
    // Subject has TTM EPS 5, trading at $30 (P/E 6).
    // Peers have P/E 18 → implied price = 5 × 18 = $90. So we expect a range
    // with median well above $30.
    const subject = makeCompany({
      symbol: "CHEAP",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      marketCap: 30_000_000_000,
      quote: { price: 30, yearHigh: 45, yearLow: 28, volume: 0, averageVolume: 1_000_000 },
      ttm: makeTtm({ peRatio: 6, evToEbitda: 5, priceToFcf: 8 }),
      annual: Array.from({ length: 5 }, (_, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: {
            ...makePeriod().income,
            epsDiluted: 5,
            ebitda: 12_000_000_000,
            sharesDiluted: 1_000_000_000,
          },
          cashFlow: { ...makePeriod().cashFlow, freeCashFlow: 4_000_000_000 },
        }),
      ),
    });
    const peers = Array.from({ length: 10 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 30_000_000_000, 18),
    );

    const fv = fairValueFor(subject, [subject, ...peers]);

    expect(fv.range).not.toBeNull();
    expect(fv.range!.median).toBeGreaterThan(50);
    expect(fv.upsideToMedianPct).toBeGreaterThan(50);
    expect(fv.peerSet).toBe("cohort");
  });

  it("returns confidence 'low' when peer set is sparse", () => {
    const subject = makeCompany({
      symbol: "X",
      industry: "Lonely Industry",
      sector: "Lonely Sector",
      ttm: makeTtm({ peRatio: 6 }),
    });
    const fv = fairValueFor(subject, [subject]);
    expect(fv.peerSet).toBe("sector");
    expect(fv.confidence).toBe("low");
  });

  it("excludes negative-EPS peers from the P/E anchor (drops them, doesn't crash)", () => {
    const subject = makeCompany({
      symbol: "S",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 12 }),
    });
    const peers = [
      buildPharmaPeer("LOSS", 50_000_000_000, -5), // negative P/E peer
      ...Array.from({ length: 9 }, (_, i) =>
        buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
      ),
    ];
    const fv = fairValueFor(subject, [subject, ...peers]);
    // Should not include the loss-maker's "P/E" of -5 in the median.
    expect(fv.anchors.peerMedianPE).not.toBeNull();
    expect(fv.anchors.peerMedianPE!).toBeGreaterThan(0);
  });
});
