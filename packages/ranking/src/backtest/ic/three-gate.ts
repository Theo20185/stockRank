/**
 * Three-gate filter (backtest.md §3.10) — applies the statistical,
 * economic, and sign-stability gates to an IcCell to produce a
 * pass/fail verdict.
 *
 * Pure function. Inputs: an IcCell + the per-cell null threshold from
 * Phase 0 calibration. Output: ThreeGateVerdict.
 */

import type {
  IcCalibration,
  IcCell,
  IcCellWithVerdict,
  ThreeGateVerdict,
} from "./types.js";

/** Hand-set economic floor from spec §3.10 Gate 2. */
export const ECONOMIC_FLOOR_IC = 0.05;

/**
 * Apply the three gates to a single cell. Order matters for the
 * `reason` string — we report the FIRST gate to fail, so callers see
 * the most relevant reason.
 *
 * Gate ordering rationale:
 *   1. Insufficient-data is a special case (no cell to evaluate)
 *   2. Statistical comes next — if the IC isn't above the noise
 *      floor, nothing else matters
 *   3. Economic — meaningful magnitude
 *   4. Sign-stability — robust across regimes
 */
export function applyThreeGates(
  cell: IcCell,
  thresholds: Map<string, number>,
): ThreeGateVerdict {
  if (cell.ic === null) {
    return {
      verdict: "fail-insufficient-data",
      reason: `IC undefined (n=${cell.nEffective}, factor or return constant)`,
    };
  }

  // Gate 1 — statistical.
  const key = `${cell.superGroup}|${cell.horizon}`;
  const threshold = thresholds.get(key);
  if (threshold === undefined) {
    return {
      verdict: "fail-insufficient-data",
      reason: `no calibration threshold for ${key}`,
    };
  }
  if (Math.abs(cell.ic) < threshold) {
    return {
      verdict: "fail-statistical",
      reason: `|IC|=${cell.ic.toFixed(3)} below null-99th=${threshold.toFixed(3)} (cell-specific noise floor)`,
    };
  }

  // Gate 2 — economic.
  if (Math.abs(cell.ic) < ECONOMIC_FLOOR_IC) {
    return {
      verdict: "fail-economic",
      reason: `|IC|=${cell.ic.toFixed(3)} below economic floor of ${ECONOMIC_FLOOR_IC.toFixed(2)} (real but too small to act on)`,
    };
  }

  // Gate 3 — sign-stability.
  const sign = cell.ic > 0 ? 1 : -1;
  let sameSign = 0;
  let validWindows = 0;
  for (const w of cell.windowIcs) {
    if (w === null) continue;
    validWindows += 1;
    if ((w > 0 ? 1 : -1) === sign) sameSign += 1;
  }
  // Spec: "same sign in ≥ 2 of 3 windows". If fewer than 2 windows have
  // data at all, sign-stability can't be evaluated reliably — fail
  // closed.
  if (validWindows < 2 || sameSign < 2) {
    return {
      verdict: "fail-sign-stability",
      reason: `sign agreement ${sameSign}/${validWindows} windows (need ≥ 2 same-sign)`,
    };
  }

  return {
    verdict: "pass",
    reason: `IC=${cell.ic.toFixed(3)} ≥ noise floor ${threshold.toFixed(3)}, economic floor, sign-stable in ${sameSign}/${validWindows} windows`,
  };
}

/**
 * Convenience: apply gates to a list of cells using a flat
 * IcCalibration archive. Builds the (superGroup, horizon) → threshold
 * lookup once.
 */
export function applyGatesToAll(
  cells: IcCell[],
  calibration: IcCalibration,
): IcCellWithVerdict[] {
  const lookup = new Map<string, number>();
  for (const t of calibration.thresholds) {
    lookup.set(`${t.superGroup}|${t.horizon}`, t.threshold99);
  }
  return cells.map((c) => ({ ...c, verdict: applyThreeGates(c, lookup) }));
}
