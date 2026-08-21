import { describe, expect, it } from "vitest";
import type { FairValueAnchors } from "../../fair-value/types.js";
import {
  ALL_ANCHOR_KEYS,
  OWN_ANCHOR_KEYS,
  PEER_ANCHOR_KEYS,
  anchorCorrelationReport,
  bandFromAnchors,
  jacobiEigenvalues,
} from "./ablation.js";

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

describe("bandFromAnchors", () => {
  it("mirrors the production quantile convention (linear interpolation)", () => {
    const a = anchors({
      ownHistoricalPE: 50,
      ownHistoricalEVEBITDA: 100,
      ownHistoricalPFCF: 150,
    });
    const band = bandFromAnchors(a, OWN_ANCHOR_KEYS)!;
    // Sorted [50, 100, 150]: p25 at idx 0.5 → 75; median 100; p75 125.
    expect(band.p25).toBe(75);
    expect(band.median).toBe(100);
    expect(band.p75).toBe(125);
  });

  it("filters null and non-positive anchors", () => {
    const a = anchors({ ownHistoricalPE: -5, ownHistoricalEVEBITDA: 80 });
    const band = bandFromAnchors(a, OWN_ANCHOR_KEYS)!;
    expect(band.p25).toBe(80);
    expect(band.p75).toBe(80);
  });

  it("returns null when no anchor in the subset survives", () => {
    expect(bandFromAnchors(anchors(), PEER_ANCHOR_KEYS)).toBeNull();
  });

  it("key groups partition the 9 anchors", () => {
    expect(OWN_ANCHOR_KEYS.length + PEER_ANCHOR_KEYS.length).toBe(9);
    expect(new Set(ALL_ANCHOR_KEYS).size).toBe(9);
  });
});

describe("jacobiEigenvalues", () => {
  it("identity matrix → all eigenvalues 1", () => {
    const eye = Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => (i === j ? 1 : 0)),
    );
    const eig = jacobiEigenvalues(eye).sort((a, b) => b - a);
    for (const l of eig) expect(l).toBeCloseTo(1, 10);
  });

  it("all-ones correlation (perfectly redundant) → one eigenvalue n, rest 0", () => {
    const ones = Array.from({ length: 3 }, () => [1, 1, 1]);
    const eig = jacobiEigenvalues(ones).sort((a, b) => b - a);
    expect(eig[0]).toBeCloseTo(3, 8);
    expect(eig[1]).toBeCloseTo(0, 8);
    expect(eig[2]).toBeCloseTo(0, 8);
  });

  it("known 2x2: [[2,1],[1,2]] → {3, 1}", () => {
    const eig = jacobiEigenvalues([
      [2, 1],
      [1, 2],
    ]).sort((a, b) => b - a);
    expect(eig[0]).toBeCloseTo(3, 8);
    expect(eig[1]).toBeCloseTo(1, 8);
  });
});

describe("anchorCorrelationReport", () => {
  it("lockstep anchors correlate at 1; redundancy shrinks the effective count", () => {
    // peerMedianPE and normalizedPE move in lockstep (2× scale);
    // ownHistoricalPE varies independently so the row-median
    // normalization doesn't collapse columns to constants.
    const rows = Array.from({ length: 40 }, (_, i) =>
      anchors({
        peerMedianPE: 100 + i * 3,
        normalizedPE: (100 + i * 3) * 2,
        ownHistoricalPE: 100 + ((i * 37) % 50),
      }),
    );
    const rep = anchorCorrelationReport(rows)!;
    const iPeer = rep.anchorKeys.indexOf("peerMedianPE");
    const iNorm = rep.anchorKeys.indexOf("normalizedPE");
    expect(rep.matrix[iPeer]![iNorm]).toBeCloseTo(1, 6);
    // 3 populated anchors, 2 perfectly redundant → n_eff well under 3.
    expect(rep.effectiveAnchorCount).toBeGreaterThan(1);
    expect(rep.effectiveAnchorCount).toBeLessThan(2.5);
  });

  it("counts pairs below the min-N floor instead of reporting noise correlations", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      anchors({ peerMedianPE: 100 + i, ownHistoricalPE: 90 + i }),
    );
    const rep = anchorCorrelationReport(rows)!;
    const i = rep.anchorKeys.indexOf("peerMedianPE");
    const j = rep.anchorKeys.indexOf("ownHistoricalPE");
    expect(rep.matrix[i]![j]).toBeNull();
    expect(rep.cellsBelowMinN).toBeGreaterThan(0);
  });

  it("returns null on empty input", () => {
    expect(anchorCorrelationReport([])).toBeNull();
  });
});
