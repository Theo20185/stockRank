import { describe, it, expect } from "vitest";
import { runLegacyAudit } from "./engine.js";
import { makeCompany, makePeriod } from "../../test-helpers.js";
import type { CompanySnapshot } from "@stockrank/core";

function healthyCompany(symbol: string): CompanySnapshot {
  return makeCompany({
    symbol,
    industry: "Industrial Conglomerates",
    sector: "Industrials",
  });
}

function unprofitableCompany(symbol: string): CompanySnapshot {
  return makeCompany({
    symbol,
    industry: "Industrial Conglomerates",
    sector: "Industrials",
    annual: Array.from({ length: 5 }, (_, i) =>
      makePeriod({
        fiscalYear: String(2025 - i),
        income: { ...makePeriod().income, netIncome: -5_000_000_000 },
      }),
    ),
  });
}

describe("runLegacyAudit (H11 + H12)", () => {
  it("emits floor rows for each (rule, classification, horizon)", () => {
    const universe: CompanySnapshot[] = [
      healthyCompany("OK1"),
      healthyCompany("OK2"),
      unprofitableCompany("BAD1"),
    ];
    const snapshotsByDate = new Map([["2022-06-30", universe]]);
    const fwd = new Map([
      [
        "2022-06-30",
        new Map([
          ["OK1|3", 0.10],
          ["OK2|3", 0.10],
          ["BAD1|3", -0.20],
        ]),
      ],
    ]);
    const spy = new Map([["2022-06-30", new Map([["3", 0.05]])]]);
    const report = runLegacyAudit({
      snapshotsByDate,
      forwardReturnsByDate: fwd,
      spyReturnsByDate: spy,
      horizons: [3],
    });
    // 4 rules × 2 classifications × 1 horizon = 8 rows
    expect(report.floorRows.length).toBe(8);
  });

  it("H11 verdict: pass when excluded names underperform", () => {
    // 5 healthy companies + 5 unprofitable companies. Healthy gain
    // 10%, unprofitable lose 30% — both vs SPY +5%.
    const universe: CompanySnapshot[] = [
      ...Array.from({ length: 5 }, (_, i) => healthyCompany(`OK${i}`)),
      ...Array.from({ length: 5 }, (_, i) => unprofitableCompany(`BAD${i}`)),
    ];
    const snapshotsByDate = new Map([["2022-06-30", universe]]);
    const fwdMap = new Map<string, number>();
    for (let i = 0; i < 5; i += 1) {
      fwdMap.set(`OK${i}|3`, 0.10);
      fwdMap.set(`BAD${i}|3`, -0.30);
    }
    const fwd = new Map([["2022-06-30", fwdMap]]);
    const spy = new Map([["2022-06-30", new Map([["3", 0.05]])]]);
    const report = runLegacyAudit({
      snapshotsByDate,
      forwardReturnsByDate: fwd,
      spyReturnsByDate: spy,
      horizons: [3],
    });
    // Floor passed cohort = 5 OKs (excess +5%); failed = 5 BADs (excess -35%)
    // Gap = 0.40 — easily exceeds 0.02 threshold → verdict pass
    expect(report.verdicts.h11.verdict).toBe("pass");
  });

  it("H11 verdict: fail when excluded names actually OUTPERFORM", () => {
    // Pathological case: floor-failed names beat floor-passed names
    const universe: CompanySnapshot[] = [
      ...Array.from({ length: 5 }, (_, i) => healthyCompany(`OK${i}`)),
      ...Array.from({ length: 5 }, (_, i) => unprofitableCompany(`BAD${i}`)),
    ];
    const snapshotsByDate = new Map([["2022-06-30", universe]]);
    const fwdMap = new Map<string, number>();
    for (let i = 0; i < 5; i += 1) {
      fwdMap.set(`OK${i}|3`, 0.00);    // included names underperform
      fwdMap.set(`BAD${i}|3`, 0.40);   // excluded names outperform
    }
    const fwd = new Map([["2022-06-30", fwdMap]]);
    const spy = new Map([["2022-06-30", new Map([["3", 0.05]])]]);
    const report = runLegacyAudit({
      snapshotsByDate,
      forwardReturnsByDate: fwd,
      spyReturnsByDate: spy,
      horizons: [3],
    });
    expect(report.verdicts.h11.verdict).toBe("fail");
  });

  it("H12 verdict: inconclusive when watchlist N is too small", () => {
    // No turnaround-eligible companies in the universe — watchlist
    // N = 0 → inconclusive
    const universe = Array.from({ length: 5 }, (_, i) => healthyCompany(`OK${i}`));
    const snapshotsByDate = new Map([["2022-06-30", universe]]);
    const fwdMap = new Map<string, number>();
    for (let i = 0; i < 5; i += 1) fwdMap.set(`OK${i}|3`, 0.10);
    const fwd = new Map([["2022-06-30", fwdMap]]);
    const spy = new Map([["2022-06-30", new Map([["3", 0.05]])]]);
    const report = runLegacyAudit({
      snapshotsByDate,
      forwardReturnsByDate: fwd,
      spyReturnsByDate: spy,
      horizons: [3],
    });
    expect(report.verdicts.h12.verdict).toBe("inconclusive");
  });
});
