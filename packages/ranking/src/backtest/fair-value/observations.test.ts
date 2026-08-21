import { describe, expect, it } from "vitest";
import type { CompanySnapshot } from "@stockrank/core";
import { makeCompany, makePeriod, makeTtm } from "../../test-helpers.js";
import { buildFvObservations, downsampleWeekly } from "./observations.js";

/** 10-company same-industry universe so the cohort path is "cohort"
 * (≥ 8 peers at the same cap bucket). Distinct P/Es so the peer
 * median is a real number. */
function universe(): CompanySnapshot[] {
  return Array.from({ length: 10 }, (_, i) =>
    makeCompany({
      symbol: `SYM${i}`,
      industry: "Semiconductors",
      sector: "Technology",
      ttm: makeTtm({ peRatio: 15 + i, forwardEps: 6 }),
    }),
  );
}

function inputs(u: CompanySnapshot[]) {
  const date = "2020-06-30";
  const fwd = new Map<string, Map<string, number>>([
    [
      date,
      new Map(u.flatMap((c) => [
        [`${c.symbol}|1`, 0.2],
        [`${c.symbol}|3`, 0.5],
      ])),
    ],
  ]);
  const spy = new Map<string, Map<string, number>>([
    [date, new Map([["1", 0.1], ["3", 0.2]])],
  ]);
  return {
    snapshotsByDate: new Map([[date, u]]),
    forwardReturnsByDate: fwd,
    spyReturnsByDate: spy,
    horizons: [1, 3] as const,
  };
}

describe("buildFvObservations", () => {
  it("emits one row per (symbol, horizon) with excess = fwd − spy", () => {
    const { observations, engineErrorRows } = buildFvObservations(inputs(universe()));
    expect(engineErrorRows).toBe(0);
    expect(observations.length).toBe(20); // 10 symbols × 2 horizons
    const row = observations.find((o) => o.symbol === "SYM0" && o.horizon === 1)!;
    expect(row.excessReturn).toBeCloseTo(0.1, 10);
    const row3 = observations.find((o) => o.symbol === "SYM0" && o.horizon === 3)!;
    expect(row3.excessReturn).toBeCloseTo(0.3, 10);
  });

  it("belowP25 is consistent with price vs the band", () => {
    const { observations } = buildFvObservations(inputs(universe()));
    for (const o of observations) {
      if (o.fv.p25 === null) {
        expect(o.fv.belowP25).toBeNull();
      } else {
        expect(o.fv.belowP25).toBe(o.price < o.fv.p25);
      }
    }
  });

  it("carries pre-suppression anchors alongside production anchors", () => {
    const { observations } = buildFvObservations(inputs(universe()));
    for (const o of observations) {
      // Not divergent in this fixture → the two sets must be equal.
      expect(o.fv.peerCohortDivergent).toBe(false);
      expect(o.fv.anchorsPre).toEqual(o.fv.anchors);
    }
  });

  it("computes the directed peer-premium ratio from the engine's own cohort", () => {
    const { observations } = buildFvObservations(inputs(universe()));
    const row = observations.find((o) => o.symbol === "SYM0")!;
    // SYM0's peers are SYM1..SYM9 with P/Es 16..24 → median 20; own 15.
    expect(row.peerPremiumRatioDirected).toBeCloseTo(20 / 15, 6);
    expect(row.peerPremiumRatioSymmetric).toBeCloseTo(20 / 15, 6);
  });

  it("flags the deep-cyclical (NEM-signature) rows", () => {
    const u = universe();
    // SYM0 gets a loss inside annual[1:4] and a positive TTM.
    u[0] = makeCompany({
      symbol: "SYM0",
      industry: "Semiconductors",
      sector: "Technology",
      ttm: makeTtm({ peRatio: 12 }),
      annual: [8, 2.9, -3.0, -0.5, 1.5].map((eps, i) =>
        makePeriod({
          fiscalYear: String(2019 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
    });
    const { observations } = buildFvObservations(inputs(u));
    expect(observations.find((o) => o.symbol === "SYM0")!.deepCyclical).toBe(true);
    expect(observations.find((o) => o.symbol === "SYM1")!.deepCyclical).toBe(false);
  });

  it("coarse-cohort mode still produces rows (PIT stress lens)", () => {
    const { observations } = buildFvObservations({
      ...inputs(universe()),
      coarseCohort: true,
    });
    expect(observations.length).toBe(20);
  });
});

describe("downsampleWeekly", () => {
  it("keeps the last bar of each ISO week", () => {
    // 2024-01-01 is a Monday. Two full weeks of daily bars.
    const daily = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 1 + i));
      return { date: d.toISOString().slice(0, 10), close: 100 + i };
    });
    const weekly = downsampleWeekly(daily);
    expect(weekly.length).toBe(2);
    expect(weekly[0]!.date).toBe("2024-01-07"); // Sunday closes week 1
    expect(weekly[0]!.close).toBe(106);
    expect(weekly[1]!.date).toBe("2024-01-14");
    expect(weekly[1]!.close).toBe(113);
  });

  it("passes sparse (already weekly-or-coarser) series through", () => {
    const monthly = [
      { date: "2024-01-31", close: 10 },
      { date: "2024-02-29", close: 11 },
    ];
    expect(downsampleWeekly(monthly)).toEqual(monthly);
  });
});
