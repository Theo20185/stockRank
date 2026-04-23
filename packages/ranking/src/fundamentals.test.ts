import { describe, expect, it } from "vitest";
import { classifyFundamentalsDirection } from "./fundamentals.js";

describe("classifyFundamentalsDirection", () => {
  // ---------- HAPPY PATH ----------

  it("returns 'improving' when both past trend and forward EPS confirm growth (NVDA-like)", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: 6.0, // +20%
      pastAnnualEps: [4.0, 3.5, 3.0, 2.5], // newest first → growing slope
    });
    expect(r).toBe("improving");
  });

  it("returns 'declining' when both past trend and forward EPS confirm decline", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 3.0,
      forwardEps: 2.5, // -17%
      pastAnnualEps: [3.5, 4.0, 5.0, 5.5], // declining over time
    });
    expect(r).toBe("declining");
  });

  it("returns 'stable' when past trend is improving but forward is flat (decelerating growth)", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: 5.05, // ~flat
      pastAnnualEps: [4.0, 3.5, 3.0],
    });
    expect(r).toBe("stable");
  });

  it("returns 'stable' when past trend declining but forward EPS rebounds (turnaround story)", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 2.0,
      forwardEps: 3.0, // +50%
      pastAnnualEps: [3.0, 4.0, 5.0],
    });
    expect(r).toBe("stable"); // mixed signal — not confirmed improving
  });

  // ---------- THE LULU PATTERN (the user's specific case) ----------

  it("returns 'stable' for the LULU plateau pattern — past growth + flat forward = NOT improving", () => {
    // LULU: long-term growth ($4.50→$14.64) but recent plateau (TTM
    // $13.26, forward $13.27 ≈ flat). Past slope is still positive
    // because the multi-year arc dominates, but forward gives no
    // evidence the growth resumes. → "stable" — NOT confirmed
    // improving. The bucket layer's demote rule treats "stable" the
    // same as "declining" when fvTrend is "improving" — so LULU
    // still gets pushed to Watch.
    const r = classifyFundamentalsDirection({
      trailingEps: 13.26,
      forwardEps: 13.27,
      pastAnnualEps: [14.64, 12.20, 7.76, 7.49, 4.50],
    });
    expect(r).toBe("stable");
  });

  it("returns 'declining' when forward EPS is materially below trailing (analyst-confirmed cut)", () => {
    // Stronger signal than LULU: forward analysts have cut estimates
    // below trailing → analyst-confirmed deterioration.
    const r = classifyFundamentalsDirection({
      trailingEps: 13.26,
      forwardEps: 11.00, // -17%
      pastAnnualEps: [14.64, 12.20, 7.76],
    });
    expect(r).toBe("declining");
  });

  // ---------- NEGATIVE EPS HANDLING ----------

  it("returns 'improving' when trailing is loss but forward turns profitable (turnaround)", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: -1.5,
      forwardEps: 2.0,
      pastAnnualEps: [-2.0, -3.0, -2.5, -1.0],
    });
    expect(r).toBe("improving");
  });

  it("returns 'declining' when trailing is profitable but forward turns loss", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 2.0,
      forwardEps: -1.0,
      pastAnnualEps: [3.0, 2.5, 2.0],
    });
    expect(r).toBe("declining");
  });

  it("returns 'declining' when both trailing and forward are losses", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: -1.0,
      forwardEps: -2.0,
      pastAnnualEps: [-0.5, 1.0, 2.0],
    });
    expect(r).toBe("declining");
  });

  // ---------- INSUFFICIENT DATA ----------

  it("returns 'insufficient_data' when trailing EPS is null", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: null,
      forwardEps: 3.0,
      pastAnnualEps: [2.5, 2.0],
    });
    expect(r).toBe("insufficient_data");
  });

  it("returns 'insufficient_data' when fewer than 2 past annual EPS points", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 3.0,
      forwardEps: 4.0,
      pastAnnualEps: [2.5],
    });
    expect(r).toBe("insufficient_data");
  });

  it("treats forwardEps null as 'forward unknown' — falls back to past-trend signal", () => {
    // Past clearly improving, no forward signal → not strong enough to confirm.
    const r = classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: null,
      pastAnnualEps: [4.0, 3.0, 2.5, 2.0],
    });
    expect(r).toBe("stable");
  });

  it("filters null entries from pastAnnualEps before computing slope", () => {
    const r = classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: 6.0,
      pastAnnualEps: [4.0, null as unknown as number, 3.0, 2.5],
    });
    expect(r).toBe("improving");
  });

  // ---------- THRESHOLD CUSTOMIZATION ----------

  it("respects custom thresholdPct — 10% requires bigger move to flip", () => {
    // forward 6% above trailing — under threshold 10 → not "improving"
    const r = classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: 5.3,
      pastAnnualEps: [4.5, 4.0, 3.5],
      thresholdPct: 10,
    });
    expect(r).toBe("stable");
  });

  // ---------- DETERMINISM SANITY ----------

  it("does not mutate the pastAnnualEps input array", () => {
    const past = [4.0, 3.0, 2.5];
    const beforeJson = JSON.stringify(past);
    classifyFundamentalsDirection({
      trailingEps: 5.0,
      forwardEps: 6.0,
      pastAnnualEps: past,
    });
    expect(JSON.stringify(past)).toBe(beforeJson);
  });
});
