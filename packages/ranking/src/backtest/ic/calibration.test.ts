import { describe, it, expect } from "vitest";
import { mulberry32 } from "../../stats.js";
import type { IcObservation } from "./types.js";
import { runCalibration, falseDiscoveryCheck } from "./calibration.js";

/**
 * Build a synthetic dataset where:
 *  - 5 super-groups
 *  - 8 symbols per super-group
 *  - 10 snapshot dates spread over 10 years (annual cadence so dedup
 *    is a no-op)
 *  - One horizon (1y)
 *  - Factor percentile randomly drawn ∈ [0, 100]
 *  - Excess return randomly drawn from N(0, 0.1) — INDEPENDENT of
 *    the factor (so the true IC is 0 by construction)
 */
function makeNullDataset(seed = 99): IcObservation[] {
  const rng = mulberry32(seed);
  const observations: IcObservation[] = [];
  const sgs: Array<"banks-lending" | "utilities" | "energy" | "industrials" | "consumer-staples"> = [
    "banks-lending",
    "utilities",
    "energy",
    "industrials",
    "consumer-staples",
  ];
  for (let yi = 0; yi < 10; yi += 1) {
    const date = `${2015 + yi}-06-30`;
    for (const sg of sgs) {
      for (let s = 0; s < 8; s += 1) {
        observations.push({
          symbol: `${sg.slice(0, 3)}_${s}`,
          snapshotDate: date,
          snapshotYear: 2015 + yi,
          superGroup: sg,
          horizon: 1,
          factorPercentiles: { roic: rng() * 100 },
          excessReturn: (rng() - 0.5) * 0.2,
        });
      }
    }
  }
  return observations;
}

describe("runCalibration", () => {
  it("produces one threshold per (superGroup, horizon) cell present in the data", () => {
    const obs = makeNullDataset();
    const cal = runCalibration(obs, { iterations: 50, seed: 1 });
    // 5 super-groups × 1 horizon = 5 thresholds
    expect(cal.thresholds.length).toBe(5);
  });

  it("threshold99 is positive and < 1", () => {
    const obs = makeNullDataset();
    const cal = runCalibration(obs, { iterations: 100, seed: 1 });
    for (const t of cal.thresholds) {
      expect(t.threshold99).toBeGreaterThan(0);
      expect(t.threshold99).toBeLessThan(1);
      // 99th ≤ 99.5th
      expect(t.threshold995).toBeGreaterThanOrEqual(t.threshold99);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const obs = makeNullDataset();
    const a = runCalibration(obs, { iterations: 30, seed: 7 });
    const b = runCalibration(obs, { iterations: 30, seed: 7 });
    // Compare thresholds — should match exactly
    expect(a.thresholds.length).toBe(b.thresholds.length);
    for (let i = 0; i < a.thresholds.length; i += 1) {
      expect(a.thresholds[i]!.threshold99).toBeCloseTo(
        b.thresholds[i]!.threshold99,
        10,
      );
    }
  });

  it("smaller-N cells produce LOOSER thresholds (more noise tolerated)", () => {
    // Build a dataset where one super-group has 3 symbols and another
    // has 30 — same dates. The 3-symbol cell's threshold99 should be
    // higher (noisier under null).
    const observations: IcObservation[] = [];
    const rng = mulberry32(123);
    for (let yi = 0; yi < 10; yi += 1) {
      const date = `${2015 + yi}-06-30`;
      // Small cell
      for (let s = 0; s < 3; s += 1) {
        observations.push({
          symbol: `BNK_${s}`,
          snapshotDate: date,
          snapshotYear: 2015 + yi,
          superGroup: "banks-lending",
          horizon: 1,
          factorPercentiles: { roic: rng() * 100 },
          excessReturn: (rng() - 0.5) * 0.2,
        });
      }
      // Large cell
      for (let s = 0; s < 30; s += 1) {
        observations.push({
          symbol: `UTI_${s}`,
          snapshotDate: date,
          snapshotYear: 2015 + yi,
          superGroup: "utilities",
          horizon: 1,
          factorPercentiles: { roic: rng() * 100 },
          excessReturn: (rng() - 0.5) * 0.2,
        });
      }
    }
    const cal = runCalibration(observations, { iterations: 200, seed: 1 });
    const small = cal.thresholds.find((t) => t.superGroup === "banks-lending")!;
    const big = cal.thresholds.find((t) => t.superGroup === "utilities")!;
    expect(small.threshold99).toBeGreaterThan(big.threshold99);
  });
});

describe("falseDiscoveryCheck", () => {
  it("returns 'noise' when no real cells exceed thresholds", () => {
    const realIcs = new Map<string, number>();
    realIcs.set("banks-lending|1", 0.01);
    realIcs.set("utilities|1", 0.005);
    const thresholds = [
      { superGroup: "banks-lending" as const, horizon: 1, nEffective: 80, threshold99: 0.15, threshold995: 0.18 },
      { superGroup: "utilities" as const, horizon: 1, nEffective: 80, threshold99: 0.15, threshold995: 0.18 },
    ];
    const result = falseDiscoveryCheck(realIcs, thresholds);
    expect(result.cellsSurvivingGate1).toBe(0);
    expect(result.verdict).toBe("noise");
  });

  it("returns 'real-signal' when many cells exceed thresholds", () => {
    const realIcs = new Map<string, number>();
    const thresholds = [];
    // 5 super-groups × all factors → 5 × 14 = 70 cells.
    // We model 10 cells (per super-group) all having strong IC.
    const sgs: Array<"banks-lending" | "utilities" | "energy" | "industrials" | "consumer-staples"> = [
      "banks-lending",
      "utilities",
      "energy",
      "industrials",
      "consumer-staples",
    ];
    for (const sg of sgs) {
      thresholds.push({ superGroup: sg, horizon: 1, nEffective: 100, threshold99: 0.10, threshold995: 0.12 });
      realIcs.set(`${sg}|1`, 0.30); // strong signal
    }
    // Note: realIcs is keyed by (sg, horizon), not (sg, factor, horizon)
    // — falseDiscoveryCheck collapses to per-cell. We model that
    // 5 of 70 (~7%) cells survive, expected by chance ≈ 0.7.
    const result = falseDiscoveryCheck(realIcs, thresholds);
    expect(result.cellsSurvivingGate1).toBe(5);
    // expectedByChance = thresholds.length * FACTORS.length * 0.01
    // = 5 SGs * 16 factors * 0.01 = 0.8
    expect(result.expectedByChance).toBeCloseTo(0.8, 5);
    expect(result.ratio).toBeGreaterThan(5);
    expect(result.verdict).toBe("real-signal");
  });
});
