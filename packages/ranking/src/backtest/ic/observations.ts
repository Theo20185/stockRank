/**
 * Build IcObservation rows from per-date snapshot universes + forward
 * returns. Pure function — caller is responsible for sourcing
 * snapshots (live ingest or back-test history) and forward prices.
 *
 * For each (snapshotDate, company, horizon):
 *   1. Resolve the company's super-group via INDUSTRY_TO_SUPER_GROUP
 *   2. Build the super-group cohort at that date
 *   3. Compute factor percentiles within the super-group cohort
 *      (winsorized + direction-adjusted, same convention as ranker)
 *   4. Compute excess return = realizedReturn - spyReturn at T+horizon
 *   5. Emit one IcObservation
 *
 * Companies whose industry doesn't map to a super-group are excluded
 * (they don't contribute to per-super-group cells anyway).
 */

import type { CompanySnapshot } from "@stockrank/core";
import { FACTORS } from "../../factors.js";
import type { FactorKey } from "../../types.js";
import { percentRank } from "../../percentile.js";
import { groupBy } from "../../stats.js";
import { superGroupOf } from "../../super-groups.js";
import type { IcObservation } from "./types.js";

export type IcObservationsInput = {
  /** Per-snapshot-date universe of companies. */
  snapshotsByDate: ReadonlyMap<string, CompanySnapshot[]>;
  /**
   * Forward total returns at each (symbol, snapshotDate, horizon).
   * Outer key: snapshotDate. Inner key: `${symbol}|${horizon}`.
   * Returns are decimals, e.g., 0.15 = +15%.
   *
   * If the entry is undefined, the forward window wasn't complete at
   * that horizon — the observation is dropped (per backtest.md §3.2:
   * "Snapshots in the trailing N years where N < horizon are
   * excluded").
   */
  forwardReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /**
   * SPY forward return at each (snapshotDate, horizon). Inner key:
   * horizon as a string (e.g., "1", "3"). When missing for a (date,
   * horizon), all observations at that date+horizon are dropped —
   * we have no excess-return baseline to compute against.
   */
  spyReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** Horizons in years to emit observations for. */
  horizons: readonly number[];
};

export function buildIcObservations(
  input: IcObservationsInput,
): IcObservation[] {
  const { snapshotsByDate, forwardReturnsByDate, spyReturnsByDate, horizons } =
    input;
  const observations: IcObservation[] = [];

  for (const [date, universe] of snapshotsByDate) {
    const spyAtDate = spyReturnsByDate.get(date);
    const forwardAtDate = forwardReturnsByDate.get(date);
    if (!spyAtDate || !forwardAtDate) continue;

    // Bucket companies by super-group at this date.
    const bySg = groupBy(
      universe.filter((c) => superGroupOf(c.industry) !== null),
      (c) => superGroupOf(c.industry)!,
    );

    // For each (super-group, factor) build cohort percentiles.
    const percentilesPerCompany = new Map<
      string,
      Partial<Record<FactorKey, number>>
    >();
    for (const [sg, cohort] of bySg) {
      // Compute raw factor values per company once per cohort.
      for (const factor of FACTORS) {
        const rawByCompany = new Map<string, number>();
        for (const c of cohort) {
          const v = factor.extract(c);
          if (v !== null) rawByCompany.set(c.symbol, v);
        }
        const cohortValues = [...rawByCompany.values()];
        if (cohortValues.length < 2) continue;
        const winsorized = winsorize5_95(cohortValues);
        for (const c of cohort) {
          const own = rawByCompany.get(c.symbol);
          if (own === undefined) continue;
          const pct = percentRank(own, winsorized);
          const directed = factor.direction === "lower" ? 100 - pct : pct;
          let map = percentilesPerCompany.get(c.symbol);
          if (!map) {
            map = {};
            percentilesPerCompany.set(c.symbol, map);
          }
          map[factor.key] = directed;
        }
      }
      void sg;
    }

    // Emit observations.
    const snapshotYear = parseInt(date.slice(0, 4), 10);
    for (const c of universe) {
      const sg = superGroupOf(c.industry);
      if (sg === null) continue;
      const factorPercentiles = percentilesPerCompany.get(c.symbol) ?? {};
      for (const h of horizons) {
        const fwd = forwardAtDate.get(`${c.symbol}|${h}`);
        const spy = spyAtDate.get(String(h));
        if (fwd === undefined || spy === undefined) continue;
        observations.push({
          symbol: c.symbol,
          snapshotDate: date,
          snapshotYear,
          superGroup: sg,
          horizon: h,
          factorPercentiles,
          excessReturn: fwd - spy,
        });
      }
    }
  }

  return observations;
}

/**
 * Winsorize at the 5th and 95th percentiles. Mirrors the convention
 * in `ranking.ts` so the IC pipeline computes percentiles the same
 * way the ranker does — keeps "factor percentile" semantically
 * consistent across the project.
 */
function winsorize5_95(values: number[]): number[] {
  if (values.length < 3) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lowIdx = Math.floor(sorted.length * 0.05);
  const highIdx = Math.ceil(sorted.length * 0.95) - 1;
  const low = sorted[lowIdx]!;
  const high = sorted[Math.max(lowIdx, highIdx)]!;
  return values.map((v) => (v < low ? low : v > high ? high : v));
}
