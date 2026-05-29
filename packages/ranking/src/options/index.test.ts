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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("filters out ITM strikes even when they have the highest time-value yield", () => {
    // current=$100, p25=$120. Listed [95, 105, 115]:
    //   $95  bid 4    (OTM, TV 4,    yield 4.21%)  ← winner under new rule
    //   $105 bid 9    (ITM by $5, TV 4,  yield 3.81%)
    //   $115 bid 17   (ITM by $15, TV 2, yield 1.74%)
    // Without the ITM filter, $95 still wins on TV yield in this setup,
    // but the prior live-data audit (2026-05-11) caught many cases where
    // the highest-TV-yield strike was AT or ABOVE current price.
    // This test pins the explicit ITM rejection: if $105 had the
    // highest TV yield, it would STILL be filtered out.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group(
      [],
      [
        contract("P", 95, 4, 270, false),
        // Hand-tuned: $105 has the HIGHEST TV yield among listings, but
        // it's ITM. The selector must skip it and pick the OTM $95.
        { ...contract("P", 105, 12, 270, true), impliedVolatility: 0.40 },
      ],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    // $105 has TV yield (12 - 5)/105 = 6.67% > $95's 4/95 = 4.21%.
    // Under old rule the engine would have picked $105 (ITM).
    // Under new rule the engine must pick $95 (OTM).
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(95);
    expect(view.puts[0]?.inTheMoney).toBe(false);
  });

  it("filters out ATM put (strike == current) — strictly out-of-the-money only", () => {
    // current=$100. Listed [90, 100]:
    //   $90  bid 2 (OTM)
    //   $100 bid 5 (ATM — strike equals current)
    // ATM puts have ZERO intrinsic value but the user directive is
    // "only options that are out of the money". Strict less-than-current.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group(
      [],
      [contract("P", 90, 2), contract("P", 100, 5)],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(90);
  });

  it("emits no put when every listed strike is at or above current price", () => {
    // current=$100, p25=$120. Listed [100, 105, 110, 115]:
    // every strike is ATM or ITM → no OTM candidate → no put emitted.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      contract("P", 100, 5),
      { ...contract("P", 105, 9, 270, true), impliedVolatility: 0.40 },
      { ...contract("P", 110, 13, 270, true), impliedVolatility: 0.40 },
      { ...contract("P", 115, 17, 270, true), impliedVolatility: 0.40 },
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("filters out ATM call (strike == current) — strictly out-of-the-money only", () => {
    // current=$100, p25=$100 (rare edge: stock at the conservative tail).
    // Listed [100, 120]:
    //   $100 — ATM, must be filtered out under the new rule.
    //   $120 — strike >= p25, OTM. Pick this.
    const fairValue = fv(100, 130, 160, 100);
    const grp = group(
      [contract("C", 100, 4), contract("C", 120, 1.5)],
      [],
    );
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    // current >= p25 → puts suppressed, calls keep going. snap to >=p25
    // = $100, but $100 is ATM → must skip and fall to $120 (OTM).
    if (view.coveredCalls.length > 0) {
      expect(view.coveredCalls[0]?.contract.strike).toBe(120);
    }
  });

  it("rejects strikes more than 25% out-of-the-money (data-quality cap)", () => {
    // SYF 2026-05-13: even with closest-to-current, the chain only had
    // $32.50 and $35 passing the bid>0/IV>0 filter at the monthly
    // expiration (intermediate strikes had penny bids or stale IV).
    // The MAX-strike rule then picked $35 — still 50% OTM at S=$70.
    // The user expectation is "close to current" — 25% is the cap.
    // Anything deeper → no put emitted for that expiration.
    //
    // current=$100. Listed [50, 60, 95]:
    //   $50 — 50% OTM, rejected by cap.
    //   $60 — 40% OTM, rejected by cap.
    //   $95 — 5% OTM, accepted. Pick.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      contract("P", 50, 1.0),
      contract("P", 60, 1.5),
      contract("P", 95, 3.0),
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2026-06-19", selectionReason: "monthly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(95);
  });

  it("emits no put when every listed OTM strike is more than 25% OTM", () => {
    // F 2026-05-13: monthly chain only had K=$4 with bid=$0.01 passing
    // the OTM + bid>0 filters at current=$11.82. Better to emit no put
    // than a garbage one — the user can switch to weekly/yearly modes
    // or accept that the symbol has no actionable put this expiration.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      contract("P", 70, 1.5),  // 30% OTM — rejected
      contract("P", 50, 1.2),  // 50% OTM — rejected
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2026-06-19", selectionReason: "monthly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
  });

  it("rejects strikes with penny bids (premium < $10 per contract)", () => {
    // F 2026-05-13: monthly chain $4 strike had bid=$0.01 ($1 per
    // contract). Stale / no-real-market quote. Filter floor: bid × 100
    // ≥ $10 — equivalent to at least one penny per share of premium.
    //
    // current=$100. Listed [90, 95]:
    //   $90 bid 0.05 → $5/contract — REJECTED
    //   $95 bid 0.20 → $20/contract — accepted. Pick.
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      contract("P", 90, 0.05),
      contract("P", 95, 0.20),
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2026-06-19", selectionReason: "monthly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(95);
  });

  it("picks the OTM strike CLOSEST to current price, not the one with highest yield (SYF regression)", () => {
    // 2026-05-13 live-data audit: SYF current $70.28, monthly chain
    // returned $32.50 strike with bid $1.15 and IV=188.6% (clearly
    // stale/anomalous), which beat near-ATM strikes on the bid/K
    // yield metric. The fix: among OTM strikes with bid > 0, pick the
    // MAX strike (closest to current) instead of max yield, so the
    // user gets a sensible "would own at this price" anchor.
    //
    // current=$100. Listed:
    //   $30 bid 1.50 → yield 5.00% (deeper OTM, stale-IV style)
    //   $50 bid 1.20 → yield 2.40%
    //   $90 bid 2.50 → yield 2.78%
    //   $95 bid 3.00 → yield 3.16%   ← winner under new rule (closest to current)
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [
      contract("P", 30, 1.5),
      contract("P", 50, 1.2),
      contract("P", 90, 2.5),
      contract("P", 95, 3.0),
    ]);
    const view = buildExpirationView({
      selected: { expiration: "2026-06-19", selectionReason: "monthly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(95);
  });

  it("picks the OTM strike when only sub-current strikes are listed", () => {
    // current=$100, p25=$120, listed strikes only [80, 90].
    // $80 bid 2, TV 2, yield 2.5%
    // $90 bid 3, TV 3, yield 3.33% ← winner
    const fairValue = fv(120, 150, 180, 100);
    const grp = group([], [contract("P", 80, 2), contract("P", 90, 3)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
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
          selected: { expiration: "2027-01-15", selectionReason: "yearly" },
          group: grp,
        },
      ],
    });
    expect(view.symbol).toBe("TEST");
    expect(view.fetchedAt).toBe("2026-04-21T12:00:00.000Z");
    expect(view.expirations).toHaveLength(1);
    expect(view.expirations[0]?.selectionReason).toBe("yearly");
    expect(view.expirations[0]?.coveredCalls).toHaveLength(1);
    expect(view.expirations[0]?.puts).toHaveLength(1);
    expect(view.expirations[0]?.coveredCalls[0]?.contract.strike).toBe(120);
    expect(view.expirations[0]?.puts[0]?.contract.strike).toBe(95);
  });
});

describe("buildExpirationView — chain inclusion (portfolio bid/ask lookup)", () => {
  it("attaches the FULL provider chain (every strike) for portfolio lookup", () => {
    // The portfolio screen needs to look up bid/ask for arbitrary user-
    // held contracts whose strike may not match the engine's pick. The
    // view's `chain` field must mirror the provider's raw response.
    const fairValue = fv(120, 150, 180, 100);
    const calls = [contract("C", 100, 12), contract("C", 120, 5), contract("C", 150, 1)];
    const puts = [contract("P", 80, 1), contract("P", 90, 3), contract("P", 95, 5)];
    const grp = group(calls, puts);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    // Engine emits at most one of each — but the chain has ALL strikes.
    expect(view.chain.calls.map((c) => c.strike)).toEqual([100, 120, 150]);
    expect(view.chain.puts.map((p) => p.strike)).toEqual([80, 90, 95]);
  });

  it("attaches the chain even when puts are suppressed (current ≥ p25)", () => {
    // Stock above p25 → put workflow suppressed. The chain is still
    // exposed so the portfolio can find any held put on this expiration.
    const fairValue = fv(95, 110, 130, 120); // current $120 ≥ p25 $95
    const calls = [contract("C", 130, 4)];
    const puts = [contract("P", 110, 1.5), contract("P", 115, 2.5)];
    const grp = group(calls, puts);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 120,
      annualDividendPerShare: 0,
    });
    expect(view.puts).toEqual([]);
    expect(view.putsSuppressedReason).toBe("above-conservative-tail");
    expect(view.chain.puts.map((p) => p.strike)).toEqual([110, 115]);
  });

  it("attaches the chain when fair-value range is null", () => {
    const fairValue = { ...fv(120, 150, 180, 100), range: null };
    const grp = group([contract("C", 120, 5)], [contract("P", 95, 4)]);
    const view = buildExpirationView({
      selected: { expiration: "2027-01-15", selectionReason: "yearly" },
      group: grp,
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
    });
    expect(view.chain.calls).toHaveLength(1);
    expect(view.chain.puts).toHaveLength(1);
  });
});

function projection(o: {
  fvP25: number;
  fvMedian?: number;
  fvP75?: number;
  price: number;
}): import("./types.js").ExpirationProjection {
  return {
    daysAhead: 90,
    fvP25: o.fvP25,
    fvMedian: o.fvMedian ?? o.fvP25 * 1.1,
    fvP75: o.fvP75 ?? o.fvP25 * 1.2,
    price: o.price,
    fvSlopePctPerYear: 10,
    priceSlopePctPerYear: 8,
    fvRSquared: 0.7,
    priceRSquared: 0.6,
    fvConfidence: "high",
    priceConfidence: "high",
    fvCapped: false,
    priceCapped: false,
  };
}

describe("buildExpirationView — strike re-anchoring on projection", () => {
  it("re-anchors the call strike to PROJECTED p25 when a projection is supplied", () => {
    // Today p25 = $120, projected p25 = $135 (improving FV).
    // With strikes [120, 130, 140, 150], the call would snap to 120
    // (today's p25) without projection. WITH projection, it should
    // snap to 140 — the first listed strike ≥ projected $135.
    const fairValue = fv(120, 150, 180, 100); // today p25 = $120
    const calls = [
      contract("C", 120, 8),
      contract("C", 130, 5),
      contract("C", 140, 3),
      contract("C", 150, 2),
    ];
    const view = buildExpirationView({
      selected: { expiration: "2026-08-21", selectionReason: "monthly" },
      group: group(calls, []),
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
      projection: projection({ fvP25: 135, price: 105 }),
    });
    expect(view.coveredCalls).toHaveLength(1);
    expect(view.coveredCalls[0]?.contract.strike).toBe(140);
  });

  it("falls back to today's p25 anchor when no projection is supplied", () => {
    // Same fixture as above — without projection, snap to today's p25 = $120.
    const fairValue = fv(120, 150, 180, 100);
    const calls = [
      contract("C", 120, 8),
      contract("C", 130, 5),
      contract("C", 140, 3),
      contract("C", 150, 2),
    ];
    const view = buildExpirationView({
      selected: { expiration: "2026-08-21", selectionReason: "monthly" },
      group: group(calls, []),
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
      // no projection
    });
    expect(view.coveredCalls).toHaveLength(1);
    expect(view.coveredCalls[0]?.contract.strike).toBe(120);
  });

  it("anchors the put target to PROJECTED price for the 'closest OTM' decision when projected < today's", () => {
    // Today's current = $100, projected price at expiry = $90 (bearish).
    // Strikes [80, 85, 90, 95] are all OTM relative to today's $100.
    // Without projection, the picker takes the HIGHEST OTM ($95).
    // With projection at $90, the picker takes the strike CLOSEST to
    // projected — also $90 (an exact match).
    const fairValue = fv(120, 150, 180, 100); // current $100 below p25 → put workflow active
    const puts = [
      contract("P", 80, 1.5),
      contract("P", 85, 2),
      contract("P", 90, 2.5),
      contract("P", 95, 3),
    ];
    const view = buildExpirationView({
      selected: { expiration: "2026-08-21", selectionReason: "monthly" },
      group: group([], puts),
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
      projection: projection({ fvP25: 110, price: 90 }),
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(90);
  });

  it("keeps the put OTM floor on TODAY's current price even when projected is bullish", () => {
    // Projected price = $115 (above today's $100). The strike target
    // can't exceed today's current ($100) without becoming ITM at
    // entry, so the floor still keeps strikes < $100. Picker takes
    // the highest OTM strike ($95).
    const fairValue = fv(120, 150, 180, 100);
    const puts = [
      contract("P", 80, 1.5),
      contract("P", 90, 2.5),
      contract("P", 95, 3),
    ];
    const view = buildExpirationView({
      selected: { expiration: "2026-08-21", selectionReason: "monthly" },
      group: group([], puts),
      fairValue,
      currentPrice: 100,
      annualDividendPerShare: 0,
      projection: projection({ fvP25: 130, price: 115 }),
    });
    expect(view.puts).toHaveLength(1);
    expect(view.puts[0]?.contract.strike).toBe(95);
  });
});
