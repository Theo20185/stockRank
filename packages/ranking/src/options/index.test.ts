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

describe("buildExpirationView — cash-secured puts (single p25 anchor, ITM)", () => {
  it("snaps put strike to highest listed strike ≤ p25 (typically ITM for Candidates)", () => {
    // current=$100, p25=$120. Strategy: target the put strike at p25
    // (= conservative fair value). For Candidates current < p25 by
    // definition, so this strike is ITM at sale. Listed strikes
    // [80, 95, 110] — pick highest ≤ 120 → 110 (ITM by $10).
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
    expect(view.puts[0]?.contract.strike).toBe(110);
    expect(view.puts[0]?.inTheMoney).toBe(true);
  });

  it("computes effective cost basis = strike - bid for ITM puts (intrinsic + time → discount)", () => {
    // current=$100, p25=$120, listed strike $115 with bid $20
    // (intrinsic $15 + ~$5 time). Effective cost = 115 - 20 = 95,
    // which is 5% below current — the discount we'd get if assigned.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 115, 20, 270, true)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts[0]?.effectiveCostBasis).toBe(95);
    expect(view.puts[0]?.effectiveDiscountPct).toBeCloseTo(0.05, 5);
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

  it("emits the put with snapWarning when no listed strike is at-or-below p25", () => {
    // Only listed put is $130, p25 is $120. Highest strike ≤ 120 → none;
    // snapStrike falls back to nearest strike (130). It's still ITM
    // for current $100 (intrinsic $30) — emit it, but flag snapWarning
    // because the strike is 8.3% above the p25 anchor.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 130, 32, 270, true)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "leap" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(130);
    expect(view.puts[0]?.snapWarning).toBe(true);
  });

  it("emits an OTM put when the highest ≤ p25 strike happens to be below current spot", () => {
    // current=$100, p25=$120, listed strikes only go up to $90.
    // Snap to highest ≤ p25 (120) → 90. 90 < current (100) so the
    // put is OTM. We still emit it — strategy is "anchor to p25,"
    // and the constraint is satisfied even if the only available
    // listed strike happens to be OTM.
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
