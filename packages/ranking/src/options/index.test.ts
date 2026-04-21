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
    upsideToMedianPct: ((median - current) / current) * 100,
    confidence: "high",
    ttmTreatment: "ttm",
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

describe("buildExpirationView — covered calls", () => {
  it("snaps three call strikes to p25/median/p75 and labels them", () => {
    const fairValue = fv(95, 110, 130, 90);   // current $90, all anchors above
    const grp = group(
      [contract("C", 95, 8), contract("C", 110, 4), contract("C", 130, 1.5)],
      [],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 90,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls.map((c) => c.label)).toEqual([
      "conservative", "aggressive", "stretch",
    ]);
    expect(view.coveredCalls.map((c) => c.contract.strike)).toEqual([95, 110, 130]);
    expect(view.coveredCalls.map((c) => c.anchorPrice)).toEqual([95, 110, 130]);
  });

  it("dedupes calls when multiple anchors snap to the same strike (closest anchor wins)", () => {
    // Only one strike: 110. All three anchors (95, 110, 130) snap to it.
    // The aggressive (anchor=110) is closest → its label wins.
    const fairValue = fv(95, 110, 130, 90);
    const grp = group([contract("C", 110, 5)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 90,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toHaveLength(1);
    expect(view.coveredCalls[0]?.label).toBe("aggressive");
  });

  it("drops a call whose anchor is below current price (§3.1 floor)", () => {
    // current=120, p25=95 → conservative call would assign immediately, drop it
    const fairValue = fv(95, 110, 130, 120);
    const grp = group(
      [contract("C", 95, 26), contract("C", 110, 14), contract("C", 130, 4)],
      [],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 120,
      annualDividendPerShare: 0,
    });
    // p25 (95) < current (120) → drop conservative
    // median (110) < current (120) → drop aggressive
    // p75 (130) > current → keep stretch only
    expect(view.coveredCalls.map((c) => c.label)).toEqual(["stretch"]);
  });

  it("returns no calls when fair-value range is null", () => {
    const fairValue = { ...fv(95, 110, 130, 100), range: null };
    const grp = group([contract("C", 110, 4)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });

  it("includes effectiveCostBasis on each call (§4.3)", () => {
    const fairValue = fv(95, 110, 130, 90);
    const grp = group([contract("C", 110, 5)], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 90,
      annualDividendPerShare: 0,
    });
    const dedupedCall = view.coveredCalls[0];
    expect(dedupedCall?.effectiveCostBasis).toBe(85);  // 90 - 5
  });

  it("drops a call when the snapped strike is below current price (post-snap floor)", () => {
    // ALLE-style scenario: only listed strike is far below current; the
    // anchor would pass the pre-snap floor but the snap-fallback grabs
    // an ITM strike. The post-snap floor catches that.
    const fairValue = fv(150, 160, 180, 145);   // anchors all >= current
    const grp = group([contract("C", 110, 36)], []);   // only ITM strike listed
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 145,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });

  it("drops a call when no listed strike has a usable bid", () => {
    const dead = contract("C", 110, 0);
    dead.bid = null;
    const fairValue = fv(95, 110, 130, 90);
    const grp = group([dead], []);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 90,
      annualDividendPerShare: 0,
    });
    expect(view.coveredCalls).toEqual([]);
  });
});

describe("buildExpirationView — cash-secured puts", () => {
  it("snaps three put strikes to p75/median/p25 and labels them", () => {
    const fairValue = fv(95, 110, 130, 140);   // current well above FV → puts OTM
    const grp = group(
      [],
      [contract("P", 95, 6), contract("P", 110, 10), contract("P", 130, 16)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 140,
      annualDividendPerShare: 0,
    });
    // Puts: stretch=p75=130, aggressive=median=110, deep-value=p25=95
    expect(view.puts.map((p) => p.label)).toEqual(["stretch", "aggressive", "deep-value"]);
    expect(view.puts.map((p) => p.contract.strike)).toEqual([130, 110, 95]);
    expect(view.puts.map((p) => p.anchor)).toEqual(["p75", "median", "p25"]);
  });

  it("computes effective cost basis = strike - bid for each put", () => {
    const fairValue = fv(95, 110, 130, 140);
    const grp = group(
      [],
      [contract("P", 95, 6), contract("P", 110, 10), contract("P", 130, 16)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 140,
      annualDividendPerShare: 0,
    });
    const stretch = view.puts.find((p) => p.label === "stretch");
    expect(stretch?.effectiveCostBasis).toBe(114);  // 130 - 16
    const deepValue = view.puts.find((p) => p.label === "deep-value");
    expect(deepValue?.effectiveCostBasis).toBe(89);  // 95 - 6
  });

  it("suppresses puts entirely when current < p25 (§3.2)", () => {
    const fairValue = fv(95, 110, 130, 80);   // current $80 below p25=95
    const grp = group(
      [],
      [contract("P", 95, 20), contract("P", 110, 32)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 80,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
    expect(view.putsSuppressedReason).toBe("below-fair-value");
  });

  it("drops a put when the snapped strike is above current price (post-snap floor)", () => {
    // Symmetric to the call rule: when the snap fallback grabs a strike
    // above current, the put is ITM and "premium % collateral" is misleading.
    const fairValue = fv(95, 110, 130, 100);
    const itmPut = contract("P", 130, 32, 270, true);
    // Only ITM put listed (130 > current=100).
    const grp = group([], [itmPut]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("keeps OTM puts even when an ITM strike exists in the chain", () => {
    // When OTM strikes are available, the snap should pick those (not the ITM).
    const fairValue = fv(95, 110, 130, 100);
    const grp = group(
      [],
      [contract("P", 95, 4), contract("P", 110, 12), contract("P", 130, 32, 270, true)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    // p75=130 anchor → snap prefers ≤ anchor, so 110. p25/median snap to 95/110.
    // After dedupe + post-snap floor, no ITM strikes survive.
    expect(view.puts.every((p) => p.contract.strike <= 100)).toBe(true);
    expect(view.puts.length).toBeGreaterThan(0);
  });
});

describe("buildOptionsView", () => {
  it("aggregates per-expiration views with metadata", () => {
    // Fair value straddles current: puts get OTM strikes (≤ current), calls
    // get OTM strikes (≥ current). Both sides survive the post-snap floors.
    const fairValue = fv(95, 110, 130, 100);
    const grp = group(
      [contract("C", 110, 5), contract("C", 130, 2)],
      [contract("P", 90, 3), contract("P", 100, 5)],
    );
    const view = buildOptionsView({
      symbol: "TEST",
      fetchedAt: "2026-04-20T12:00:00.000Z",
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
    expect(view.fetchedAt).toBe("2026-04-20T12:00:00.000Z");
    expect(view.expirations).toHaveLength(1);
    expect(view.expirations[0]?.selectionReason).toBe("leap");
    expect(view.expirations[0]?.coveredCalls.length).toBeGreaterThan(0);
    expect(view.expirations[0]?.puts.length).toBeGreaterThan(0);
    // No ITM survivors
    expect(view.expirations[0]?.coveredCalls.every((c) => c.contract.strike >= 100)).toBe(true);
    expect(view.expirations[0]?.puts.every((p) => p.contract.strike <= 100)).toBe(true);
  });
});
