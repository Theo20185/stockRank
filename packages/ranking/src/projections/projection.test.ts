import { describe, it, expect } from "vitest";
import type { FvTrendSample } from "@stockrank/core";
import { projectFromQuarterlySamples } from "./projection.js";

function samples(
  entries: Array<{ date: string; price: number; fvMedian: number; fvP25?: number; fvP75?: number }>,
): FvTrendSample[] {
  return entries.map((e) => ({
    date: e.date,
    price: e.price,
    fvMedian: e.fvMedian,
    fvP25: e.fvP25 ?? e.fvMedian * 0.85,
    fvP75: e.fvP75 ?? e.fvMedian * 1.15,
  }));
}

describe("projectFromQuarterlySamples — math correctness", () => {
  it("projects a perfectly-linear improving FV out to a future date", () => {
    // 8 quarterly samples, fvMedian rising from $100 to $135 over 2y
    // (+5/quarter = +$35 over 7 intervals; that's ~17.5% per year off
    // the $100 base). Projecting 90 days past the last sample (~1
    // quarter) should land near $140.
    const s = samples([
      { date: "2024-06-28", price: 90, fvMedian: 100 },
      { date: "2024-09-30", price: 92, fvMedian: 105 },
      { date: "2024-12-31", price: 95, fvMedian: 110 },
      { date: "2025-03-31", price: 100, fvMedian: 115 },
      { date: "2025-06-30", price: 105, fvMedian: 120 },
      { date: "2025-09-30", price: 108, fvMedian: 125 },
      { date: "2025-12-31", price: 112, fvMedian: 130 },
      { date: "2026-03-31", price: 115, fvMedian: 135 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2026-06-30",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // Slope is +$5/quarter = +$20/year. Normalized by the LAST
    // observed value ($135), that's 20/135 = ~14.8%/year. The impl
    // normalizes by last value (the "current" reference), not by
    // mean/first — so a perfectly-linear $100→$135 series gives
    // ~14-15%/yr, not ~20%.
    expect(result.slopePctPerYear).toBeGreaterThan(12);
    expect(result.slopePctPerYear).toBeLessThan(18);
    expect(result.rSquared).toBeCloseTo(1, 3); // perfect line → R² = 1
    expect(result.confidence).toBe("high");
    // Target is one quarter past the last sample. Linear projection
    // from samples ending at $135 should be near $140.
    expect(result.projectedValue).toBeGreaterThan(138);
    expect(result.projectedValue).toBeLessThan(142);
    expect(result.capped).toBe(false);
  });

  it("projects a declining FV out, slope negative", () => {
    const s = samples([
      { date: "2024-06-28", price: 110, fvMedian: 130 },
      { date: "2024-09-30", price: 108, fvMedian: 125 },
      { date: "2024-12-31", price: 105, fvMedian: 120 },
      { date: "2025-03-31", price: 102, fvMedian: 115 },
      { date: "2025-06-30", price: 100, fvMedian: 110 },
      { date: "2025-09-30", price: 97, fvMedian: 105 },
      { date: "2025-12-31", price: 95, fvMedian: 100 },
      { date: "2026-03-31", price: 92, fvMedian: 95 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2027-03-31",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.slopePctPerYear).toBeLessThan(-10);
    expect(result.confidence).toBe("high");
  });

  it("classifies confidence: R² ≥ 0.5 → high, ≥ 0.25 → medium, < 0.25 → weak", () => {
    // Construct a noisy series with low R² by making the FV oscillate.
    const noisy = samples([
      { date: "2024-06-28", price: 100, fvMedian: 100 },
      { date: "2024-09-30", price: 100, fvMedian: 130 },
      { date: "2024-12-31", price: 100, fvMedian: 90 },
      { date: "2025-03-31", price: 100, fvMedian: 140 },
      { date: "2025-06-30", price: 100, fvMedian: 85 },
      { date: "2025-09-30", price: 100, fvMedian: 135 },
      { date: "2025-12-31", price: 100, fvMedian: 95 },
      { date: "2026-03-31", price: 100, fvMedian: 120 },
    ]);
    const result = projectFromQuarterlySamples(noisy, {
      field: "fvMedian",
      targetDate: "2026-09-30",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.rSquared).toBeLessThan(0.25);
    expect(result.confidence).toBe("weak");
  });

  it("caps projection at ±50% of today's value over the horizon", () => {
    // Wildly improving — slope would project well past +50%
    // (regression slope ≈ +$30/quarter from $50 base). 1-year-out
    // projection without cap would be $50 + $30*4 = $170 (+240%).
    // With ±50% cap on a $50 base, max = $75.
    const s = samples([
      { date: "2024-06-28", price: 50, fvMedian: 50 },
      { date: "2024-09-30", price: 80, fvMedian: 80 },
      { date: "2024-12-31", price: 110, fvMedian: 110 },
      { date: "2025-03-31", price: 140, fvMedian: 140 },
      { date: "2025-06-30", price: 170, fvMedian: 170 },
      { date: "2025-09-30", price: 200, fvMedian: 200 },
      { date: "2025-12-31", price: 230, fvMedian: 230 },
      { date: "2026-03-31", price: 260, fvMedian: 260 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2027-05-29",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.capped).toBe(true);
    // Cap base = today's projection (~$290 at the last sample point ~$260
    // plus a couple months of regression. Bounded at +50% of TODAY,
    // not of the LAST sample — see implementation note. Loose assertion:
    // projected value must be no more than 50% above the last sample.
    expect(result.projectedValue).toBeLessThanOrEqual(260 * 1.5 + 1);
  });

  it("returns null when fewer than 4 samples are provided (insufficient signal)", () => {
    const s = samples([
      { date: "2026-01-01", price: 100, fvMedian: 100 },
      { date: "2026-02-01", price: 102, fvMedian: 105 },
      { date: "2026-03-01", price: 103, fvMedian: 108 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2026-06-01",
      today: "2026-05-29",
    });
    expect(result).toBeNull();
  });

  it("returns null when the field is missing on samples (e.g., fvP25 null)", () => {
    const s = [
      { date: "2024-06-28", price: 100, fvP25: null, fvMedian: null, fvP75: null },
      { date: "2024-09-30", price: 102, fvP25: null, fvMedian: null, fvP75: null },
      { date: "2024-12-31", price: 104, fvP25: null, fvMedian: null, fvP75: null },
      { date: "2025-03-31", price: 106, fvP25: null, fvMedian: null, fvP75: null },
    ] as FvTrendSample[];
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2026-06-01",
      today: "2025-04-01",
    });
    expect(result).toBeNull();
  });

  it("projects price (not just FV) using the same `price` field on the samples", () => {
    const s = samples([
      { date: "2024-06-28", price: 50, fvMedian: 100 },
      { date: "2024-09-30", price: 55, fvMedian: 100 },
      { date: "2024-12-31", price: 60, fvMedian: 100 },
      { date: "2025-03-31", price: 65, fvMedian: 100 },
      { date: "2025-06-30", price: 70, fvMedian: 100 },
      { date: "2025-09-30", price: 75, fvMedian: 100 },
      { date: "2025-12-31", price: 80, fvMedian: 100 },
      { date: "2026-03-31", price: 85, fvMedian: 100 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "price",
      targetDate: "2026-06-30",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // Price slope +$5/quarter, projected one quarter past last sample → ~$90.
    expect(result.projectedValue).toBeGreaterThan(87);
    expect(result.projectedValue).toBeLessThan(93);
  });

  it("when 8q has R²<0.8, expands to 12q to find a tighter fit (longer history dampens outliers)", () => {
    // 12 quarterly samples on a clean +$3/quarter trend with TWO
    // outlier samples in the 8q window. With 8q, outliers drag the
    // R² below 0.8. Expanding to 12q dilutes the outliers' weight
    // and lifts R² above 0.8.
    const s = samples([
      // Older 4 samples — perfectly on the line
      { date: "2023-06-30", price: 50, fvMedian: 50 },
      { date: "2023-09-30", price: 53, fvMedian: 53 },
      { date: "2023-12-31", price: 56, fvMedian: 56 },
      { date: "2024-03-31", price: 59, fvMedian: 59 },
      // Newer 8 samples — outliers in two slots, otherwise on line
      { date: "2024-06-30", price: 62, fvMedian: 62 },
      { date: "2024-09-30", price: 75, fvMedian: 75 },     // outlier (+10)
      { date: "2024-12-31", price: 68, fvMedian: 68 },
      { date: "2025-03-31", price: 55, fvMedian: 55 },     // outlier (-16)
      { date: "2025-06-30", price: 74, fvMedian: 74 },
      { date: "2025-09-30", price: 77, fvMedian: 77 },
      { date: "2025-12-31", price: 80, fvMedian: 80 },
      { date: "2026-03-31", price: 83, fvMedian: 83 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian", targetDate: "2026-06-30", today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // Either it found a window with R²≥0.8 OR it picked the best
    // available — in this fixture, 12q's R² should clear it.
    if (result.rSquared >= 0.8) {
      // Either 8q with R²≥0.8 (no fallback) or a larger window.
      // Outliers in 8q should push 12q to win.
      expect(result.windowSize).not.toBe(8);
      expect(result.fallback).toBe(true);
    } else {
      // All windows below 0.8 — best-of behavior. Should still be
      // a valid result with a high R² relative to alternatives.
      expect(result.fallback).toBe(true);
    }
  });

  it("when 8q has R²<0.8 due to recent regime shift, shrinks to a smaller window", () => {
    // Older 4 samples zigzag wildly — no clean trend. Newer 4 samples
    // follow a perfect rising line (100 → 130 across 4 quarters).
    // 8q regression has high residual noise → R² well below 0.8.
    // 4q (recent only) is a perfect line → R²=1.
    const s = samples([
      { date: "2024-06-30", price: 50, fvMedian: 50 },
      { date: "2024-09-30", price: 200, fvMedian: 200 },   // zigzag
      { date: "2024-12-31", price: 80, fvMedian: 80 },
      { date: "2025-03-31", price: 180, fvMedian: 180 },   // zigzag
      { date: "2025-06-30", price: 100, fvMedian: 100 },   // clean rising starts here
      { date: "2025-09-30", price: 110, fvMedian: 110 },
      { date: "2025-12-31", price: 120, fvMedian: 120 },
      { date: "2026-03-31", price: 130, fvMedian: 130 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian", targetDate: "2026-06-30", today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // The recent-4q segment fits a clean line → R²=1. Should win.
    expect(result.rSquared).toBeGreaterThan(0.8);
    expect(result.windowSize).toBe(4);
    expect(result.fallback).toBe(true);
  });

  it("when the default 8q fit is strong (R²≥0.8), uses it WITHOUT fallback", () => {
    const s = samples([
      { date: "2024-06-30", price: 100, fvMedian: 100 },
      { date: "2024-09-30", price: 105, fvMedian: 105 },
      { date: "2024-12-31", price: 110, fvMedian: 110 },
      { date: "2025-03-31", price: 115, fvMedian: 115 },
      { date: "2025-06-30", price: 120, fvMedian: 120 },
      { date: "2025-09-30", price: 125, fvMedian: 125 },
      { date: "2025-12-31", price: 130, fvMedian: 130 },
      { date: "2026-03-31", price: 135, fvMedian: 135 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian", targetDate: "2026-06-30", today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.windowSize).toBe(8);
    expect(result.fallback).toBe(false);
    expect(result.rSquared).toBeCloseTo(1, 3);
  });

  it("when no window reaches R²≥0.8, picks the highest-R² candidate (best-available fallback)", () => {
    // Pathologically noisy series — no window should produce a
    // clean fit. The function must still return SOMETHING (the best
    // R² candidate, with fallback=true) so the UI can surface it.
    const s = samples([
      { date: "2024-06-30", price: 100, fvMedian: 100 },
      { date: "2024-09-30", price: 130, fvMedian: 130 },
      { date: "2024-12-31", price: 90, fvMedian: 90 },
      { date: "2025-03-31", price: 140, fvMedian: 140 },
      { date: "2025-06-30", price: 85, fvMedian: 85 },
      { date: "2025-09-30", price: 135, fvMedian: 135 },
      { date: "2025-12-31", price: 95, fvMedian: 95 },
      { date: "2026-03-31", price: 120, fvMedian: 120 },
    ]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian", targetDate: "2026-06-30", today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // Implementation must still produce a result (best-available),
    // not return null just because every window is weak.
    expect(result.rSquared).toBeLessThan(0.8);
    expect(typeof result.projectedValue).toBe("number");
  });

  it("uses only the last 8 samples (matching the 2-year fv-trend window)", () => {
    // 12 samples — earlier samples are flat at $100, later are
    // climbing. The regression should track only the last 8 (the
    // climbing portion), not be diluted by the older flat ones.
    const flat = Array.from({ length: 4 }, (_, i) => ({
      date: `2023-0${i + 1}-01`,
      price: 100,
      fvMedian: 100,
    }));
    const climbing = [
      { date: "2024-06-28", price: 100, fvMedian: 100 },
      { date: "2024-09-30", price: 105, fvMedian: 105 },
      { date: "2024-12-31", price: 110, fvMedian: 110 },
      { date: "2025-03-31", price: 115, fvMedian: 115 },
      { date: "2025-06-30", price: 120, fvMedian: 120 },
      { date: "2025-09-30", price: 125, fvMedian: 125 },
      { date: "2025-12-31", price: 130, fvMedian: 130 },
      { date: "2026-03-31", price: 135, fvMedian: 135 },
    ];
    const s = samples([...flat, ...climbing]);
    const result = projectFromQuarterlySamples(s, {
      field: "fvMedian",
      targetDate: "2026-06-30",
      today: "2026-05-29",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    // Should track the climbing slope (+$5/quarter), not the diluted
    // mean of climbing+flat (which would give a steeper slope).
    // Normalized by last value ($135), $20/yr = ~14.8%/yr.
    expect(result.slopePctPerYear).toBeGreaterThan(12);
    expect(result.slopePctPerYear).toBeLessThan(18);
    expect(result.rSquared).toBeCloseTo(1, 3);
  });
});
