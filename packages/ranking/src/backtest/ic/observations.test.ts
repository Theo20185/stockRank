import { describe, it, expect } from "vitest";
import { makeCompany, makeTtm } from "../../test-helpers.js";
import type { CompanySnapshot } from "@stockrank/core";
import { buildIcObservations } from "./observations.js";

function makeBank(symbol: string, evToEbitda: number): CompanySnapshot {
  return makeCompany({
    symbol,
    industry: "Banks - Regional",
    sector: "Financial Services",
    ttm: makeTtm({ evToEbitda }),
  });
}

function makeUtility(symbol: string, evToEbitda: number): CompanySnapshot {
  return makeCompany({
    symbol,
    industry: "Utilities - Regulated Electric",
    sector: "Utilities",
    ttm: makeTtm({ evToEbitda }),
  });
}

describe("buildIcObservations", () => {
  it("emits one observation per (snapshot, company, horizon)", () => {
    const universe = [
      makeBank("BNK1", 5),
      makeBank("BNK2", 8),
      makeBank("BNK3", 11),
      makeBank("BNK4", 14),
    ];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      [
        "2020-06-30",
        new Map([
          ["BNK1|1", 0.20], ["BNK1|3", 0.40],
          ["BNK2|1", 0.10], ["BNK2|3", 0.20],
          ["BNK3|1", 0.05], ["BNK3|3", 0.10],
          ["BNK4|1", 0.00], ["BNK4|3", 0.05],
        ]),
      ],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05], ["3", 0.15]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1, 3],
    });
    // 4 companies × 2 horizons = 8 observations
    expect(obs.length).toBe(8);
  });

  it("computes super-group cohort percentiles correctly (cheaper bank → higher EV/EBITDA percentile)", () => {
    const universe = [
      makeBank("BNK1", 5),  // cheapest
      makeBank("BNK2", 8),
      makeBank("BNK3", 11),
      makeBank("BNK4", 14), // most expensive
    ];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      [
        "2020-06-30",
        new Map([
          ["BNK1|1", 0.20],
          ["BNK2|1", 0.10],
          ["BNK3|1", 0.05],
          ["BNK4|1", 0.00],
        ]),
      ],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    const bnk1 = obs.find((o) => o.symbol === "BNK1")!;
    const bnk4 = obs.find((o) => o.symbol === "BNK4")!;
    // EV/EBITDA direction is "lower" — cheaper = higher percentile
    expect(bnk1.factorPercentiles.evToEbitda).toBeGreaterThan(
      bnk4.factorPercentiles.evToEbitda!,
    );
  });

  it("computes excess return = realizedReturn - spyReturn", () => {
    const universe = [makeBank("BNK1", 5), makeBank("BNK2", 8)];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      [
        "2020-06-30",
        new Map([
          ["BNK1|1", 0.25],
          ["BNK2|1", 0.08],
        ]),
      ],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.10]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    const bnk1 = obs.find((o) => o.symbol === "BNK1")!;
    expect(bnk1.excessReturn).toBeCloseTo(0.15, 5); // 0.25 - 0.10
  });

  it("uses super-group cohort, not narrow industry — different industries within a super-group share a cohort", () => {
    // Both Regional Banks and Diversified Banks map to banks-lending.
    // Their factor percentiles should be computed against the COMBINED
    // banks-lending cohort, not within each industry separately.
    const universe = [
      makeBank("REG1", 5),
      makeBank("REG2", 6),
      makeCompany({
        symbol: "DIV1",
        industry: "Banks - Diversified",
        sector: "Financial Services",
        ttm: makeTtm({ evToEbitda: 4 }), // cheapest of all
      }),
      makeCompany({
        symbol: "DIV2",
        industry: "Banks - Diversified",
        sector: "Financial Services",
        ttm: makeTtm({ evToEbitda: 20 }), // most expensive
      }),
    ];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      [
        "2020-06-30",
        new Map([
          ["REG1|1", 0.10], ["REG2|1", 0.10],
          ["DIV1|1", 0.10], ["DIV2|1", 0.10],
        ]),
      ],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    // All 4 should share a single super-group cohort
    expect(obs.every((o) => o.superGroup === "banks-lending")).toBe(true);
    // DIV1 (cheapest) should have HIGHER EV/EBITDA percentile than REG1
    const div1 = obs.find((o) => o.symbol === "DIV1")!;
    const reg1 = obs.find((o) => o.symbol === "REG1")!;
    expect(div1.factorPercentiles.evToEbitda).toBeGreaterThan(
      reg1.factorPercentiles.evToEbitda!,
    );
  });

  it("excludes companies whose industry doesn't map to a super-group", () => {
    const universe = [
      makeBank("BNK1", 5),
      makeBank("BNK2", 8),
      makeCompany({
        symbol: "WEIRD",
        industry: "Esoteric Frobnicators",
        sector: "Made Up",
      }),
    ];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      [
        "2020-06-30",
        new Map([
          ["BNK1|1", 0.10], ["BNK2|1", 0.10], ["WEIRD|1", 0.10],
        ]),
      ],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    expect(obs.find((o) => o.symbol === "WEIRD")).toBeUndefined();
    expect(obs.length).toBe(2);
  });

  it("drops observations when forward return or SPY is missing", () => {
    const universe = [makeBank("BNK1", 5), makeBank("BNK2", 8)];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    // BNK2's 1y return is missing
    const forwardReturnsByDate = new Map([
      ["2020-06-30", new Map([["BNK1|1", 0.10]])],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    expect(obs.length).toBe(1);
    expect(obs[0]?.symbol).toBe("BNK1");
  });

  it("handles cohorts smaller than 2 by emitting observations with no factor percentiles", () => {
    // Single company in a super-group → no peer cohort → no
    // percentiles. Observation still emitted (so universe-level
    // aggregates remain accurate).
    const universe = [makeUtility("UTI1", 10)];
    const snapshotsByDate = new Map([["2020-06-30", universe]]);
    const forwardReturnsByDate = new Map([
      ["2020-06-30", new Map([["UTI1|1", 0.10]])],
    ]);
    const spyReturnsByDate = new Map([
      ["2020-06-30", new Map([["1", 0.05]])],
    ]);
    const obs = buildIcObservations({
      snapshotsByDate,
      forwardReturnsByDate,
      spyReturnsByDate,
      horizons: [1],
    });
    expect(obs.length).toBe(1);
    expect(Object.keys(obs[0]!.factorPercentiles).length).toBe(0);
  });
});
