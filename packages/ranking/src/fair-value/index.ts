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

export type { FairValue } from "./types.js";
export { buildFairValueCohort } from "./cohort.js";

/**
 * Compute fair value for a single company against a peer cohort.
 * Pure function — same snapshot + same peers → same output.
 */
export function fairValueFor(
  subject: CompanySnapshot,
  universe: CompanySnapshot[],
): FairValue {
  const cohort = buildFairValueCohort(subject, universe);
  const peers = cohort.peers;

  // EPS choice for the peer-median P/E anchor — may downshift to a
  // normalized prior-years mean if TTM looks like a one-time spike that
  // forward consensus EPS doesn't corroborate. See anchors.ts and
  // fair-value.md §4.
  const epsChoice = chooseEpsForPeerAnchor(subject);

  // ---- Per-anchor computations ----
  const anchors: FairValueAnchors = {
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
    upsideToMedianPct,
    confidence,
    ttmTreatment: epsChoice.treatment satisfies EpsTreatment,
  };
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
