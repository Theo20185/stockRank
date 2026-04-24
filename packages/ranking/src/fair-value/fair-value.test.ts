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

  // B2 (Munger discipline): when fewer than 6 of 9 anchors fire,
  // force confidence to 'low'. Even at the boundary (5 anchors, good
  // spread, cohort peer set) the engine shouldn't claim medium.
  it("computeConfidence(cohort, 5 anchors, tight spread) returns 'low' (B2 boundary)", async () => {
    const { computeConfidence } = await import("./index.js");
    const tightRange = { p25: 100, median: 110, p75: 120 }; // spread 1.2x
    expect(computeConfidence("cohort", 5, tightRange)).toBe("low");
  });

  it("computeConfidence(cohort, 6 anchors, tight spread) returns 'high' (preserved)", async () => {
    const { computeConfidence } = await import("./index.js");
    const tightRange = { p25: 100, median: 110, p75: 120 };
    expect(computeConfidence("cohort", 6, tightRange)).toBe("high");
  });

  it("computeConfidence(cohort, 4 anchors, tight spread) returns 'low' (B2)", async () => {
    const { computeConfidence } = await import("./index.js");
    const tightRange = { p25: 100, median: 110, p75: 120 };
    expect(computeConfidence("cohort", 4, tightRange)).toBe("low");
  });

  it("returns confidence 'low' when fewer than 6 of 9 anchors fire (TROW pattern)", () => {
    // Build a subject with positive TTM PE but no EBITDA / FCF data —
    // exercises the asset-manager pattern where only PE anchors fire.
    const subject = makeCompany({
      symbol: "TROW_LIKE",
      industry: "Asset Management",
      sector: "Financial Services",
      ttm: makeTtm({
        peRatio: 11,
        evToEbitda: null, // forces peer-EVE + own-EVE + normalized-EVE → null
        priceToFcf: null, // forces all P/FCF anchors → null
      }),
      annual: Array.from({ length: 5 }, (_, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: {
            revenue: 7e9,
            grossProfit: 3e9,
            operatingIncome: 2e9,
            ebit: 2e9,
            ebitda: null, // no EBITDA → all EV/EBITDA anchors fail
            interestExpense: 50e6,
            netIncome: 2e9,
            epsDiluted: 9,
            sharesDiluted: 220_000_000,
          },
          cashFlow: {
            operatingCashFlow: 2.2e9,
            capex: -200e6,
            freeCashFlow: null, // no FCF → all P/FCF anchors fail
            dividendsPaid: 1e9,
            buybacks: 500e6,
          },
        }),
      ),
    });
    const peers = Array.from({ length: 10 }, (_, i) =>
      makeCompany({
        symbol: `PEER${i}`,
        industry: "Asset Management",
        sector: "Financial Services",
        ttm: makeTtm({
          peRatio: 18 + i,
          evToEbitda: null,
          priceToFcf: null,
        }),
        annual: Array.from({ length: 5 }, (_, j) =>
          makePeriod({
            fiscalYear: String(2025 - j),
            income: {
              revenue: 7e9, grossProfit: 3e9, operatingIncome: 2e9,
              ebit: 2e9, ebitda: null, interestExpense: 50e6,
              netIncome: 2e9, epsDiluted: 9, sharesDiluted: 220_000_000,
            },
            cashFlow: {
              operatingCashFlow: 2.2e9, capex: -200e6, freeCashFlow: null,
              dividendsPaid: 1e9, buybacks: 500e6,
            },
          }),
        ),
      }),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    // Count actual anchors fired
    const fired = Object.values(fv.anchors).filter(
      (v) => v !== null && v !== undefined,
    ).length;
    expect(fired).toBeLessThan(6);
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

describe("fairValueFor — peer-cohort divergence (D+E hybrid)", () => {
  it("drops the 6 peer-derived anchors when peer-median PE diverges from own PE by >5x", () => {
    // INTC-style scenario: subject's own multiple is normal (PE 25), but
    // the peer cohort is all running on bubble multiples (PE 175).
    // Diverge ratio 175/25 = 7× → fires (above 5× threshold).
    const subject = makeCompany({
      symbol: "INTC",
      industry: "Semiconductors",
      sector: "Technology",
      ttm: makeTtm({ peRatio: 25 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      makeCompany({
        symbol: `BUBBLE${i}`,
        industry: "Semiconductors",
        sector: "Technology",
        ttm: makeTtm({ peRatio: 175 }),
      }),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(true);
    expect(fv.anchors.peerMedianPE).toBeNull();
    expect(fv.anchors.peerMedianEVEBITDA).toBeNull();
    expect(fv.anchors.peerMedianPFCF).toBeNull();
    expect(fv.anchors.normalizedPE).toBeNull();
    expect(fv.anchors.normalizedEVEBITDA).toBeNull();
    expect(fv.anchors.normalizedPFCF).toBeNull();
    // Own-historical anchors remain.
    expect(fv.anchors.ownHistoricalPE).not.toBeNull();
  });

  it("fires symmetrically when subject PE >> peer PE (compressed peers, premium subject)", () => {
    // Subject at PE 200, peers at PE 20 → diverge 200/20 = 10×.
    const subject = makeCompany({
      symbol: "PREMIUM",
      industry: "Software",
      sector: "Technology",
      ttm: makeTtm({ peRatio: 200 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      makeCompany({
        symbol: `LOW${i}`,
        industry: "Software",
        sector: "Technology",
        ttm: makeTtm({ peRatio: 20 }),
      }),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(true);
  });

  it("does not fire on legitimate growth-premium gaps within 5x", () => {
    // Subject PE 50 (e.g. NVO-style growth premium), peers PE 18 →
    // diverge 50/18 = 2.78× → below 5× threshold.
    const subject = makeCompany({
      symbol: "PREMIUM",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 50 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(false);
    expect(fv.anchors.peerMedianPE).not.toBeNull();
  });

  it("does not fire when subject and peers are within the 5x threshold", () => {
    // Subject PE 25, peers PE 100 → diverge 4× → below threshold.
    const subject = makeCompany({
      symbol: "STABLE",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 25 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 100),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(false);
    expect(fv.anchors.peerMedianPE).not.toBeNull();
  });

  it("does not fire when subject's own PE is missing", () => {
    const subject = makeCompany({
      symbol: "NOPE",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: null }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 100),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(false);
  });
});

describe("fairValueFor — skipOutlierRule", () => {
  it("forces TTM EPS through the peer-median P/E anchor when set", () => {
    // Subject with a clear TTM-EPS spike: latest year $20, prior 3y avg ~$5.
    // No forward EPS available, so the production rule will normalize.
    // Subject's own PE is set close to the peer cohort (15 vs 18) so the
    // peer-cohort divergence check doesn't fire here — that defense is
    // exercised in its own test below.
    const subject = makeCompany({
      symbol: "SPIKE",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      // ttm.peRatio = price / TTM EPS = 100 / 20 = 5. With deriveTtm
      // now consulting ttm.peRatio first, the TTM EPS the spike rule
      // sees is price/peRatio = 20, matching the intended fixture.
      ttm: makeTtm({ peRatio: 5 }),
      annual: [
        makePeriod({ fiscalYear: "2025", income: { ...makePeriod().income, epsDiluted: 20 } }),
        makePeriod({ fiscalYear: "2024", income: { ...makePeriod().income, epsDiluted: 5 } }),
        makePeriod({ fiscalYear: "2023", income: { ...makePeriod().income, epsDiluted: 5 } }),
        makePeriod({ fiscalYear: "2022", income: { ...makePeriod().income, epsDiluted: 5 } }),
      ],
    });
    subject.ttm.forwardEps = null;
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const universe = [subject, ...peers];

    const withRule = fairValueFor(subject, universe);
    const withoutRule = fairValueFor(subject, universe, { skipOutlierRule: true });

    // With rule: normalized → prior 3y mean (5) × peer median PE (~18) = 90
    expect(withRule.ttmTreatment).toBe("normalized");
    expect(withRule.anchors.peerMedianPE).toBeCloseTo(90, 0);
    expect(withRule.peerCohortDivergent).toBe(false);

    // Without rule: raw TTM EPS (20) × peer median PE (~18) = 360
    expect(withoutRule.ttmTreatment).toBe("ttm");
    expect(withoutRule.anchors.peerMedianPE).toBeCloseTo(360, 0);
  });

  it("does NOT drop peer anchors when subject and peers are within 3x of each other", () => {
    // Subject PE 18, peers all PE 18 — diverge ratio = 1.0× → no fire.
    const subject = makeCompany({
      symbol: "ALIGNED",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 18 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.peerCohortDivergent).toBe(false);
    expect(fv.anchors.peerMedianPE).not.toBeNull();
    expect(fv.anchors.normalizedPE).not.toBeNull();
  });

  it("normalizes the peer-median EV/EBITDA anchor when TTM EBITDA spikes vs prior 3y mean", () => {
    // EIX-style: TTM EBITDA $10.7B vs prior-3y mean ~$5.5B (1.95× spike).
    // The peer-median EV/EBITDA anchor should fall back to the prior mean.
    const subject = makeCompany({
      symbol: "SPIKE",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      marketCap: 30_000_000_000,
      // Set ttm fields so deriveTtm returns the intended TTM EBITDA
      // (10.7B = the spike-year annual). enterpriseValue / evToEbitda
      // = 85.6B / 8 = 10.7B.
      ttm: makeTtm({ peRatio: 18, evToEbitda: 8, enterpriseValue: 85_600_000_000 }),
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: {
            ...makePeriod().income,
            epsDiluted: 5,
            ebitda: 10_700_000_000,
            sharesDiluted: 400_000_000,
          },
          balance: { ...makePeriod().balance, totalDebt: 41_000_000_000, cash: 200_000_000 },
        }),
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 6_300_000_000, sharesDiluted: 400_000_000 },
        }),
        makePeriod({
          fiscalYear: "2023",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 5_700_000_000, sharesDiluted: 400_000_000 },
        }),
        makePeriod({
          fiscalYear: "2022",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 4_500_000_000, sharesDiluted: 400_000_000 },
        }),
      ],
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const universe = [subject, ...peers];

    const withRule = fairValueFor(subject, universe);
    const withoutRule = fairValueFor(subject, universe, { skipOutlierRule: true });

    expect(withRule.ebitdaTreatment).toBe("normalized");
    expect(withoutRule.ebitdaTreatment).toBe("ttm");
    // The normalized anchor must imply a smaller equity value than the
    // raw-TTM one (and therefore a lower per-share fair value).
    expect(withRule.anchors.peerMedianEVEBITDA).not.toBeNull();
    expect(withoutRule.anchors.peerMedianEVEBITDA).not.toBeNull();
    expect(withRule.anchors.peerMedianEVEBITDA!).toBeLessThan(
      withoutRule.anchors.peerMedianEVEBITDA!,
    );
  });

  it("does not normalize EBITDA when TTM is within 1.5x of prior 3y mean", () => {
    const subject = makeCompany({
      symbol: "STEADY",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 18, evToEbitda: 14 }),
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 6_500_000_000, sharesDiluted: 400_000_000 },
        }),
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 6_300_000_000, sharesDiluted: 400_000_000 },
        }),
        makePeriod({
          fiscalYear: "2023",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 5_700_000_000, sharesDiluted: 400_000_000 },
        }),
        makePeriod({
          fiscalYear: "2022",
          income: { ...makePeriod().income, epsDiluted: 5, ebitda: 5_500_000_000, sharesDiluted: 400_000_000 },
        }),
      ],
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const fv = fairValueFor(subject, [subject, ...peers]);
    expect(fv.ebitdaTreatment).toBe("ttm");
  });

  it("produces the same result with or without the flag when no spike is present", () => {
    const subject = makeCompany({
      symbol: "STABLE",
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      ttm: makeTtm({ peRatio: 18 }),
    });
    const peers = Array.from({ length: 9 }, (_, i) =>
      buildPharmaPeer(`P${i}`, 50_000_000_000, 18),
    );
    const universe = [subject, ...peers];

    const a = fairValueFor(subject, universe);
    const b = fairValueFor(subject, universe, { skipOutlierRule: true });
    expect(a.anchors.peerMedianPE).toEqual(b.anchors.peerMedianPE);
  });
});
