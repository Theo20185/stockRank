import { describe, it, expect } from "vitest";
import type { IcCell, IcCalibration } from "./types.js";
import { applyThreeGates, applyGatesToAll, ECONOMIC_FLOOR_IC } from "./three-gate.js";

function cell(overrides: Partial<IcCell> = {}): IcCell {
  return {
    superGroup: "banks-lending",
    factor: "roic",
    horizon: 1,
    nEffective: 100,
    ic: 0.20,
    ci95: { lo: 0.10, hi: 0.30 },
    windowIcs: [0.18, 0.22, 0.20],
    ...overrides,
  };
}

function thresholds(t: number): Map<string, number> {
  return new Map([["banks-lending|1", t]]);
}

describe("applyThreeGates", () => {
  it("passes when all three gates clear", () => {
    const v = applyThreeGates(cell({ ic: 0.20 }), thresholds(0.10));
    expect(v.verdict).toBe("pass");
  });

  it("fails statistical when |IC| is below the per-cell null threshold", () => {
    const v = applyThreeGates(cell({ ic: 0.05 }), thresholds(0.10));
    expect(v.verdict).toBe("fail-statistical");
  });

  it("fails economic when |IC| is above the noise floor but below 0.05", () => {
    // Noise threshold 0.02 → IC 0.04 passes statistical but fails economic
    const v = applyThreeGates(cell({ ic: 0.04 }), thresholds(0.02));
    expect(v.verdict).toBe("fail-economic");
    expect(ECONOMIC_FLOOR_IC).toBe(0.05);
  });

  it("fails sign-stability when fewer than 2 of 3 windows agree", () => {
    const v = applyThreeGates(
      cell({ ic: 0.20, windowIcs: [0.20, -0.10, -0.05] }),
      thresholds(0.10),
    );
    expect(v.verdict).toBe("fail-sign-stability");
  });

  it("fails sign-stability when too few windows have data", () => {
    const v = applyThreeGates(
      cell({ ic: 0.20, windowIcs: [0.20, null, null] }),
      thresholds(0.10),
    );
    expect(v.verdict).toBe("fail-sign-stability");
  });

  it("passes sign-stability with 2 of 3 valid same-sign windows (third null)", () => {
    const v = applyThreeGates(
      cell({ ic: 0.20, windowIcs: [0.18, 0.22, null] }),
      thresholds(0.10),
    );
    expect(v.verdict).toBe("pass");
  });

  it("fails insufficient-data when ic is null", () => {
    const v = applyThreeGates(cell({ ic: null }), thresholds(0.10));
    expect(v.verdict).toBe("fail-insufficient-data");
  });

  it("fails insufficient-data when calibration has no threshold for the cell", () => {
    const v = applyThreeGates(
      cell({ superGroup: "tobacco" as never }),
      thresholds(0.10),
    );
    expect(v.verdict).toBe("fail-insufficient-data");
  });
});

describe("applyGatesToAll", () => {
  it("annotates each cell with a verdict using a flat IcCalibration", () => {
    const cal: IcCalibration = {
      iterations: 100,
      generatedAt: "2026-04-25T00:00:00Z",
      thresholds: [
        { superGroup: "banks-lending", horizon: 1, nEffective: 100, threshold99: 0.15, threshold995: 0.18 },
      ],
    };
    const cells = [
      cell({ ic: 0.20 }), // pass
      cell({ ic: 0.10 }), // fail-statistical
    ];
    const out = applyGatesToAll(cells, cal);
    expect(out[0]?.verdict.verdict).toBe("pass");
    expect(out[1]?.verdict.verdict).toBe("fail-statistical");
  });
});
