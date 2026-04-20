import { describe, it, expect } from "vitest";
import { percentRank, percentRankAll } from "./percentile.js";

describe("percentRank", () => {
  it("throws on an empty cohort", () => {
    expect(() => percentRank(10, [])).toThrow(/empty/);
  });

  it("returns 50 for a single-element cohort (no comparison)", () => {
    expect(percentRank(42, [42])).toBe(50);
  });

  it("scores lowest value at 0 and highest at 100 for distinct cohorts", () => {
    const cohort = [10, 20, 30];
    expect(percentRank(10, cohort)).toBe(0);
    expect(percentRank(30, cohort)).toBe(100);
  });

  it("interpolates linearly between min and max for distinct cohorts", () => {
    // Expected values are computed the same way the implementation computes
    // them, to avoid floating-point ordering mismatches (e.g., 100/3 differs
    // from (1/3)*100 in the last bit).
    const third = (1 / 3) * 100;
    const twoThirds = (2 / 3) * 100;
    expect(percentRankAll([10, 20, 30, 40])).toEqual([0, third, twoThirds, 100]);
  });

  it("uses midrank for ties — equal values share the same percentile", () => {
    expect(percentRankAll([10, 20, 20, 30])).toEqual([0, 50, 50, 100]);
  });

  it("returns 50 for every member when all values are equal", () => {
    expect(percentRankAll([7, 7, 7, 7])).toEqual([50, 50, 50, 50]);
  });

  it("scores a value below the cohort minimum at 0", () => {
    expect(percentRank(1, [10, 20, 30])).toBe(0);
  });

  it("scores a value above the cohort maximum at 100", () => {
    expect(percentRank(99, [10, 20, 30])).toBe(100);
  });

  it("treats a non-member value at the boundary like a tie with that boundary", () => {
    // Value matches an existing cohort member; midrank includes the inserted point
    expect(percentRank(20, [10, 20, 30])).toBe(50);
  });
});
