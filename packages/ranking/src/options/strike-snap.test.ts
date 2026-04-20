import { describe, it, expect } from "vitest";
import { snapStrike } from "./strike-snap.js";

const STRIKES = [80, 85, 90, 95, 100, 105, 110, 115, 120, 130, 140];

describe("snapStrike — calls (prefer S >= A)", () => {
  it("snaps to the nearest listed strike at or above the anchor", () => {
    expect(snapStrike(STRIKES, 102, "call")).toEqual({ strike: 105, snapWarning: false });
  });

  it("uses the lower strike when no listed strike is at or above anchor", () => {
    expect(snapStrike(STRIKES, 145, "call")).toEqual({ strike: 140, snapWarning: false });
  });

  it("ties go up for calls (110.5 → 115 since equidistant doesn't apply, but 110.0 → 110)", () => {
    expect(snapStrike(STRIKES, 110, "call")).toEqual({ strike: 110, snapWarning: false });
  });

  it("flags snapWarning when nearest listed strike is > 5% off anchor", () => {
    expect(snapStrike([80, 130], 100, "call")).toEqual({ strike: 130, snapWarning: true });
  });

  it("does NOT flag snapWarning at exactly 5% off", () => {
    expect(snapStrike([105], 100, "call")).toEqual({ strike: 105, snapWarning: false });
  });
});

describe("snapStrike — puts (prefer S <= A)", () => {
  it("snaps to the nearest listed strike at or below the anchor", () => {
    expect(snapStrike(STRIKES, 102, "put")).toEqual({ strike: 100, snapWarning: false });
  });

  it("uses the higher strike when no listed strike is at or below anchor", () => {
    // 80 vs anchor 75 → 5/75 = 6.7% off, exceeds threshold → warning.
    expect(snapStrike(STRIKES, 75, "put")).toEqual({ strike: 80, snapWarning: true });
  });

  it("equal anchor and listed strike picks that strike", () => {
    expect(snapStrike(STRIKES, 100, "put")).toEqual({ strike: 100, snapWarning: false });
  });

  it("flags snapWarning when nearest listed strike is > 5% off anchor", () => {
    expect(snapStrike([60, 100], 80, "put")).toEqual({ strike: 60, snapWarning: true });
  });
});

describe("snapStrike — edge cases", () => {
  it("returns null when strike list is empty", () => {
    expect(snapStrike([], 100, "call")).toBeNull();
    expect(snapStrike([], 100, "put")).toBeNull();
  });

  it("handles a single-strike chain (anchor exact / within 5%)", () => {
    // 100 exact match
    expect(snapStrike([100], 100, "call")).toEqual({ strike: 100, snapWarning: false });
    // anchor 105, strike 100 → 5/105 = 4.76% off, no warning
    expect(snapStrike([100], 105, "call")).toEqual({ strike: 100, snapWarning: false });
  });

  it("flags warning on single-strike chain when off > 5%", () => {
    // anchor 95, strike 100 → 5/95 = 5.26% > 5% → warning
    expect(snapStrike([100], 95, "call")).toEqual({ strike: 100, snapWarning: true });
  });

  it("returns null when anchor is non-positive", () => {
    expect(snapStrike([100], 0, "call")).toBeNull();
    expect(snapStrike([100], -10, "put")).toBeNull();
  });
});
