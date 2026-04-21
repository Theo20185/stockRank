import type { CompanySnapshot } from "@stockrank/core";
import type {
  FairValue,
  FairValueAnchorKey,
  FairValueAnchors,
  FairValueConfidence,
} from "./types.js";
import { buildFairValueCohort } from "./cohort.js";
import {
  chooseEpsForPeerAnchor,
  impliedPriceFromEvEbitda,
  impliedPriceFromPE,
  impliedPriceFromPFcf,
  median,
  normalizedEarningsPerShare,
  normalizedEbitda,
  normalizedFcf,
  ownHistoricalEvEbitda,
  ownHistoricalPe,
  ownHistoricalPFcf,
  quantile,
} from "./anchors.js";
import type { EpsTreatment } from "./anchors.js";

const HIGH_SPREAD_LIMIT = 1.5;
const MEDIUM_SPREAD_LIMIT = 2.5;
const HIGH_MIN_ANCHORS = 6;
const MEDIUM_MIN_ANCHORS = 4;

/**
 * When the peer cohort's median P/E differs from the subject's own
 * historical P/E by more than this factor (in either direction), we
 * treat the peer cohort as too distorted (or the subject as
 * structurally different from peers) to use peer-derived anchors.
 *
 * INTC late 2023 was the canonical case: AI-bubble peers gave a
 * peer-median P/E of 175 against INTC's own ~26, an unhealthy 6.8×
 * gap.
 *
 * Threshold tuned at 5.0× via back-test on EIX/INCY/TGT/NVO/INTC:
 * 3.0× over-fired (TGT 50% of snapshots, NVO 87%) on legitimate
 * structural premium / distress; 5.0× catches INTC's bubble case
 * (6.78× ratio) without firing on those everyday cases.
 */
const PEER_DIVERGE_THRESHOLD = 5.0;

export type { FairValue } from "./types.js";
export { buildFairValueCohort } from "./cohort.js";

/**
 * Compute fair value for a single company against a peer cohort.
 * Pure function — same snapshot + same peers → same output.
 */
export type FairValueOptions = {
  /** When true, the peer-median P/E anchor uses the raw TTM EPS even
   * when the outlier rule would have normalized it. Useful for
   * back-testing the rule's contribution: compare the "with rule" and
   * "without rule" outputs to see when the defense actually helped. */
  skipOutlierRule?: boolean;
};

export function fairValueFor(
  subject: CompanySnapshot,
  universe: CompanySnapshot[],
  options: FairValueOptions = {},
): FairValue {
  const cohort = buildFairValueCohort(subject, universe);
  const peers = cohort.peers;

  // EPS choice for the peer-median P/E anchor — may downshift to a
  // normalized prior-years mean if TTM looks like a one-time spike that
  // forward consensus EPS doesn't corroborate. See anchors.ts and
  // fair-value.md §4. The back-test bypass forces TTM through.
  const epsChoice = options.skipOutlierRule
    ? { eps: subject.annual[0]?.income.epsDiluted ?? null, treatment: "ttm" as const }
    : chooseEpsForPeerAnchor(subject);

  // ---- Per-anchor computations ----
  const fullAnchors: FairValueAnchors = {
    peerMedianPE: anchorPeerPE(peers, epsChoice.eps),
    peerMedianEVEBITDA: anchorPeerEvEbitda(subject, peers),
    peerMedianPFCF: anchorPeerPFcf(subject, peers),
    ownHistoricalPE: anchorOwnPE(subject),
    ownHistoricalEVEBITDA: anchorOwnEvEbitda(subject),
    ownHistoricalPFCF: anchorOwnPFcf(subject),
    normalizedPE: anchorNormalizedPE(subject, peers),
    normalizedEVEBITDA: anchorNormalizedEvEbitda(subject, peers),
    normalizedPFCF: anchorNormalizedPFcf(subject, peers),
  };

  // Peer-cohort divergence check: compare peer-median PE multiple
  // against subject's own TTM PE multiple. When they diverge by more
  // than PEER_DIVERGE_THRESHOLD, the peer cohort is either bubbled or
  // busted relative to the subject (or the subject is a structural
  // outlier in its cohort). Drop the 6 peer-derived anchors so the
  // range reflects only the company's own valuation history.
  const peerCohortDivergent = isPeerCohortDivergent(subject, peers);
  const anchors: FairValueAnchors = peerCohortDivergent
    ? {
        ...fullAnchors,
        peerMedianPE: null,
        peerMedianEVEBITDA: null,
        peerMedianPFCF: null,
        normalizedPE: null,
        normalizedEVEBITDA: null,
        normalizedPFCF: null,
      }
    : fullAnchors;

  const anchorValues = (Object.values(anchors).filter(
    (v): v is number => v !== null && v > 0,
  ) as number[]);

  let range: FairValue["range"] = null;
  if (anchorValues.length > 0) {
    const m = median(anchorValues);
    const p25 = quantile(anchorValues, 25);
    const p75 = quantile(anchorValues, 75);
    if (m !== null && p25 !== null && p75 !== null) {
      range = { p25, median: m, p75 };
    }
  }

  const current = subject.quote.price;
  const upsideToMedianPct =
    range && current > 0 ? ((range.median - current) / current) * 100 : null;
  const upsideToP25Pct =
    range && current > 0 ? ((range.p25 - current) / current) * 100 : null;

  const confidence = computeConfidence(
    cohort.peerSet,
    anchorValues.length,
    range,
  );

  return {
    peerSet: cohort.peerSet,
    peerCount: peers.length,
    anchors,
    range,
    current,
    upsideToP25Pct,
    upsideToMedianPct,
    confidence,
    ttmTreatment: epsChoice.treatment satisfies EpsTreatment,
    peerCohortDivergent,
  };
}

/**
 * True when the peer-median P/E multiple differs from the subject's
 * own historical P/E by more than PEER_DIVERGE_THRESHOLD in either
 * direction. Symmetric: works for either bubbled peers (peer >> own)
 * or compressed peers (own >> peer).
 */
function isPeerCohortDivergent(
  subject: CompanySnapshot,
  peers: CompanySnapshot[],
): boolean {
  const ownPe = subject.ttm.peRatio;
  if (ownPe === null || ownPe <= 0) return false;
  const peerPes = peers
    .map((p) => p.ttm.peRatio)
    .filter((v): v is number => v !== null && v > 0);
  if (peerPes.length === 0) return false;
  const peerMedianPe = median(peerPes);
  if (peerMedianPe === null || peerMedianPe <= 0) return false;
  const ratio = Math.max(peerMedianPe / ownPe, ownPe / peerMedianPe);
  return ratio > PEER_DIVERGE_THRESHOLD;
}

function computeConfidence(
  peerSet: FairValue["peerSet"],
  anchorCount: number,
  range: FairValue["range"],
): FairValueConfidence {
  const spreadOk = (limit: number): boolean => {
    if (!range) return false;
    if (range.p25 <= 0) return false;
    return range.p75 / range.p25 <= limit;
  };
  if (
    peerSet === "cohort" &&
    anchorCount >= HIGH_MIN_ANCHORS &&
    spreadOk(HIGH_SPREAD_LIMIT)
  ) {
    return "high";
  }
  if (
    (peerSet === "cohort" || peerSet === "narrow") &&
    anchorCount >= MEDIUM_MIN_ANCHORS &&
    spreadOk(MEDIUM_SPREAD_LIMIT)
  ) {
    return "medium";
  }
  return "low";
}

// ---- Peer-median anchors ----

function anchorPeerPE(
  peers: CompanySnapshot[],
  epsToUse: number | null,
): number | null {
  const validPes = peers
    .map((p) => p.ttm.peRatio)
    .filter((v): v is number => v !== null && v > 0);
  if (validPes.length === 0) return null;
  return impliedPriceFromPE(epsToUse, median(validPes));
}

function anchorPeerEvEbitda(subject: CompanySnapshot, peers: CompanySnapshot[]): number | null {
  const validMultiples = peers
    .map((p) => p.ttm.evToEbitda)
    .filter((v): v is number => v !== null && v > 0);
  if (validMultiples.length === 0) return null;
  const mult = median(validMultiples);
  const ebitda = subject.annual[0]?.income.ebitda ?? null;
  const debt = subject.annual[0]?.balance.totalDebt ?? 0;
  const cash = subject.annual[0]?.balance.cash ?? 0;
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromEvEbitda(ebitda, mult, debt, cash, shares);
}

function anchorPeerPFcf(subject: CompanySnapshot, peers: CompanySnapshot[]): number | null {
  const validMultiples = peers
    .map((p) => p.ttm.priceToFcf)
    .filter((v): v is number => v !== null && v > 0);
  if (validMultiples.length === 0) return null;
  const mult = median(validMultiples);
  const fcf = subject.annual[0]?.cashFlow.freeCashFlow ?? null;
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromPFcf(fcf, mult, shares);
}

// ---- Own-historical anchors (proxy: TTM multiple × current trailing earnings) ----

function anchorOwnPE(subject: CompanySnapshot): number | null {
  const m = ownHistoricalPe(subject);
  return impliedPriceFromPE(subject.annual[0]?.income.epsDiluted ?? null, m);
}

function anchorOwnEvEbitda(subject: CompanySnapshot): number | null {
  const m = ownHistoricalEvEbitda(subject);
  const ebitda = subject.annual[0]?.income.ebitda ?? null;
  const debt = subject.annual[0]?.balance.totalDebt ?? 0;
  const cash = subject.annual[0]?.balance.cash ?? 0;
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromEvEbitda(ebitda, m, debt, cash, shares);
}

function anchorOwnPFcf(subject: CompanySnapshot): number | null {
  const m = ownHistoricalPFcf(subject);
  const fcf = subject.annual[0]?.cashFlow.freeCashFlow ?? null;
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromPFcf(fcf, m, shares);
}

// ---- Normalized-earnings anchors (peer multiple × cycle-average earnings) ----

function anchorNormalizedPE(subject: CompanySnapshot, peers: CompanySnapshot[]): number | null {
  const validPes = peers
    .map((p) => p.ttm.peRatio)
    .filter((v): v is number => v !== null && v > 0);
  if (validPes.length === 0) return null;
  const normalizedEps = normalizedEarningsPerShare(subject.annual);
  return impliedPriceFromPE(normalizedEps, median(validPes));
}

function anchorNormalizedEvEbitda(subject: CompanySnapshot, peers: CompanySnapshot[]): number | null {
  const validMultiples = peers
    .map((p) => p.ttm.evToEbitda)
    .filter((v): v is number => v !== null && v > 0);
  if (validMultiples.length === 0) return null;
  const mult = median(validMultiples);
  const normalEbitda = normalizedEbitda(subject.annual);
  const debt = subject.annual[0]?.balance.totalDebt ?? 0;
  const cash = subject.annual[0]?.balance.cash ?? 0;
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromEvEbitda(normalEbitda, mult, debt, cash, shares);
}

function anchorNormalizedPFcf(subject: CompanySnapshot, peers: CompanySnapshot[]): number | null {
  const validMultiples = peers
    .map((p) => p.ttm.priceToFcf)
    .filter((v): v is number => v !== null && v > 0);
  if (validMultiples.length === 0) return null;
  const mult = median(validMultiples);
  const normalFcf = normalizedFcf(subject.annual);
  const shares = subject.annual[0]?.income.sharesDiluted ?? null;
  return impliedPriceFromPFcf(normalFcf, mult, shares);
}
