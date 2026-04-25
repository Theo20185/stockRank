/**
 * Legacy-rule audit engine (backtest.md §3.5).
 *
 * Inputs:
 *   - Per-snapshot universes (CompanySnapshot[])
 *   - Forward returns at each (snapshotDate, symbol, horizon)
 *   - SPY return at each (snapshotDate, horizon)
 *
 * Outputs:
 *   - H11 (Quality floor exclusion): per-rule pass/fail × horizon
 *     mean forward excess return + bootstrap CIs
 *   - H12 (Turnaround watchlist): watchlist vs excluded-not-watchlist
 *     × horizon mean forward excess return
 *
 * H10 (FV-trend demotion) requires backtest-side FV-trend
 * reconstruction which isn't yet built — left as a stub.
 */

import type { AnnualPeriod, CompanySnapshot } from "@stockrank/core";
import { bootstrapMeanCi, mulberry32 } from "../../stats.js";
import {
  buildFloorContext,
  checkQualityFloor,
} from "../../floor.js";
import { evaluateTurnaround } from "../../turnaround.js";
import { profitableInNOf5 } from "../../factors.js";
import { percentRank } from "../../percentile.js";
import type {
  FloorAuditRow,
  FloorClassification,
  FloorRuleKey,
  LegacyAuditReport,
  TurnaroundAuditRow,
  TurnaroundClassification,
} from "./types.js";

const ROIC_FLOOR_PERCENTILE = 33;
const INTEREST_COVERAGE_FLOOR_PERCENTILE = 25;
const ROIC_ABSOLUTE_PASS = 0.08;
const INTEREST_COVERAGE_ABSOLUTE_PASS = 5;

/**
 * Compute per-period ROIC from raw fields.
 *   ROIC = NetIncome / (Equity + Debt - Cash)
 *
 * Backtest snapshots have `period.ratios.roic = null` because the
 * mapper doesn't compute it (the live ingest computes it via the
 * same formula at TTM time, but the per-annual-period ratios are
 * populated by `withAnnualRatios` in the EDGAR mapper, which doesn't
 * apply to the Yahoo backtest history). This inline computation
 * gives the legacy-audit engine a useful per-period ROIC to feed
 * `avgRoic5Y`.
 */
function periodRoic(p: AnnualPeriod): number | null {
  const ni = p.income.netIncome;
  const equity = p.balance.totalEquity;
  const debt = p.balance.totalDebt;
  const cash = p.balance.cash;
  if (ni === null) return null;
  const ic = (equity ?? 0) + (debt ?? 0) - (cash ?? 0);
  if (ic <= 0) return null;
  return ni / ic;
}

function avgRoic5Y(company: CompanySnapshot): number | null {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < Math.min(company.annual.length, 5); i += 1) {
    const r = company.annual[i]!.ratios.roic ?? periodRoic(company.annual[i]!);
    if (r !== null) {
      sum += r;
      count += 1;
    }
  }
  return count === 0 ? null : sum / count;
}

/** Evaluate the sector-relative ROIC rule independently of the
 * combined floor. Uses inline `periodRoic` so backtest snapshots
 * (which have null per-period ratios) still get evaluated. */
function evaluateSectorRoicRule(
  company: CompanySnapshot,
  sectorPeers: CompanySnapshot[],
): boolean | null {
  const ownAvgRoic = avgRoic5Y(company);
  if (ownAvgRoic === null) return null;
  if (ownAvgRoic >= ROIC_ABSOLUTE_PASS) return true;
  const peerRoics = sectorPeers
    .map((p) => avgRoic5Y(p))
    .filter((v): v is number => v !== null);
  if (peerRoics.length < 3) {
    return ownAvgRoic > 0;
  }
  return percentRank(ownAvgRoic, peerRoics) >= ROIC_FLOOR_PERCENTILE;
}

/**
 * Evaluate the combined floor using the inline backtest-friendly
 * ROIC computation. The standard `checkQualityFloor` reads
 * `p.ratios.roic` directly, which is null on backtest snapshots
 * (the EDGAR mapper populates it via `withAnnualRatios` for the
 * live ingest, but the Yahoo backtest history doesn't go through
 * that path). This parallel evaluator gives an honest answer for
 * backtest data.
 */
function evaluateCombinedFloor(
  company: CompanySnapshot,
  sectorPeers: CompanySnapshot[],
): boolean {
  if (company.annual.length < 3) return false;
  if (!profitableInNOf5(company.annual, 3)) return false;
  const sectorRoic = evaluateSectorRoicRule(company, sectorPeers);
  if (sectorRoic === false) return false;
  const interestCov = evaluateInterestCoverageRule(company, sectorPeers);
  if (interestCov === false) return false;
  return true;
}

/** Evaluate the interest coverage rule independently. */
function evaluateInterestCoverageRule(
  company: CompanySnapshot,
  sectorPeers: CompanySnapshot[],
): boolean | null {
  const recent = company.annual[0];
  if (!recent) return null;
  const interest = recent.income.interestExpense;
  // Rule applies only when interest expense > 0 (per floor.ts).
  if (interest === null || interest <= 0) return true;
  const ebit = recent.income.ebit;
  if (ebit === null) return null;
  const ownCoverage = ebit / interest;
  if (ownCoverage >= INTEREST_COVERAGE_ABSOLUTE_PASS) return true;
  const peerCoverages = sectorPeers
    .map((p) => {
      const r = p.annual[0];
      if (!r) return null;
      const e = r.income.ebit;
      const i = r.income.interestExpense;
      if (e === null || i === null || i <= 0) return null;
      return e / i;
    })
    .filter((v): v is number => v !== null);
  if (peerCoverages.length < 3) return ownCoverage >= 1;
  return percentRank(ownCoverage, peerCoverages) >= INTEREST_COVERAGE_FLOOR_PERCENTILE;
}

export type LegacyAuditInput = {
  /** Per-snapshot-date universe of companies. */
  snapshotsByDate: ReadonlyMap<string, CompanySnapshot[]>;
  /** Forward returns. Same shape as IcObservations input — outer
   * key is snapshotDate, inner key is `${symbol}|${horizon}`. */
  forwardReturnsByDate: ReadonlyMap<
    string,
    ReadonlyMap<string, number>
  >;
  /** SPY return at each (date, horizon). Inner key is the horizon
   * stringified ("1", "3"). */
  spyReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  horizons: readonly number[];
  bootstrapResamples?: number;
  seed?: number;
};

export function runLegacyAudit(input: LegacyAuditInput): LegacyAuditReport {
  const {
    snapshotsByDate,
    forwardReturnsByDate,
    spyReturnsByDate,
    horizons,
    bootstrapResamples = 1000,
    seed = 1,
  } = input;

  // Phase 1 — classify every company in every snapshot.
  // Per-rule evaluation is INDEPENDENT (not inferred from the
  // combined floor's `reason`, which short-circuits at the first
  // failure — that inference would mark untested rules as "passed"
  // by default, which is wrong).
  const floorClass: FloorClassification[] = [];
  const turnaroundClass: TurnaroundClassification[] = [];
  for (const [date, universe] of snapshotsByDate) {
    const ctx = buildFloorContext(universe);
    // Group sector peers once for the per-rule evaluations.
    const sectorPeersByName = new Map<string, CompanySnapshot[]>();
    for (const c of universe) {
      const arr = sectorPeersByName.get(c.sector) ?? [];
      arr.push(c);
      sectorPeersByName.set(c.sector, arr);
    }
    for (const c of universe) {
      const sectorPeers = sectorPeersByName.get(c.sector) ?? [c];
      // Use the backtest-friendly combined evaluator (inline ROIC)
      // rather than checkQualityFloor (reads null ratios).
      const combinedPassed = evaluateCombinedFloor(c, sectorPeers);
      // Profitable rule: only meaningful when we have ≥ 3 annual
      // periods to evaluate. Backtest snapshots at older dates may
      // have fewer than 5 periods; mark `null` when the rule can't
      // be honestly evaluated.
      const profitable =
        c.annual.length < 3 ? null : profitableInNOf5(c.annual, 3);
      const sectorRoic = evaluateSectorRoicRule(c, sectorPeers);
      const interestCov = evaluateInterestCoverageRule(c, sectorPeers);
      floorClass.push({
        symbol: c.symbol,
        snapshotDate: date,
        passedCombined: combinedPassed,
        perRule: {
          "profitable-3of5": profitable,
          "sector-relative-roic": sectorRoic,
          "interest-coverage": interestCov,
          combined: combinedPassed,
        },
      });
      turnaroundClass.push({
        symbol: c.symbol,
        snapshotDate: date,
        isOnWatchlist: !combinedPassed && evaluateTurnaround(c) !== null,
        failedFloor: !combinedPassed,
      });
    }
  }

  const dates = [...snapshotsByDate.keys()].sort();
  const snapshotRange = {
    start: dates[0] ?? "",
    end: dates[dates.length - 1] ?? "",
  };

  // ── H11: floor stratification ────────────────────────────────────
  const floorRows: FloorAuditRow[] = [];
  const rules: FloorRuleKey[] = [
    "profitable-3of5",
    "sector-relative-roic",
    "interest-coverage",
    "combined",
  ];
  let rngOffset = 0;
  for (const rule of rules) {
    for (const horizon of horizons) {
      for (const classification of ["passed", "failed"] as const) {
        const excessReturns: number[] = [];
        for (const fc of floorClass) {
          const ruleResult = fc.perRule[rule];
          if (ruleResult === null) continue;
          const matches = classification === "passed" ? ruleResult : !ruleResult;
          if (!matches) continue;
          const fwd = forwardReturnsByDate
            .get(fc.snapshotDate)
            ?.get(`${fc.symbol}|${horizon}`);
          const spy = spyReturnsByDate.get(fc.snapshotDate)?.get(String(horizon));
          if (fwd === undefined || spy === undefined) continue;
          excessReturns.push(fwd - spy);
        }
        const mean =
          excessReturns.length === 0
            ? null
            : excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
        const ci =
          excessReturns.length >= 5
            ? bootstrapMeanCi(
                excessReturns,
                bootstrapResamples,
                0.05,
                mulberry32(seed + rngOffset),
              )
            : null;
        rngOffset += 1;
        floorRows.push({
          rule,
          classification,
          horizon,
          nObservations: excessReturns.length,
          meanForwardExcess: mean,
          excessCi95: ci,
        });
      }
    }
  }

  // ── H12: turnaround stratification ───────────────────────────────
  const turnaroundRows: TurnaroundAuditRow[] = [];
  for (const horizon of horizons) {
    const watchlistExcess: number[] = [];
    const excludedNotWatchlist: number[] = [];
    for (const tc of turnaroundClass) {
      if (!tc.failedFloor) continue;
      const fwd = forwardReturnsByDate
        .get(tc.snapshotDate)
        ?.get(`${tc.symbol}|${horizon}`);
      const spy = spyReturnsByDate.get(tc.snapshotDate)?.get(String(horizon));
      if (fwd === undefined || spy === undefined) continue;
      const excess = fwd - spy;
      if (tc.isOnWatchlist) watchlistExcess.push(excess);
      else excludedNotWatchlist.push(excess);
    }
    const mkRow = (
      cohort: TurnaroundAuditRow["cohort"],
      excessArr: number[],
    ): TurnaroundAuditRow => {
      const mean =
        excessArr.length === 0
          ? null
          : excessArr.reduce((a, b) => a + b, 0) / excessArr.length;
      const ci =
        excessArr.length >= 5
          ? bootstrapMeanCi(
              excessArr,
              bootstrapResamples,
              0.05,
              mulberry32(seed + rngOffset++),
            )
          : null;
      return {
        cohort,
        horizon,
        nObservations: excessArr.length,
        meanForwardExcess: mean,
        excessCi95: ci,
      };
    };
    turnaroundRows.push(mkRow("watchlist", watchlistExcess));
    turnaroundRows.push(mkRow("excluded-not-watchlist", excludedNotWatchlist));
    turnaroundRows.push({
      cohort: "spy",
      horizon,
      nObservations: 0,
      meanForwardExcess: 0,
      excessCi95: null,
    });
  }

  // ── Verdicts ─────────────────────────────────────────────────────
  // H11 verdict: combined-floor failed group should UNDERPERFORM the
  // passed group on 3y excess. If failed > passed by a meaningful
  // margin, the floor is doing real work. If reverse or wash, the
  // floor isn't justified.
  const combined3yPassed = floorRows.find(
    (r) => r.rule === "combined" && r.horizon === 3 && r.classification === "passed",
  );
  const combined3yFailed = floorRows.find(
    (r) => r.rule === "combined" && r.horizon === 3 && r.classification === "failed",
  );
  let h11Verdict: "pass" | "fail" | "inconclusive" = "inconclusive";
  let h11Evidence = "missing 3y data on combined-floor stratification";
  if (
    combined3yPassed?.meanForwardExcess !== null &&
    combined3yPassed?.meanForwardExcess !== undefined &&
    combined3yFailed?.meanForwardExcess !== null &&
    combined3yFailed?.meanForwardExcess !== undefined
  ) {
    const gap =
      combined3yPassed.meanForwardExcess - combined3yFailed.meanForwardExcess;
    if (gap > 0.02) {
      h11Verdict = "pass";
      h11Evidence = `passed cohort 3y excess ${(combined3yPassed.meanForwardExcess * 100).toFixed(2)}% vs failed ${(combined3yFailed.meanForwardExcess * 100).toFixed(2)}% — gap ${(gap * 100).toFixed(2)}% (floor justified)`;
    } else if (gap < -0.02) {
      h11Verdict = "fail";
      h11Evidence = `passed cohort 3y excess ${(combined3yPassed.meanForwardExcess * 100).toFixed(2)}% vs failed ${(combined3yFailed.meanForwardExcess * 100).toFixed(2)}% — failed cohort OUTPERFORMED by ${(-gap * 100).toFixed(2)}% (floor harmful)`;
    } else {
      h11Verdict = "inconclusive";
      h11Evidence = `passed/failed cohorts within ${Math.abs(gap * 100).toFixed(2)}% of each other — no clear floor justification`;
    }
  }

  // H12 verdict: watchlist set should outperform excluded-not-watchlist.
  const wl3y = turnaroundRows.find(
    (r) => r.cohort === "watchlist" && r.horizon === 3,
  );
  const exNotWl3y = turnaroundRows.find(
    (r) => r.cohort === "excluded-not-watchlist" && r.horizon === 3,
  );
  let h12Verdict: "pass" | "fail" | "inconclusive" = "inconclusive";
  let h12Evidence = "missing 3y data on turnaround stratification";
  if (
    wl3y?.meanForwardExcess !== null &&
    wl3y?.meanForwardExcess !== undefined &&
    exNotWl3y?.meanForwardExcess !== null &&
    exNotWl3y?.meanForwardExcess !== undefined
  ) {
    const gap = wl3y.meanForwardExcess - exNotWl3y.meanForwardExcess;
    if (wl3y.nObservations < 5) {
      h12Verdict = "inconclusive";
      h12Evidence = `watchlist N=${wl3y.nObservations} too small for verdict`;
    } else if (gap > 0.02) {
      h12Verdict = "pass";
      h12Evidence = `watchlist 3y excess ${(wl3y.meanForwardExcess * 100).toFixed(2)}% vs excluded-not-watchlist ${(exNotWl3y.meanForwardExcess * 100).toFixed(2)}% — gap ${(gap * 100).toFixed(2)}% (criteria pick real signal)`;
    } else if (gap < -0.02) {
      h12Verdict = "fail";
      h12Evidence = `watchlist 3y excess ${(wl3y.meanForwardExcess * 100).toFixed(2)}% vs excluded-not-watchlist ${(exNotWl3y.meanForwardExcess * 100).toFixed(2)}% — watchlist UNDERPERFORMED by ${(-gap * 100).toFixed(2)}%`;
    } else {
      h12Verdict = "inconclusive";
      h12Evidence = `watchlist and excluded-not-watchlist within ${Math.abs(gap * 100).toFixed(2)}% — no edge demonstrated`;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    snapshotRange,
    floorRows,
    turnaroundRows,
    verdicts: {
      h11: {
        hypothesis:
          "Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return",
        verdict: h11Verdict,
        evidence: h11Evidence,
      },
      h12: {
        hypothesis:
          "Turnaround watchlist names beat the broader §4-excluded set on 3y forward return",
        verdict: h12Verdict,
        evidence: h12Evidence,
      },
    },
  };
}
