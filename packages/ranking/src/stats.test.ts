import { describe, expect, it } from "vitest";
import {
  bootstrapMeanCi,
  bootstrapSpearmanCi,
  groupBy,
  mean,
  mulberry32,
  quantileSorted,
  quartileBin,
  ranksWithTies,
  shuffleInPlace,
  spearmanCorrelation,
  wilsonInterval,
} from "./stats.js";

describe("ranksWithTies", () => {
  it("returns 1..N when all values are unique", () => {
    expect(ranksWithTies([10, 20, 30])).toEqual([1, 2, 3]);
    expect(ranksWithTies([30, 10, 20])).toEqual([3, 1, 2]);
  });

  it("averages tied positions", () => {
    // [10, 10, 20] — first two tied at positions 1+2 → avg 1.5
    expect(ranksWithTies([10, 10, 20])).toEqual([1.5, 1.5, 3]);
    // All equal → avg of 1+2+3+4 = 2.5
    expect(ranksWithTies([5, 5, 5, 5])).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  it("handles empty array", () => {
    expect(ranksWithTies([])).toEqual([]);
  });
});

describe("spearmanCorrelation", () => {
  it("returns 1 for perfectly monotone-increasing pairs", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 6);
  });

  it("returns -1 for perfectly monotone-decreasing pairs", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [40, 30, 20, 10])).toBeCloseTo(-1, 6);
  });

  it("equals 1 even with non-linear monotone transform (the point of Spearman)", () => {
    // y = exp(x) is non-linear but monotone — Pearson would NOT be 1
    const xs = [1, 2, 3, 4, 5];
    const ys = xs.map((x) => Math.exp(x));
    expect(spearmanCorrelation(xs, ys)).toBeCloseTo(1, 6);
  });

  it("returns null when either array is constant", () => {
    expect(spearmanCorrelation([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(spearmanCorrelation([1, 2, 3], [5, 5, 5])).toBeNull();
  });

  it("returns null when arrays are too short", () => {
    expect(spearmanCorrelation([1], [2])).toBeNull();
    expect(spearmanCorrelation([], [])).toBeNull();
  });

  it("throws on length mismatch (caller bug)", () => {
    expect(() => spearmanCorrelation([1, 2], [1, 2, 3])).toThrow();
  });

  it("computes a known intermediate value correctly", () => {
    // Reference computation by hand:
    //   xs = [1,2,3,4,5], ys = [3,1,4,1,5]
    //   ranks(xs) = [1,2,3,4,5]
    //   ranks(ys) = [3, 1.5, 4, 1.5, 5]  (ties at value 1 average to 1.5)
    //   mean(rx) = 3, mean(ry) = 3
    //   dx = [-2,-1,0,1,2], dy = [0,-1.5,1,-1.5,2]
    //   sum(dx*dy) = 0 + 1.5 + 0 - 1.5 + 4 = 4
    //   sum(dx^2) = 10, sum(dy^2) = 9.5
    //   r = 4 / sqrt(10*9.5) = 4 / sqrt(95) ≈ 0.4104
    const result = spearmanCorrelation([1, 2, 3, 4, 5], [3, 1, 4, 1, 5])!;
    expect(result).toBeCloseTo(0.4104, 3);
  });
});

describe("bootstrapSpearmanCi", () => {
  it("produces a CI containing the point estimate when correlation is real", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const ys = xs.map((x) => x + (x % 5)); // strongly correlated with some noise
    const point = spearmanCorrelation(xs, ys)!;
    const ci = bootstrapSpearmanCi(xs, ys, 500, 0.05, mulberry32(42))!;
    expect(ci.lo).toBeLessThanOrEqual(point);
    expect(ci.hi).toBeGreaterThanOrEqual(point);
  });

  it("returns null when sample is too small", () => {
    expect(bootstrapSpearmanCi([1, 2], [1, 2])).toBeNull();
  });

  it("CI for an uncorrelated sample includes 0", () => {
    const rng = mulberry32(7);
    const xs = Array.from({ length: 50 }, () => rng());
    const ys = Array.from({ length: 50 }, () => rng());
    const ci = bootstrapSpearmanCi(xs, ys, 500, 0.05, mulberry32(11))!;
    expect(ci.lo).toBeLessThan(0);
    expect(ci.hi).toBeGreaterThan(0);
  });
});

describe("shuffleInPlace", () => {
  it("preserves the multiset of values", () => {
    const arr = [1, 2, 3, 4, 5];
    shuffleInPlace(arr, mulberry32(42));
    expect([...arr].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("is deterministic with a seeded RNG", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = [...a];
    shuffleInPlace(a, mulberry32(99));
    shuffleInPlace(b, mulberry32(99));
    expect(a).toEqual(b);
  });

  it("does change order on a non-trivial input (with high probability)", () => {
    const a = Array.from({ length: 20 }, (_, i) => i);
    const original = [...a];
    shuffleInPlace(a, mulberry32(123));
    expect(a).not.toEqual(original);
  });
});

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
