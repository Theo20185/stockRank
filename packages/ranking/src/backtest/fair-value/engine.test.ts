import { describe, expect, it } from "vitest";
import type { FairValueAnchors } from "../../fair-value/types.js";
import { dedupeYearlyFv, runFvBacktest } from "./engine.js";
import type { FvBacktestInput } from "./engine.js";
import { renderFvBacktestReport } from "./report.js";
import type { FvObservation } from "./types.js";

function anchors(over: Partial<FairValueAnchors> = {}): FairValueAnchors {
  return {
    peerMedianPE: null,
    peerMedianEVEBITDA: null,
    peerMedianPFCF: null,
    ownHistoricalPE: null,
    ownHistoricalEVEBITDA: null,
    ownHistoricalPFCF: null,
    normalizedPE: null,
    normalizedEVEBITDA: null,
    normalizedPFCF: null,
    ...over,
  };
}

function makeObs(over: {
  symbol: string;
  snapshotDate: string;
  horizon: number;
  excessReturn: number;
  price?: number;
  p25?: number | null;
  upside?: number | null;
  confidence?: "high" | "medium" | "low";
  divergent?: boolean;
  deepCyclical?: boolean;
  premiumSym?: number | null;
  anchorsPre?: FairValueAnchors;
}): FvObservation {
  const price = over.price ?? 100;
  const p25 = over.p25 === undefined ? 110 : over.p25;
  const anchorsPre = over.anchorsPre ?? anchors({ ownHistoricalPE: p25 ?? 100 });
  return {
    symbol: over.symbol,
    snapshotDate: over.snapshotDate,
    snapshotYear: parseInt(over.snapshotDate.slice(0, 4), 10),
    superGroup: null,
    horizon: over.horizon,
    excessReturn: over.excessReturn,
    price,
    fv: {
      p25,
      median: p25 !== null ? p25 * 1.2 : null,
      p75: p25 !== null ? p25 * 1.4 : null,
      belowP25: p25 === null ? null : price < p25,
      upsideToP25Pct:
        over.upside !== undefined
          ? over.upside
          : p25 !== null
            ? ((p25 - price) / price) * 100
            : null,
      confidence: over.confidence ?? "medium",
      peerCohortDivergent: over.divergent ?? false,
      peerSet: "cohort",
      anchorCount: 6,
      anchors: anchorsPre,
      anchorsPre,
      ttmTreatment: "ttm",
    },
    peerPremiumRatioDirected: over.premiumSym ?? null,
    peerPremiumRatioSymmetric: over.premiumSym ?? null,
    deepCyclical: over.deepCyclical ?? false,
  };
}

const FAST = { bootstrapResamples: 200, seed: 1, mcIterations: 50 };

function baseInput(observations: FvObservation[]): FvBacktestInput {
  return {
    observations,
    weeklyClosesBySymbol: new Map(),
    pit: {
      capBucketChurnPct: null,
      industryMembershipNote: "test",
      restatementNote: "test",
    },
  };
}

describe("dedupeYearlyFv", () => {
  it("keeps the earliest snapshot per (symbol, year)", () => {
    const rows = [
      makeObs({ symbol: "A", snapshotDate: "2020-06-30", horizon: 1, excessReturn: 0.1 }),
      makeObs({ symbol: "A", snapshotDate: "2020-01-31", horizon: 1, excessReturn: 0.2 }),
      makeObs({ symbol: "A", snapshotDate: "2021-01-31", horizon: 1, excessReturn: 0.3 }),
    ];
    const deduped = dedupeYearlyFv(rows);
    expect(deduped.length).toBe(2);
    expect(deduped[0]!.snapshotDate).toBe("2020-01-31");
  });
});

describe("runFvBacktest — H1", () => {
  it("planted directional signal passes; inverted signal fails", () => {
    // 40 below-p25 symbols with +20% excess, 40 at-or-above with −5%.
    const good: FvObservation[] = [];
    for (let i = 0; i < 40; i += 1) {
      good.push(
        makeObs({ symbol: `B${i}`, snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.2 + (i % 5) * 0.01, price: 100, p25: 110 }),
        makeObs({ symbol: `A${i}`, snapshotDate: "2019-06-30", horizon: 1, excessReturn: -0.05 - (i % 5) * 0.01, price: 100, p25: 90 }),
      );
    }
    const report = runFvBacktest(baseInput(good), FAST);
    const pooled = report.h1.find((c) => c.regime === "pooled" && c.horizon === 1)!;
    expect(pooled.verdict).toBe("pass");
    expect(pooled.below.nDeduped).toBe(40);
    expect(pooled.gapAnnualized!).toBeGreaterThan(0.2);

    const inverted = good.map((o) => ({ ...o, excessReturn: -o.excessReturn }));
    const badReport = runFvBacktest(baseInput(inverted), FAST);
    const badPooled = badReport.h1.find((c) => c.regime === "pooled" && c.horizon === 1)!;
    expect(badPooled.verdict).toBe("fail");
  });

  it("small cells are underpowered, never verdicted", () => {
    const rows = [
      makeObs({ symbol: "B0", snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.5, p25: 110 }),
      makeObs({ symbol: "A0", snapshotDate: "2019-06-30", horizon: 1, excessReturn: -0.5, p25: 90 }),
    ];
    const report = runFvBacktest(baseInput(rows), FAST);
    const pooled = report.h1.find((c) => c.regime === "pooled" && c.horizon === 1)!;
    expect(pooled.verdict).toBe("underpowered");
  });

  it("no-band rows are counted, not silently dropped", () => {
    const rows = [
      makeObs({ symbol: "N0", snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.1, p25: null }),
    ];
    const report = runFvBacktest(baseInput(rows), FAST);
    const pooled = report.h1.find((c) => c.regime === "pooled" && c.horizon === 1)!;
    expect(pooled.nNoBand).toBe(1);
    expect(report.totals.noBandRows).toBe(1);
  });

  it("regime windows partition by snapshot date", () => {
    const rows = [
      makeObs({ symbol: "X", snapshotDate: "2017-06-30", horizon: 1, excessReturn: 0.1 }),
      makeObs({ symbol: "Y", snapshotDate: "2020-06-30", horizon: 1, excessReturn: 0.1 }),
      makeObs({ symbol: "Z", snapshotDate: "2023-06-30", horizon: 1, excessReturn: 0.1 }),
    ];
    const report = runFvBacktest(baseInput(rows), FAST);
    const cell = (regime: string) =>
      report.h1.find((c) => c.regime === regime && c.horizon === 1)!;
    expect(cell("pre-covid").below.n + cell("pre-covid").atOrAbove.n + cell("pre-covid").nNoBand).toBe(1);
    expect(cell("covid").below.n).toBe(1);
    expect(cell("post-2022").below.n).toBe(1);
    expect(cell("pooled").below.n).toBe(3);
  });
});

describe("runFvBacktest — H2", () => {
  it("perfect within-date rank agreement passes all three gates", () => {
    const rows: FvObservation[] = [];
    // 12 dates across 3 years × 15 symbols; upside rank == excess rank.
    for (let d = 0; d < 12; d += 1) {
      const year = 2017 + Math.floor(d / 4);
      const month = String(1 + (d % 4) * 3).padStart(2, "0");
      for (let s = 0; s < 15; s += 1) {
        rows.push(
          makeObs({
            symbol: `S${s}`,
            snapshotDate: `${year}-${month}-15`,
            horizon: 1,
            excessReturn: s * 0.01,
            upside: s * 2,
          }),
        );
      }
    }
    const report = runFvBacktest(baseInput(rows), FAST);
    const h2 = report.h2Primary.find((p) => p.horizon === 1)!;
    expect(h2.avgIc).toBeCloseTo(1, 6);
    expect(h2.nDates).toBe(12);
    expect(h2.verdict).toBe("pass");
    const sec = report.h2Secondary.find((p) => p.horizon === 1)!;
    expect(sec.ic).not.toBeNull();
  });

  it("thin cross-sections are skipped and too few dates fail insufficient-data", () => {
    const rows = Array.from({ length: 5 }, (_, s) =>
      makeObs({ symbol: `S${s}`, snapshotDate: "2019-06-30", horizon: 1, excessReturn: s * 0.01, upside: s }),
    );
    const report = runFvBacktest(baseInput(rows), FAST);
    const h2 = report.h2Primary.find((p) => p.horizon === 1)!;
    expect(h2.nDates).toBe(0);
    expect(h2.nDatesSkipped).toBe(1);
    expect(h2.verdict).toBe("fail-insufficient-data");
  });
});

describe("runFvBacktest — H3", () => {
  it("measures convergence and time-to-p25 on weekly closes", () => {
    const rows = [
      makeObs({ symbol: "HIT", snapshotDate: "2019-01-01", horizon: 1, excessReturn: 0.1, price: 100, p25: 110 }),
      makeObs({ symbol: "MISS", snapshotDate: "2019-01-01", horizon: 1, excessReturn: 0.0, price: 100, p25: 110 }),
      makeObs({ symbol: "CTRL", snapshotDate: "2019-01-01", horizon: 1, excessReturn: 0.0, price: 100, p25: 90 }),
    ];
    const weekly = new Map([
      ["HIT", [
        { date: "2019-01-08", close: 102 },
        { date: "2019-01-15", close: 111 },
        { date: "2019-06-01", close: 120 },
      ]],
      ["MISS", [
        { date: "2019-01-08", close: 99 },
        { date: "2019-12-15", close: 104.5 },
      ]],
      ["CTRL", [
        { date: "2019-01-08", close: 101 },
        { date: "2019-12-15", close: 105 },
      ]],
    ]);
    const report = runFvBacktest(
      { ...baseInput(rows), weeklyClosesBySymbol: weekly },
      FAST,
    );
    const cell = report.h3.find((c) => c.regime === "pooled" && c.horizon === 1)!;
    expect(cell.nBelow).toBe(2);
    expect(cell.nWithPath).toBe(2);
    expect(cell.converged).toBe(1);
    expect(cell.timeToP25Days!.median).toBe(14);
    // MISS terminal 104.5/110 ≈ 0.95.
    expect(cell.nonConvergedTerminalRatio!.median).toBeCloseTo(0.95, 2);
    // Control target = median required rise = 10%; CTRL peaks at +5% → 0 converged.
    expect(cell.control.targetRisePct).toBeCloseTo(0.1, 6);
    expect(cell.control.n).toBe(1);
    expect(cell.control.converged).toBe(0);
  });
});

describe("runFvBacktest — H4/H5/H6 strata", () => {
  it("H5 buckets rows by symmetric ratio with declared edges", () => {
    const mk = (sym: string, ratio: number) =>
      makeObs({ symbol: sym, snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.1, premiumSym: ratio });
    const report = runFvBacktest(
      baseInput([mk("A", 1.2), mk("B", 2.0), mk("C", 2.5), mk("D", 7.0)]),
      FAST,
    );
    const cellN = (stratum: string) => {
      const c = report.h5Cells.find(
        (x) => x.regime === "pooled" && x.horizon === 1 && x.stratum === stratum,
      )!;
      return c.below.n + c.atOrAbove.n + c.nNoBand;
    };
    expect(cellN("sym [1, 1.5)")).toBe(1);
    expect(cellN("sym [1.5, 2.5)")).toBe(1);
    expect(cellN("sym [2.5, 5)")).toBe(1);
    expect(cellN("sym >= 5")).toBe(1);
  });

  it("H6 variants recompute belowP25 from pre-suppression anchor subsets", () => {
    // own3 band p25 = 50 (price 100 above); peer6 band p25 = 200 (below).
    const pre = anchors({
      ownHistoricalPE: 50,
      ownHistoricalEVEBITDA: 50,
      ownHistoricalPFCF: 50,
      peerMedianPE: 200,
      peerMedianEVEBITDA: 200,
      peerMedianPFCF: 200,
      normalizedPE: 200,
      normalizedEVEBITDA: 200,
      normalizedPFCF: 200,
    });
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeObs({
        symbol: `S${i}`,
        snapshotDate: `${2017 + i}-06-30`,
        horizon: 1,
        excessReturn: 0.1,
        price: 100,
        p25: 120,
        anchorsPre: pre,
      }),
    );
    const report = runFvBacktest(baseInput(rows), FAST);
    const cell = (stratum: string) =>
      report.h6Cells.find(
        (c) => c.horizon === 1 && c.stratum === `${stratum} (common support)`,
      )!;
    expect(cell("variant=own3").atOrAbove.n).toBe(3);
    expect(cell("variant=own3").below.n).toBe(0);
    expect(cell("variant=peer6").below.n).toBe(3);
    expect(cell("variant=production").below.n).toBe(3); // p25 120 > 100
  });

  it("H4 emits cells for every declared stratum including deep-cyclical", () => {
    const rows = [
      makeObs({ symbol: "A", snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.1, confidence: "high" }),
      makeObs({ symbol: "B", snapshotDate: "2019-06-30", horizon: 1, excessReturn: 0.1, deepCyclical: true }),
    ];
    const report = runFvBacktest(baseInput(rows), FAST);
    const strata = new Set(
      report.h4Cells.filter((c) => c.regime === "pooled").map((c) => c.stratum),
    );
    for (const s of [
      "confidence=high",
      "confidence=medium",
      "confidence=low",
      "divergent=true",
      "divergent=false",
      "deep-cyclical=true",
      "deep-cyclical=false",
    ]) {
      expect(strata.has(s)).toBe(true);
    }
    expect(report.h4Verdicts.length).toBeGreaterThan(0);
  });
});

describe("runFvBacktest — determinism and rendering", () => {
  it("same input + seed → identical report (modulo generatedAt)", () => {
    const rows = Array.from({ length: 35 }, (_, i) =>
      makeObs({
        symbol: `S${i}`,
        snapshotDate: "2019-06-30",
        horizon: 1,
        excessReturn: (i % 7) * 0.02 - 0.05,
        p25: i % 2 === 0 ? 110 : 90,
      }),
    );
    const a = runFvBacktest(baseInput(rows), FAST);
    const b = runFvBacktest(baseInput(rows), FAST);
    const strip = (r: typeof a) => ({ ...r, generatedAt: "" });
    expect(strip(a)).toEqual(strip(b));
  });

  it("renders every cell and the verdict line", () => {
    const rows = Array.from({ length: 35 }, (_, i) =>
      makeObs({
        symbol: `S${i}`,
        snapshotDate: "2019-06-30",
        horizon: 1,
        excessReturn: (i % 7) * 0.02,
        p25: i % 2 === 0 ? 110 : 90,
      }),
    );
    const report = runFvBacktest(baseInput(rows), FAST);
    const md = renderFvBacktestReport(report);
    expect(md).toContain("# Fair-value backtest (H1–H6)");
    expect(md).toContain("## H1 — directional");
    expect(md).toContain("## H2 — monotonic");
    expect(md).toContain("## H3 — convergence");
    expect(md).toContain("## H4 — do the confidence");
    expect(md).toContain("## H5 — peer contamination");
    expect(md).toContain("## H6 — anchor ablation");
    expect(md).toContain("**Verdict:**");
    // every H1 cell row is printed
    for (const c of report.h1) {
      expect(md).toContain(`| ${c.regime} | ${c.horizon}y | ${c.stratum} |`);
    }
  });
});
