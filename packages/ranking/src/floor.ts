import type { CompanySnapshot } from "@stockrank/core";
import { percentRank } from "./percentile.js";
import {
  periodAverage,
  periodCagr as _unused1, // keep import path stable
  profitableInNOf5,
} from "./factors.js";

void _unused1;

const ROIC_FLOOR_PERCENTILE = 33;
const INTEREST_COVERAGE_FLOOR_PERCENTILE = 25;
const MIN_PROFITABLE_YEARS = 3;

// Absolute "obviously fine" thresholds — values clearly above these pass the
// floor regardless of where they sit in the peer percentile. This prevents
// the percentile gate from rejecting strong absolute numbers just because
// peers happen to be even stronger.
const ROIC_ABSOLUTE_PASS = 0.08;          // 8% 5Y avg ROIC
const INTEREST_COVERAGE_ABSOLUTE_PASS = 5; // 5x EBIT/interest

export type FloorContext = {
  /** All companies grouped by sector for sector-relative thresholds. */
  sectorPeers: Map<string, CompanySnapshot[]>;
};

export function buildFloorContext(
  companies: CompanySnapshot[],
): FloorContext {
  const sectorPeers = new Map<string, CompanySnapshot[]>();
  for (const c of companies) {
    const arr = sectorPeers.get(c.sector) ?? [];
    arr.push(c);
    sectorPeers.set(c.sector, arr);
  }
  return { sectorPeers };
}

export type FloorResult = {
  passed: boolean;
  reason?: "fewProfitableYears" | "lowAvgRoic" | "lowInterestCoverage";
};

export function checkQualityFloor(
  company: CompanySnapshot,
  context: FloorContext,
): FloorResult {
  if (!profitableInNOf5(company.annual, MIN_PROFITABLE_YEARS)) {
    return { passed: false, reason: "fewProfitableYears" };
  }

  const ownAvgRoic = avgRoic5Y(company);
  const peers = context.sectorPeers.get(company.sector) ?? [company];
  const peerAvgRoics = peers
    .map((p) => avgRoic5Y(p))
    .filter((v): v is number => v !== null);

  if (ownAvgRoic !== null) {
    if (ownAvgRoic >= ROIC_ABSOLUTE_PASS) {
      // Strong absolute ROIC — auto-pass.
    } else if (peerAvgRoics.length >= 3) {
      const ownPercentile = percentRank(ownAvgRoic, peerAvgRoics);
      if (ownPercentile < ROIC_FLOOR_PERCENTILE) {
        return { passed: false, reason: "lowAvgRoic" };
      }
    } else if (ownAvgRoic <= 0) {
      // Tiny sector — no peer comparison possible, fall back to absolute zero.
      return { passed: false, reason: "lowAvgRoic" };
    }
  }

  const interest = company.annual[0]?.income.interestExpense;
  const ebit = company.annual[0]?.income.ebit;
  if (interest !== null && interest !== undefined && interest > 0) {
    const ownCoverage = ebit !== null && ebit !== undefined ? ebit / interest : null;
    const peerCoverages = peers
      .map((p) => {
        const recent = p.annual[0];
        if (!recent) return null;
        const e = recent.income.ebit;
        const i = recent.income.interestExpense;
        if (e === null || i === null || i <= 0) return null;
        return e / i;
      })
      .filter((v): v is number => v !== null);

    if (ownCoverage !== null) {
      if (ownCoverage >= INTEREST_COVERAGE_ABSOLUTE_PASS) {
        // Strong absolute coverage — auto-pass.
      } else if (peerCoverages.length >= 3) {
        const cp = percentRank(ownCoverage, peerCoverages);
        if (cp < INTEREST_COVERAGE_FLOOR_PERCENTILE) {
          return { passed: false, reason: "lowInterestCoverage" };
        }
      } else if (ownCoverage < 1) {
        // Tiny peer set — absolute fallback: must at least cover interest.
        return { passed: false, reason: "lowInterestCoverage" };
      }
    }
  }

  return { passed: true };
}

export function avgRoic5Y(company: CompanySnapshot): number | null {
  return periodAverage(company.annual, (p) => p.ratios.roic, 5);
}
