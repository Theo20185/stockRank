/**
 * IC pipeline (backtest.md §3.9) — given a flat array of IcObservation
 * rows, compute one IcCell per (superGroup, factor, horizon).
 *
 * Pure function; no I/O. Caller is responsible for building the
 * observations from snapshot history + forward returns.
 */

import {
  bootstrapSpearmanCi,
  groupBy,
  mulberry32,
  spearmanCorrelation,
} from "../../stats.js";
import type { FactorKey } from "../../types.js";
import type { SuperGroupKey } from "../../super-groups.js";
import { ALL_SUPER_GROUPS } from "../../super-groups.js";
import { FACTORS } from "../../factors.js";
import type { IcCell, IcObservation } from "./types.js";

/**
 * Yearly dedup per backtest.md §3.9.3 — at most one snapshot per
 * (symbol, calendar year) within a cell. Keeps the earliest snapshot
 * in each year (deterministic; matches the case-study sampling
 * convention in §6 decision 3).
 */
export function dedupeYearly(observations: IcObservation[]): IcObservation[] {
  const sorted = [...observations].sort((a, b) =>
    a.snapshotDate < b.snapshotDate ? -1 : 1,
  );
  const seen = new Set<string>();
  const out: IcObservation[] = [];
  for (const obs of sorted) {
    const key = `${obs.symbol}|${obs.snapshotYear}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(obs);
  }
  return out;
}

export type RollingWindow = {
  /** ISO start date inclusive. */
  start: string;
  /** ISO end date exclusive. */
  end: string;
};

/**
 * Build evenly-spaced rolling windows over the date range present in
 * the observations. Default 3 windows for the sign-stability gate.
 *
 * Boundaries are picked so each window has roughly equal date span.
 * Cells with too few observations in a given window get a null entry
 * in `windowIcs`, which the three-gate filter treats as a missing
 * vote (sign-stability needs ≥ 2 of 3 same-sign — null counts as
 * neither).
 */
export function buildRollingWindows(
  observations: IcObservation[],
  count = 3,
): RollingWindow[] {
  if (observations.length === 0 || count < 1) return [];
  const dates = observations.map((o) => o.snapshotDate).sort();
  const earliest = dates[0]!;
  const latest = dates[dates.length - 1]!;
  if (earliest === latest) return [{ start: earliest, end: addOneDay(latest) }];

  const earliestMs = Date.parse(`${earliest}T00:00:00Z`);
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  const span = latestMs - earliestMs;
  const stride = Math.floor(span / count);
  const windows: RollingWindow[] = [];
  for (let i = 0; i < count; i += 1) {
    const startMs = earliestMs + i * stride;
    const endMs = i === count - 1 ? latestMs + DAY_MS : earliestMs + (i + 1) * stride;
    windows.push({
      start: msToIso(startMs),
      end: msToIso(endMs),
    });
  }
  return windows;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function msToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function addOneDay(iso: string): string {
  return msToIso(Date.parse(`${iso}T00:00:00Z`) + DAY_MS);
}

/**
 * Compute one IcCell for the given (superGroup, factor, horizon).
 *
 * The observations passed in must have already been filtered to the
 * super-group and horizon — `computeIcCells` below handles that
 * filtering for the full grid.
 *
 * `skipBootstrap` defaults to false (full pipeline). The Monte Carlo
 * calibration sets it to true — under the null hypothesis we only
 * need the point estimate; the 1000-resample bootstrap inside each
 * cell would multiply Phase 0 runtime by ~1000x for no gain.
 * Similarly skipWindows skips the rolling-window pass when only the
 * full-sample IC is needed (Monte Carlo doesn't need sign-stability).
 */
export function computeIcForCell(
  superGroup: SuperGroupKey,
  factor: FactorKey,
  horizon: number,
  observations: IcObservation[],
  rollingWindows: RollingWindow[],
  rngSeed = 1,
  options: { skipBootstrap?: boolean; skipWindows?: boolean } = {},
): IcCell {
  const deduped = dedupeYearly(observations);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const obs of deduped) {
    const pct = obs.factorPercentiles[factor];
    if (pct === undefined || pct === null) continue;
    xs.push(pct);
    ys.push(obs.excessReturn);
  }

  const nEffective = xs.length;
  const ic = nEffective >= 2 ? spearmanCorrelation(xs, ys) : null;
  const ci95 =
    options.skipBootstrap || nEffective < 5
      ? null
      : bootstrapSpearmanCi(xs, ys, 1000, 0.05, mulberry32(rngSeed));

  const windowIcs = options.skipWindows
    ? []
    : rollingWindows.map((window) => {
        const inWindow = deduped.filter(
          (o) => o.snapshotDate >= window.start && o.snapshotDate < window.end,
        );
        const wxs: number[] = [];
        const wys: number[] = [];
        for (const obs of inWindow) {
          const pct = obs.factorPercentiles[factor];
          if (pct === undefined || pct === null) continue;
          wxs.push(pct);
          wys.push(obs.excessReturn);
        }
        if (wxs.length < 2) return null;
        return spearmanCorrelation(wxs, wys);
      });

  return {
    superGroup,
    factor,
    horizon,
    nEffective,
    ic,
    ci95,
    windowIcs,
  };
}

/**
 * Full grid: compute IC for every (superGroup, factor, horizon) cell.
 * Observations should cover the full universe across all dates and
 * horizons; this function partitions internally.
 */
export function computeIcCells(
  observations: IcObservation[],
  options: {
    rollingWindowCount?: number;
    rngSeed?: number;
    skipBootstrap?: boolean;
    skipWindows?: boolean;
  } = {},
): IcCell[] {
  const {
    rollingWindowCount = 3,
    rngSeed = 1,
    skipBootstrap = false,
    skipWindows = false,
  } = options;
  const grouped = groupBy(observations, (o) => `${o.superGroup}|${o.horizon}`);
  const cells: IcCell[] = [];
  for (const sg of ALL_SUPER_GROUPS) {
    const horizons = new Set<number>();
    for (const o of observations) {
      if (o.superGroup === sg) horizons.add(o.horizon);
    }
    for (const h of horizons) {
      const obs = grouped.get(`${sg}|${h}`) ?? [];
      const windows = skipWindows
        ? []
        : buildRollingWindows(obs, rollingWindowCount);
      let factorSeed = rngSeed;
      for (const factorDef of FACTORS) {
        cells.push(
          computeIcForCell(sg, factorDef.key, h, obs, windows, factorSeed, {
            skipBootstrap,
            skipWindows,
          }),
        );
        factorSeed += 1;
      }
    }
  }
  return cells;
}
