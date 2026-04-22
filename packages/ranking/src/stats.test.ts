import { describe, expect, it } from "vitest";
import {
  bootstrapMeanCi,
  groupBy,
  mean,
  mulberry32,
  quantileSorted,
  quartileBin,
  wilsonInterval,
} from "./stats.js";

describe("wilsonInterval", () => {
  it("returns null for n=0", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it("symmetric around 0.5 for 5/10", () => {
    const ci = wilsonInterval(5, 10)!;
    expect(ci.lo + ci.hi).toBeCloseTo(1.0, 5);
    expect(ci.lo).toBeGreaterThan(0);
    expect(ci.hi).toBeLessThan(1);
  });

  it("matches the known Wilson value for 60/100 at 95%", () => {
    // Reference: 60/100 → Wilson 95% CI ≈ [0.5024, 0.6906]
    const ci = wilsonInterval(60, 100)!;
    expect(ci.lo).toBeCloseTo(0.5024, 3);
    expect(ci.hi).toBeCloseTo(0.6906, 3);
  });

  it("clamps to [0,1] at extremes", () => {
    const ciAll = wilsonInterval(10, 10)!;
    const ciNone = wilsonInterval(0, 10)!;
    expect(ciAll.lo).toBeGreaterThanOrEqual(0);
    expect(ciAll.hi).toBeLessThanOrEqual(1);
    expect(ciNone.lo).toBeGreaterThanOrEqual(0);
    expect(ciNone.hi).toBeLessThanOrEqual(1);
  });

  it("throws on out-of-range successes", () => {
    expect(() => wilsonInterval(11, 10)).toThrow();
    expect(() => wilsonInterval(-1, 10)).toThrow();
  });
});

describe("mean", () => {
  it("returns null for empty", () => {
    expect(mean([])).toBeNull();
  });
  it("computes simple mean", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("bootstrapMeanCi", () => {
  it("returns null for empty sample", () => {
    expect(bootstrapMeanCi([])).toBeNull();
  });

  it("returns degenerate point CI for single value", () => {
    const ci = bootstrapMeanCi([5])!;
    expect(ci.lo).toBe(5);
    expect(ci.hi).toBe(5);
  });

  it("brackets the true mean for a tight sample with seeded RNG", () => {
    const seeded = mulberry32(42);
    const sample = Array.from({ length: 30 }, (_, i) => 10 + (i % 3));
    const trueMean = mean(sample)!;
    const ci = bootstrapMeanCi(sample, 1000, 0.05, seeded)!;
    expect(ci.lo).toBeLessThanOrEqual(trueMean);
    expect(ci.hi).toBeGreaterThanOrEqual(trueMean);
    // CI width should be modest for low-variance sample (< 1)
    expect(ci.hi - ci.lo).toBeLessThan(1);
  });

  it("is deterministic when given a seeded RNG", () => {
    const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const a = bootstrapMeanCi(sample, 500, 0.05, mulberry32(7))!;
    const b = bootstrapMeanCi(sample, 500, 0.05, mulberry32(7))!;
    expect(a.lo).toBe(b.lo);
    expect(a.hi).toBe(b.hi);
  });
});

describe("quantileSorted", () => {
  it("handles single-element arrays", () => {
    expect(quantileSorted([5], 0.5)).toBe(5);
  });

  it("interpolates linearly", () => {
    // [1,2,3,4,5] q=0.5 → idx 2 → 3
    expect(quantileSorted([1, 2, 3, 4, 5], 0.5)).toBe(3);
    // [1,2,3,4] q=0.5 → idx 1.5 → 2.5
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("returns endpoints at q=0 and q=1", () => {
    expect(quantileSorted([10, 20, 30], 0)).toBe(10);
    expect(quantileSorted([10, 20, 30], 1)).toBe(30);
  });
});

describe("quartileBin", () => {
  const ref = Array.from({ length: 20 }, (_, i) => i * 5); // 0,5,...,95

  it("returns Q1 for values ≤ 25th percentile", () => {
    expect(quartileBin(0, ref)).toBe("Q1");
    expect(quartileBin(20, ref)).toBe("Q1");
  });

  it("returns Q4 for values above 75th percentile", () => {
    expect(quartileBin(95, ref)).toBe("Q4");
  });

  it("returns Q1 when reference is empty", () => {
    expect(quartileBin(50, [])).toBe("Q1");
  });
});

describe("groupBy", () => {
  it("groups items and preserves insertion order", () => {
    const items = [
      { id: 1, key: "a" },
      { id: 2, key: "b" },
      { id: 3, key: "a" },
      { id: 4, key: "c" },
    ];
    const grouped = groupBy(items, (i) => i.key);
    expect([...grouped.keys()]).toEqual(["a", "b", "c"]);
    expect(grouped.get("a")!.map((i) => i.id)).toEqual([1, 3]);
  });
});
