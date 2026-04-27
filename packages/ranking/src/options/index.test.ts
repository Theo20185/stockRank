import { describe, it, expect } from "vitest";
import type { ContractQuote, ExpirationGroup } from "@stockrank/core";
import { buildExpirationView, buildOptionsView } from "./index.js";
import type { FairValue } from "../fair-value/types.js";

function fv(p25: number, median: number, p75: number, current: number): FairValue {
  return {
    peerSet: "cohort",
    peerCount: 8,
    anchors: {
      peerMedianPE: median, peerMedianEVEBITDA: median, peerMedianPFCF: median,
      ownHistoricalPE: median, ownHistoricalEVEBITDA: median, ownHistoricalPFCF: median,
      normalizedPE: median, normalizedEVEBITDA: median, normalizedPFCF: median,
    },
    range: { p25, median, p75 },
    current,
    upsideToP25Pct: ((p25 - current) / current) * 100,
    upsideToMedianPct: ((median - current) / current) * 100,
    confidence: "high",
    ttmTreatment: "ttm",
    ebitdaTreatment: "ttm",
    peerCohortDivergent: false,
  };
}

function contract(
  side: "C" | "P",
  strike: number,
  bid: number,
  daysToExpiry = 270,
  inTheMoney = false,
): ContractQuote {
  return {
    contractSymbol: `T${strike}${side}`,
    expiration: "2027-01-15",
    daysToExpiry,
    strike,
    bid,
    ask: bid + 0.1,
    lastPrice: bid,
    volume: 10,
    openInterest: 100,
    impliedVolatility: 0.4,
    inTheMoney,
  };
}

function group(calls: ContractQuote[], puts: ContractQuote[]): ExpirationGroup {
  return { expiration: "2027-01-15", calls, puts };
}

describe("buildExpirationView — covered calls (single p25 anchor)", () => {
  it("emits exactly one covered call anchored at p25", () => {
    const fairValue = fv(120, 150, 180, 100);   // current $100, p25 $120
    const grp = group(
      [contract("C", 120, 8), contract("C", 150, 4), contract("C", 180, 1.5)],
      [],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toHaveLength(1);
    expect(view.coveredCalls[0]?.label).toBe("conservative");
    expect(view.coveredCalls[0]?.anchor).toBe("p25");
    expect(view.coveredCalls[0]?.contract.strike).toBe(120);
  });

  it("snaps to ≥ p25 when no exact strike exists", () => {
    const fairValue = fv(115, 150, 180, 100);
    const grp = group([contract("C", 120, 6)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toHaveLength(1);
    expect(view.coveredCalls[0]?.contract.strike).toBe(120);
  });

  it("drops a call when the snapped strike is below current (post-snap floor)", () => {
    // Stock is BELOW p25 (current=145, p25=150). Snap fallback grabs the
    // only listed strike ($110), which is below current → drop.
    const fairValue = fv(150, 160, 180, 145);
    const grp = group([contract("C", 110, 36)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 145,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });

  it("emits no calls when the anchor is below current price (stock above p25)", () => {
    // current=$120 above p25=$95 — outside the value zone for this profile.
    const fairValue = fv(95, 110, 130, 120);
    const grp = group([contract("C", 130, 4)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 120,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });

  it("emits no calls when fair-value range is null", () => {
    const fairValue = { ...fv(120, 150, 180, 100), range: null };
    const grp = group([contract("C", 120, 5)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });

  it("includes effectiveCostBasis on the call (§4.3)", () => {
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([contract("C", 120, 5)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls[0]?.effectiveCostBasis).toBe(95);  // 100 - 5
  });

  it("drops the call when no listed strike has a usable bid", () => {
    const dead = contract("C", 120, 0);
    dead.bid = null;
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([dead], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });
});

describe("buildExpirationView — cash-secured puts (best time-value yield)", () => {
  it("picks the strike with highest time-value yield among IV>0 strikes ≤ p25", () => {
    // current=$100, p25=$120. Listed [80, 95, 110]:
    //   $80  bid 3  (TV $3, yield 3.75%)
    //   $95  bid 5  (TV $5, yield 5.26%)
    //   $110 bid 15 (intrinsic $10, TV $5, yield 4.55%)
    // Max yield = $95 — even though $110 is the deeper-ITM strike,
    // its bid is mostly intrinsic, not real income.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group(
      [],
      [contract("P", 80, 3), contract("P", 95, 5), contract("P", 110, 15, 270, true)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.label).toBe("deep-value");
    expect(view.puts[0]?.anchor).toBe("p25");
    expect(view.puts[0]?.contract.strike).toBe(95);
  });

  it("computes effective cost basis = strike - bid", () => {
    // Single strike $95 with bid $5 → effective cost = $90, 10% below current $100.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 95, 5)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts[0]?.effectiveCostBasis).toBe(90);
    expect(view.puts[0]?.effectiveDiscountPct).toBeCloseTo(0.10, 5);
  });

  it("suppresses puts when current >= p25 (above the conservative tail)", () => {
    const fairValue = fv(95, 110, 130, 100); // current $100 above p25 $95
    const grp = group([], [contract("P", 90, 4)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
    expect(view.putsSuppressedReason).toBe("above-conservative-tail");
  });

  it("filters out strikes with IV=0 (deep-ITM forward-priced strikes) and picks best yield among the rest", () => {
    // EIX-style: p25=$100, current=$68.50. Listed:
    //   $67.5 IV 40%, bid 5.80 (TV 5.80, yield 8.59%) ← winner
    //   $85   IV 30%, bid 17.20 (intrinsic 16.50, TV 0.70, yield 0.82%)
    //   $95   IV 0,   bid 25.10 (filtered out)
    //   $100  IV 0,   bid 29.70 (filtered out)
    const fairValue = fv(100, 130, 160, 68.5);
    const grp = group([], [
      contract("P", 67.5, 5.8, 263, false),
      { ...contract("P", 85, 17.2, 263, true), impliedVolatility: 0.30 },
      { ...contract("P", 95, 25.1, 263, true), impliedVolatility: 0 },
      { ...contract("P", 100, 29.7, 263, true), impliedVolatility: 0 },
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 68.5,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(67.5);
    expect(view.puts[0]?.inTheMoney).toBe(false);
  });

  it("emits no puts when no strike has IV > 0 (entire chain is forward-priced)", () => {
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      { ...contract("P", 130, 30, 270, true), impliedVolatility: 0 },
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("excludes strikes above p25 (must be ≤ engine's value approval)", () => {
    // Only listed put is $130, p25 is $120. $130 > p25 → ineligible.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 130, 32, 270, true)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("picks the OTM strike when only sub-current strikes are listed", () => {
    // current=$100, p25=$120, listed strikes only [80, 90].
    // $80 bid 2, TV 2, yield 2.5%
    // $90 bid 3, TV 3, yield 3.33% ← winner
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 80, 2), contract("P", 90, 3)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(90);
  });
});

describe("buildOptionsView", () => {
  it("aggregates per-expiration views with metadata", () => {
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([contract("C", 120, 5)], [contract("P", 95, 4)]);
    const view = buildOptionsView({
      symbol: "TEST",
      fetchedAt: "2026-04-21T12:00:00.000Z",
      currentPrice: 100,
      annualDividendPerShare: 0,
      fairValue,
      expirations: [
        {
          selected: { expiration: "2027-01-15", selectionReason: "leap" },
          group: grp,
        },
      ],
    });
    expect(view.symbol).toBe("TEST");
    expect(view.fetchedAt).toBe("2026-04-21T12:00:00.000Z");
    expect(view.expirations).toHaveLength(1);
    expect(view.expirations[0]?.selectionReason).toBe("leap");
    expect(view.expirations[0]?.coveredCalls).toHaveLength(1);
    expect(view.expirations[0]?.puts).toHaveLength(1);
    expect(view.expirations[0]?.coveredCalls[0]?.contract.strike).toBe(120);
    expect(view.expirations[0]?.puts[0]?.contract.strike).toBe(95);
  });
});
