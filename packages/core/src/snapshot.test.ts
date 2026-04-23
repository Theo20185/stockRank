import { describe, it, expect } from "vitest";
import { pctAboveLow, pctOffHigh, SNAPSHOT_SCHEMA_VERSION } from "./snapshot.js";

describe("SNAPSHOT_SCHEMA_VERSION", () => {
  it("is the literal 1 (bump on breaking schema change)", () => {
    expect(SNAPSHOT_SCHEMA_VERSION).toBe(1);
  });
});

describe("pctOffHigh", () => {
  it("returns 0 when price equals the high", () => {
    expect(pctOffHigh(100, 100)).toBe(0);
  });

  it("returns 0 when price exceeds the high (clamps)", () => {
    expect(pctOffHigh(110, 100)).toBe(0);
  });

  it("computes the percentage drawdown for a price below the high", () => {
    expect(pctOffHigh(50, 100)).toBe(50);
    expect(pctOffHigh(80, 100)).toBeCloseTo(20);
  });

  it("returns 0 when yearHigh is zero or negative (degenerate input)", () => {
    expect(pctOffHigh(50, 0)).toBe(0);
    expect(pctOffHigh(50, -10)).toBe(0);
  });
});

describe("pctAboveLow", () => {
  it("returns 0 when price equals the low", () => {
    expect(pctAboveLow(80, 80)).toBe(0);
  });

  it("returns 0 when price is below the low (clamps)", () => {
    expect(pctAboveLow(70, 80)).toBe(0);
  });

  it("computes the percentage above the low for a price above it", () => {
    expect(pctAboveLow(150, 100)).toBe(50);
    expect(pctAboveLow(120, 100)).toBeCloseTo(20);
  });

  it("returns 0 when yearLow is zero or negative (degenerate input)", () => {
    expect(pctAboveLow(50, 0)).toBe(0);
    expect(pctAboveLow(50, -10)).toBe(0);
  });
});
