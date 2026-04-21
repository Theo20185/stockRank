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

describe("buildExpirationView — cash-secured puts (single p25 anchor)", () => {
  it("emits exactly one put anchored at p25, snapped to ≤ current", () => {
    // current=$100, p25=$120 → put strike must be ≤ p25 (120) AND ≤ current (100)
    const fairValue = fv(120, 150, 180, 100);
    const grp = group(
      [],
      [contract("P", 80, 3), contract("P", 95, 5), contract("P", 110, 9)],
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
    // Snap prefers ≤ p25 (120) → 110, but 110 > current (100) → ITM → drop.
    // Next best ≤ current → 95.
    expect(view.puts[0]?.contract.strike).toBe(95);
  });

  it("computes effective cost basis = strike - bid", () => {
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 95, 5)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts[0]?.effectiveCostBasis).toBe(90);   // 95 - 5
  });

  it("suppresses puts when current >= p25 (above the conservative tail)", () => {
    const fairValue = fv(95, 110, 130, 100);   // current $100 above p25 $95
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

  it("drops a put when the only available strike is above current (post-snap floor)", () => {
    // Only listed put is $130, current $100, p25 $120 → snap picks 120? Wait
    // 130 > p25 (120), so snap finds nothing ≤ 120 in [130]; falls back to 130.
    // 130 > current (100) → drop.
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
