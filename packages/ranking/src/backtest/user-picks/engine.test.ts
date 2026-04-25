import { describe, it, expect } from "vitest";
import type { IcObservation } from "../ic/types.js";
import { evaluateUserPicks, type UserPick } from "./engine.js";
import { DEFAULT_WEIGHTS } from "../../weights.js";

function makeObs(overrides: {
  symbol: string;
  date: string;
  superGroup?: "industrials" | "banks-lending";
  evToEbitda?: number;
  excess1y?: number;
  excess3y?: number;
}): IcObservation[] {
  const base = {
    snapshotDate: overrides.date,
    snapshotYear: parseInt(overrides.date.slice(0, 4), 10),
    superGroup: overrides.superGroup ?? "industrials" as const,
    factorPercentiles: { evToEbitda: overrides.evToEbitda ?? 50 },
  };
  return [
    {
      ...base,
      symbol: overrides.symbol,
      horizon: 1,
      excessReturn: overrides.excess1y ?? 0,
    },
    {
      ...base,
      symbol: overrides.symbol,
      horizon: 3,
      excessReturn: overrides.excess3y ?? 0,
    },
  ];
}

describe("evaluateUserPicks", () => {
  it("ranks the pick correctly within its super-group cohort", () => {
    const date = "2022-06-30";
    const obs: IcObservation[] = [];
    // 5 industrials companies with varying valuation percentiles
    const symbols = ["AAA", "BBB", "CCC", "DDD", "EEE"];
    const evPcts = [90, 70, 50, 30, 10];
    const excess3y = [0.50, 0.30, 0.10, -0.10, -0.30];
    for (let i = 0; i < 5; i += 1) {
      obs.push(
        ...makeObs({
          symbol: symbols[i]!,
          date,
          evToEbitda: evPcts[i]!,
          excess3y: excess3y[i]!,
        }),
      );
    }
    const observationsByDate = new Map([[date, obs]]);
    const picks: UserPick[] = [{ symbol: "CCC", snapshotDate: date }];
    const report = evaluateUserPicks({
      picks,
      observationsByDate,
      weights: DEFAULT_WEIGHTS,
      weightSchemeName: "test",
    });
    expect(report.picks.length).toBe(1);
    const r = report.picks[0]!.ranking!;
    expect(r.symbol).toBe("CCC");
    // CCC has middle valuation → should rank 3rd of 5
    expect(r.rankInSuperGroup).toBe(3);
    expect(r.universeSize).toBe(5);
    expect(r.betterRankedPeers.length).toBe(2); // AAA + BBB
    expect(r.betterRankedPeers.map((p) => p.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("includes realized excess returns for the pick and better-ranked peers", () => {
    const date = "2022-06-30";
    const obs: IcObservation[] = [
      ...makeObs({ symbol: "AAA", date, evToEbitda: 90, excess3y: 0.50 }),
      ...makeObs({ symbol: "BBB", date, evToEbitda: 50, excess3y: 0.10 }),
    ];
    const observationsByDate = new Map([[date, obs]]);
    const report = evaluateUserPicks({
      picks: [{ symbol: "BBB", snapshotDate: date }],
      observationsByDate,
      weights: DEFAULT_WEIGHTS,
      weightSchemeName: "test",
    });
    const r = report.picks[0]!.ranking!;
    expect(r.ownRealizedExcess3y).toBeCloseTo(0.10, 5);
    expect(r.betterRankedPeers[0]?.realizedExcess3y).toBeCloseTo(0.50, 5);
  });

  it("returns notFoundReason when the pick is missing from the universe", () => {
    const date = "2022-06-30";
    const obs = makeObs({ symbol: "AAA", date, evToEbitda: 90 });
    const observationsByDate = new Map([[date, obs]]);
    const report = evaluateUserPicks({
      picks: [{ symbol: "MISSING", snapshotDate: date }],
      observationsByDate,
      weights: DEFAULT_WEIGHTS,
      weightSchemeName: "test",
    });
    expect(report.picks[0]!.ranking).toBeNull();
    expect(report.picks[0]!.notFoundReason).toContain("MISSING");
  });

  it("returns notFoundReason when no snapshot exists at the pick date", () => {
    const observationsByDate = new Map<string, IcObservation[]>();
    const report = evaluateUserPicks({
      picks: [{ symbol: "AAA", snapshotDate: "1999-12-31" }],
      observationsByDate,
      weights: DEFAULT_WEIGHTS,
      weightSchemeName: "test",
    });
    expect(report.picks[0]!.ranking).toBeNull();
    expect(report.picks[0]!.notFoundReason).toContain("no snapshot universe");
  });

  it("respects subFactorWeights when computing composites for ranking", () => {
    const date = "2022-06-30";
    const obs: IcObservation[] = [
      // AAA looks bad on EV/EBITDA but great on P/B
      {
        symbol: "AAA",
        snapshotDate: date,
        snapshotYear: 2022,
        superGroup: "industrials",
        horizon: 3,
        factorPercentiles: { evToEbitda: 10, priceToBook: 90 },
        excessReturn: 0,
      },
      // BBB is the opposite
      {
        symbol: "BBB",
        snapshotDate: date,
        snapshotYear: 2022,
        superGroup: "industrials",
        horizon: 3,
        factorPercentiles: { evToEbitda: 90, priceToBook: 10 },
        excessReturn: 0,
      },
    ];
    const observationsByDate = new Map([[date, obs]]);
    const reportEvOnly = evaluateUserPicks({
      picks: [{ symbol: "AAA", snapshotDate: date }],
      observationsByDate,
      weights: { ...DEFAULT_WEIGHTS, valuation: 1.0, health: 0, quality: 0, shareholderReturn: 0, growth: 0, momentum: 0 },
      subFactorWeights: { valuation: { evToEbitda: 1.0 } },
      weightSchemeName: "ev-only",
    });
    // With EV-only: BBB (high EV pct) ranks above AAA (low EV pct) → AAA rank 2
    expect(reportEvOnly.picks[0]!.ranking!.rankInSuperGroup).toBe(2);

    const reportPbOnly = evaluateUserPicks({
      picks: [{ symbol: "AAA", snapshotDate: date }],
      observationsByDate,
      weights: { ...DEFAULT_WEIGHTS, valuation: 1.0, health: 0, quality: 0, shareholderReturn: 0, growth: 0, momentum: 0 },
      subFactorWeights: { valuation: { priceToBook: 1.0 } },
      weightSchemeName: "pb-only",
    });
    // With PB-only: AAA (high PB pct) ranks above BBB → AAA rank 1
    expect(reportPbOnly.picks[0]!.ranking!.rankInSuperGroup).toBe(1);
  });
});
