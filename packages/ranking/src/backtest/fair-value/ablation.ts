/**
 * H6 anchor-ablation helpers: recompute the p25/median/p75 band from a
 * subset of anchors, and quantify the anchors' correlation structure
 * (the 9 anchors are 3 multiple sources × 3 earnings bases, not 9
 * independent estimates — this measures how many effective anchors
 * there really are).
 *
 * Pure functions; band math mirrors fairValueFor exactly (filter
 * null/non-positive, quantile 25/50/75 with linear interpolation).
 */

import { median, quantile } from "../../fair-value/anchors.js";
import { spearmanCorrelation } from "../../stats.js";
import type { FairValueAnchorKey, FairValueAnchors } from "../../fair-value/types.js";
import { H6_MIN_PAIRWISE_N } from "./types.js";
import type { FvH6CorrelationReport } from "./types.js";

export const OWN_ANCHOR_KEYS: readonly FairValueAnchorKey[] = [
  "ownHistoricalPE",
  "ownHistoricalEVEBITDA",
  "ownHistoricalPFCF",
];

export const PEER_ANCHOR_KEYS: readonly FairValueAnchorKey[] = [
  "peerMedianPE",
  "peerMedianEVEBITDA",
  "peerMedianPFCF",
  "normalizedPE",
  "normalizedEVEBITDA",
  "normalizedPFCF",
];

export const ALL_ANCHOR_KEYS: readonly FairValueAnchorKey[] = [
  ...PEER_ANCHOR_KEYS.slice(0, 3),
  ...OWN_ANCHOR_KEYS,
  ...PEER_ANCHOR_KEYS.slice(3),
];

/** Band from a subset of anchor values — same filter + quantile
 * convention as fairValueFor. Null when no positive anchor survives. */
export function bandFromAnchors(
  anchors: FairValueAnchors,
  keys: readonly FairValueAnchorKey[],
): { p25: number; median: number; p75: number } | null {
  const values = keys
    .map((k) => anchors[k])
    .filter((v): v is number => v !== null && v > 0);
  if (values.length === 0) return null;
  const m = median(values);
  const p25 = quantile(values, 25);
  const p75 = quantile(values, 75);
  if (m === null || p25 === null || p75 === null) return null;
  return { p25, median: m, p75 };
}

/**
 * Pairwise-Spearman correlation matrix of the 9 anchors across rows.
 *
 * Each row's anchors are first normalized by that row's median
 * positive anchor — Spearman is computed ACROSS rows per anchor pair,
 * so without normalization the shared price scale would swamp the
 * relative disagreement the matrix is meant to expose.
 *
 * Pairs with fewer than H6_MIN_PAIRWISE_N co-present rows get a 0
 * entry (independence assumption) and are counted in cellsBelowMinN.
 */
export function anchorCorrelationReport(
  rows: readonly FairValueAnchors[],
): FvH6CorrelationReport | null {
  if (rows.length === 0) return null;
  const keys = [...ALL_ANCHOR_KEYS];
  const normalized: Array<Array<number | null>> = [];
  for (const anchors of rows) {
    const values = keys.map((k) => anchors[k]);
    const positives = values.filter((v): v is number => v !== null && v > 0);
    const rowMedian = median(positives);
    if (rowMedian === null || rowMedian <= 0) continue;
    normalized.push(
      values.map((v) => (v !== null && v > 0 ? v / rowMedian : null)),
    );
  }
  if (normalized.length === 0) return null;

  const k = keys.length;
  const matrix: Array<Array<number | null>> = Array.from({ length: k }, () =>
    Array.from({ length: k }, () => null),
  );
  const pairwiseN: number[][] = Array.from({ length: k }, () =>
    Array.from({ length: k }, () => 0),
  );
  let cellsBelowMinN = 0;

  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const row of normalized) {
        const a = row[i] ?? null;
        const b = row[j] ?? null;
        if (a === null || b === null) continue;
        xs.push(a);
        ys.push(b);
      }
      pairwiseN[i]![j] = xs.length;
      pairwiseN[j]![i] = xs.length;
      if (i === j) {
        matrix[i]![j] = 1;
        continue;
      }
      if (xs.length < H6_MIN_PAIRWISE_N) {
        cellsBelowMinN += 1;
        matrix[i]![j] = null;
        matrix[j]![i] = null;
        continue;
      }
      const rho = spearmanCorrelation(xs, ys);
      matrix[i]![j] = rho;
      matrix[j]![i] = rho;
    }
  }

  // Eigen-decomposition over the ACTIVE anchor block only. An anchor
  // present in fewer than H6_MIN_PAIRWISE_N rows would enter the
  // matrix as an identity row (diagonal 1, off-diagonal 0) and
  // masquerade as an independent evidence source worth a full
  // eigenvalue — exclude it instead and report the exclusion.
  //
  // Pairwise-complete Spearman matrices can be slightly non-PSD;
  // negative eigenvalues are clamped to 0 for the n_eff computation
  // and reported as-is in `eigenvalues`.
  const activeIdx = keys
    .map((_, i) => i)
    .filter((i) => pairwiseN[i]![i]! >= H6_MIN_PAIRWISE_N);
  const excludedAnchorKeys = keys.filter(
    (_, i) => !activeIdx.includes(i),
  );
  const dense = activeIdx.map((i) =>
    activeIdx.map((j) => matrix[i]![j] ?? 0),
  );
  const eigenvalues =
    dense.length > 0 ? jacobiEigenvalues(dense).sort((a, b) => b - a) : [];
  const clamped = eigenvalues.map((l) => Math.max(l, 0));
  const sum = clamped.reduce((s, l) => s + l, 0);
  const sumSq = clamped.reduce((s, l) => s + l * l, 0);
  const effectiveAnchorCount = sumSq > 0 ? (sum * sum) / sumSq : 0;

  return {
    anchorKeys: keys,
    matrix,
    pairwiseN,
    excludedAnchorKeys,
    eigenvalues,
    effectiveAnchorCount,
    activeAnchorCount: activeIdx.length,
    cellsBelowMinN,
  };
}

/**
 * Eigenvalues of a symmetric matrix via cyclic Jacobi rotations.
 * 9×9 inputs converge in a handful of sweeps; tolerance on the
 * off-diagonal Frobenius norm.
 */
export function jacobiEigenvalues(
  input: ReadonlyArray<ReadonlyArray<number>>,
  maxSweeps = 100,
  tolerance = 1e-12,
): number[] {
  const n = input.length;
  const a = input.map((row) => [...row]);

  const offDiagonalNorm = (): number => {
    let s = 0;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) s += a[i]![j]! * a[i]![j]!;
    }
    return Math.sqrt(s);
  };

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    if (offDiagonalNorm() < tolerance) break;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < tolerance / (n * n)) continue;
        const app = a[p]![p]!;
        const aqq = a[q]![q]!;
        const theta = (aqq - app) / (2 * apq);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let i = 0; i < n; i += 1) {
          const aip = a[i]![p]!;
          const aiq = a[i]![q]!;
          a[i]![p] = c * aip - s * aiq;
          a[i]![q] = s * aip + c * aiq;
        }
        for (let i = 0; i < n; i += 1) {
          const api = a[p]![i]!;
          const aqi = a[q]![i]!;
          a[p]![i] = c * api - s * aqi;
          a[q]![i] = s * api + c * aqi;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i]![i]!);
}
