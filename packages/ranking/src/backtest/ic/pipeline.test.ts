import { describe, it, expect } from "vitest";
import { FACTORS } from "../../factors.js";
import type { IcObservation } from "./types.js";
import {
  buildRollingWindows,
  computeIcCells,
  computeIcForCell,
  dedupeYearly,
} from "./pipeline.js";

function obs(
  symbol: string,
  date: string,
  excessReturn: number,
  factorPercentile: number,
  superGroup: "banks-lending" | "utilities" = "banks-lending",
): IcObservation {
  return {
    symbol,
    snapshotDate: date,
    snapshotYear: parseInt(date.slice(0, 4), 10),
    superGroup,
    horizon: 1,
    factorPercentiles: { roic: factorPercentile },
    excessReturn,
  };
}

describe("dedupeYearly", () => {
  it("keeps one observation per (symbol, year)", () => {
    const input = [
      obs("AAA", "2020-01-31", 0.1, 50),
      obs("AAA", "2020-06-30", 0.2, 60),
      obs("AAA", "2021-01-31", 0.3, 70),
      obs("BBB", "2020-03-31", 0.4, 80),
    ];
    const result = dedupeYearly(input);
    expect(result.length).toBe(3);
    // For AAA in 2020, the earliest snapshot wins
    const aaa2020 = result.find(
      (o) => o.symbol === "AAA" && o.snapshotYear === 2020,
    );
    expect(aaa2020?.snapshotDate).toBe("2020-01-31");
  });

  it("preserves all observations when none are duplicates", () => {
    const input = [
      obs("AAA", "2020-01-31", 0.1, 50),
      obs("BBB", "2020-01-31", 0.2, 60),
      obs("AAA", "2021-01-31", 0.3, 70),
    ];
    expect(dedupeYearly(input).length).toBe(3);
  });
});

describe("buildRollingWindows", () => {
  it("returns empty when observations are empty", () => {
    expect(buildRollingWindows([])).toEqual([]);
  });

  it("partitions a 9-year span into 3 roughly equal windows", () => {
    const obsList = [
      obs("A", "2015-01-01", 0, 0),
      obs("A", "2024-12-31", 0, 0),
    ];
    const wins = buildRollingWindows(obsList, 3);
    expect(wins.length).toBe(3);
    expect(wins[0]?.start).toBe("2015-01-01");
    expect(wins[2]?.end > "2024-12-31").toBe(true); // last window's end is exclusive past latest
  });

  it("collapses to a single window when all observations share a date", () => {
    const obsList = [
      obs("A", "2020-01-01", 0, 0),
      obs("B", "2020-01-01", 0, 0),
    ];
    const wins = buildRollingWindows(obsList, 3);
    expect(wins.length).toBe(1);
  });
});

describe("computeIcForCell", () => {
  it("returns IC ≈ 1 when factor and return are perfectly monotone", () => {
    const obsList = [
      obs("A", "2020-01-31", 1.0, 10),
      obs("B", "2020-01-31", 2.0, 30),
      obs("C", "2020-01-31", 3.0, 50),
      obs("D", "2020-01-31", 4.0, 70),
      obs("E", "2020-01-31", 5.0, 90),
    ];
    const wins = buildRollingWindows(obsList, 3);
    const cell = computeIcForCell(
      "banks-lending",
      "roic",
      1,
      obsList,
      wins,
      42,
    );
    expect(cell.ic).toBeCloseTo(1, 5);
    expect(cell.nEffective).toBe(5);
  });

  it("returns IC ≈ -1 when factor and return are perfectly inversely monotone", () => {
    const obsList = [
      obs("A", "2020-01-31", 5.0, 10),
      obs("B", "2020-01-31", 4.0, 30),
      obs("C", "2020-01-31", 3.0, 50),
      obs("D", "2020-01-31", 2.0, 70),
      obs("E", "2020-01-31", 1.0, 90),
    ];
    const wins = buildRollingWindows(obsList, 3);
    const cell = computeIcForCell(
      "banks-lending",
      "roic",
      1,
      obsList,
      wins,
      42,
    );
    expect(cell.ic).toBeCloseTo(-1, 5);
  });

  it("dedups within (symbol, year) before computing", () => {
    const obsList = [
      obs("A", "2020-01-31", 1.0, 10),
      obs("A", "2020-06-30", 99.0, 99), // should be dropped (same year)
      obs("B", "2020-01-31", 2.0, 30),
      obs("C", "2020-01-31", 3.0, 50),
    ];
    const wins = buildRollingWindows(obsList, 3);
    const cell = computeIcForCell(
      "banks-lending",
      "roic",
      1,
      obsList,
      wins,
      42,
    );
    expect(cell.nEffective).toBe(3);
  });

  it("returns ic=null when factor data is missing for all observations", () => {
    const obsList: IcObservation[] = [
      {
        ...obs("A", "2020-01-31", 1.0, 10),
        factorPercentiles: {}, // no roic
      },
    ];
    const wins = buildRollingWindows(obsList, 3);
    const cell = computeIcForCell(
      "banks-lending",
      "roic",
      1,
      obsList,
      wins,
      42,
    );
    expect(cell.ic).toBeNull();
    expect(cell.nEffective).toBe(0);
  });

  it("computes per-window ICs for the sign-stability gate", () => {
    // 9 dates spread across 3 windows; in each window, factor → return
    // is perfectly monotone but the sign FLIPS in window 2.
    const obsList: IcObservation[] = [];
    const seedDates = [
      "2015-01-01", "2015-06-01", "2015-12-01", // window 1: positive
      "2018-01-01", "2018-06-01", "2018-12-01", // window 2: negative
      "2022-01-01", "2022-06-01", "2022-12-01", // window 3: positive
    ];
    seedDates.forEach((date, i) => {
      // Within each triplet, perfect ranking pattern with sign flip in win 2
      const winIdx = Math.floor(i / 3);
      const idxInWin = i % 3;
      const factor = idxInWin === 0 ? 10 : idxInWin === 1 ? 50 : 90;
      const ret = winIdx === 1
        ? (idxInWin === 0 ? 5 : idxInWin === 1 ? 3 : 1)  // negative slope
        : (idxInWin === 0 ? 1 : idxInWin === 1 ? 3 : 5); // positive
      obsList.push({
        ...obs(`S${i}`, date, ret, factor),
        snapshotYear: parseInt(date.slice(0, 4), 10),
      });
    });
    const wins = buildRollingWindows(obsList, 3);
    expect(wins.length).toBe(3);
    const cell = computeIcForCell(
      "banks-lending",
      "roic",
      1,
      obsList,
      wins,
      42,
    );
    expect(cell.windowIcs.length).toBe(3);
    // First and third windows should be positive, middle negative
    expect(cell.windowIcs[0]).not.toBeNull();
    expect(cell.windowIcs[1]).not.toBeNull();
    expect(cell.windowIcs[2]).not.toBeNull();
    expect(cell.windowIcs[0]!).toBeGreaterThan(0);
    expect(cell.windowIcs[1]!).toBeLessThan(0);
    expect(cell.windowIcs[2]!).toBeGreaterThan(0);
  });
});

describe("computeIcCells (full grid)", () => {
  it("emits one cell per (superGroup × factor × horizon) present in the data", () => {
    // Two super-groups, two horizons, one factor with data — so
    // 2 SGs × 2 horizons × N factors = 2 × 2 × |FACTORS| cells.
    const dates = ["2020-01-31", "2021-01-31", "2022-01-31"];
    const obsList: IcObservation[] = [];
    for (const date of dates) {
      for (let i = 0; i < 6; i += 1) {
        obsList.push(obs(`S${i}`, date, i * 0.1, i * 15));
        obsList.push(obs(`U${i}`, date, i * 0.2, i * 15, "utilities"));
      }
      // Add horizon-3 observations too
      for (let i = 0; i < 6; i += 1) {
        obsList.push({
          ...obs(`S${i}`, date, i * 0.3, i * 15),
          horizon: 3,
        });
        obsList.push({
          ...obs(`U${i}`, date, i * 0.4, i * 15, "utilities"),
          horizon: 3,
        });
      }
    }
    const cells = computeIcCells(obsList);
    // Count distinct (sg, horizon) cells in the input
    const sgHorizons = new Set<string>();
    for (const o of obsList) sgHorizons.add(`${o.superGroup}|${o.horizon}`);
    // FACTORS count is from packages/ranking/src/factors.ts
    // Currently 14 factors (4 val + 3 health + 2 quality + 4 shr + 2 growth + 1 momentum)
    // The test stays robust by computing the expected count on the fly:
    expect(cells.length).toBe(sgHorizons.size * FACTORS.length);
  });
});
