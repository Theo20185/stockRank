import { describe, expect, it } from "vitest";
import { estimateCallPremiumPct } from "./premium-estimate.js";

describe("estimateCallPremiumPct", () => {
  // Premium is returned as percent-of-current-price. For a 2y option
  // baseline ATM call at typical value-tilt IV (~25%), premium should
  // land in the 10-15% range. As the strike moves OTM (upside grows),
  // premium decays.

  it("ATM call (0% upside to strike) at 2y returns ~12-15% premium", () => {
    const p = estimateCallPremiumPct({
      upsideToStrikePct: 0,
      yearsToExpiry: 2,
    });
    expect(p).toBeGreaterThanOrEqual(10);
    expect(p).toBeLessThanOrEqual(16);
  });

  it("10% OTM call at 2y returns ~8-11% premium", () => {
    const p = estimateCallPremiumPct({
      upsideToStrikePct: 10,
      yearsToExpiry: 2,
    });
    expect(p).toBeGreaterThan(7);
    expect(p).toBeLessThan(12);
  });

  it("25% OTM call at 2y returns 5-8% premium (decaying)", () => {
    const p = estimateCallPremiumPct({
      upsideToStrikePct: 25,
      yearsToExpiry: 2,
    });
    expect(p).toBeGreaterThan(4);
    expect(p).toBeLessThan(9);
  });

  it("50% OTM call at 2y returns small premium (~2-4%)", () => {
    const p = estimateCallPremiumPct({
      upsideToStrikePct: 50,
      yearsToExpiry: 2,
    });
    expect(p).toBeGreaterThanOrEqual(1);
    expect(p).toBeLessThanOrEqual(5);
  });

  it("100% OTM call (deep value) clamps at the floor (~1-2%)", () => {
    const p = estimateCallPremiumPct({
      upsideToStrikePct: 100,
      yearsToExpiry: 2,
    });
    expect(p).toBeGreaterThanOrEqual(0.5);
    expect(p).toBeLessThanOrEqual(3);
  });

  it("scales with sqrt(time): 2y > 1y > 0.5y for the same moneyness", () => {
    const p2y = estimateCallPremiumPct({ upsideToStrikePct: 10, yearsToExpiry: 2 });
    const p1y = estimateCallPremiumPct({ upsideToStrikePct: 10, yearsToExpiry: 1 });
    const p6m = estimateCallPremiumPct({ upsideToStrikePct: 10, yearsToExpiry: 0.5 });
    expect(p2y).toBeGreaterThan(p1y);
    expect(p1y).toBeGreaterThan(p6m);
    // sqrt(T) scaling: 2y ≈ 1y × sqrt(2) ≈ 1.41x
    expect(p2y / p1y).toBeCloseTo(Math.SQRT2, 0);
  });

  it("respects custom IV — high IV name (40%) pays more premium than low IV (15%)", () => {
    const lowIv = estimateCallPremiumPct({
      upsideToStrikePct: 10,
      yearsToExpiry: 2,
      annualizedIv: 0.15,
    });
    const highIv = estimateCallPremiumPct({
      upsideToStrikePct: 10,
      yearsToExpiry: 2,
      annualizedIv: 0.4,
    });
    expect(highIv).toBeGreaterThan(lowIv);
    // Roughly proportional to IV (40/15 ≈ 2.67x)
    expect(highIv / lowIv).toBeGreaterThan(2);
  });

  it("returns 0 for non-positive time or IV (degenerate input)", () => {
    expect(estimateCallPremiumPct({ upsideToStrikePct: 0, yearsToExpiry: 0 })).toBe(0);
    expect(
      estimateCallPremiumPct({
        upsideToStrikePct: 0,
        yearsToExpiry: 2,
        annualizedIv: 0,
      }),
    ).toBe(0);
  });

  it("never returns negative premium", () => {
    for (const upside of [0, 50, 100, 200, 1000]) {
      expect(
        estimateCallPremiumPct({ upsideToStrikePct: upside, yearsToExpiry: 2 }),
      ).toBeGreaterThanOrEqual(0);
    }
  });
});
