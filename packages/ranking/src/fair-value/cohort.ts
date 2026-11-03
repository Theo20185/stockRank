import type { CompanySnapshot } from "@stockrank/core";
import { capBucketFor } from "@stockrank/core";
import type { CapBucket } from "@stockrank/core";
import { superGroupOf } from "../super-groups.js";
import type { FairValuePeerSet } from "./types.js";

const COHORT_MIN = 8;
const COHORT_NARROW_MIN = 3;

export type FairValueCohort = {
  peerSet: FairValuePeerSet;
  peers: CompanySnapshot[]; // excludes the subject
};

/**
 * Per fair-value.md §3, build the peer set for a subject company:
 * 1. industry + cap bucket cohort if N ≥ 8.
 * 2. cohort if 3 ≤ N < 8 (mark "narrow").
 * 3. industry alone if N < 3.
 * 4. super-group if the industry is also < 3 (2026-11-02 — the jump
 *    straight to sector handed DECK 53 assorted Consumer Cyclical
 *    comparables including autos and airlines; the super-group keeps
 *    the matching economics per super-groups.md).
 * 5. sector as the last resort (super-group unmapped or < 3).
 *
 * Always excludes the subject company from the returned peers.
 */
export function buildFairValueCohort(
  subject: CompanySnapshot,
  universe: CompanySnapshot[],
): FairValueCohort {
  const subjectBucket = capBucketFor(subject.marketCap);
  const exclSubject = (c: CompanySnapshot): boolean => c.symbol !== subject.symbol;

  const sameIndustryAndCap = universe.filter(
    (c) =>
      exclSubject(c) &&
      c.industry === subject.industry &&
      capBucketFor(c.marketCap) === subjectBucket,
  );
  if (sameIndustryAndCap.length >= COHORT_MIN) {
    return { peerSet: "cohort", peers: sameIndustryAndCap };
  }
  if (sameIndustryAndCap.length >= COHORT_NARROW_MIN) {
    return { peerSet: "narrow", peers: sameIndustryAndCap };
  }

  const sameIndustry = universe.filter(
    (c) => exclSubject(c) && c.industry === subject.industry,
  );
  if (sameIndustry.length >= COHORT_NARROW_MIN) {
    return { peerSet: "industry", peers: sameIndustry };
  }

  const subjectGroup = superGroupOf(subject.industry);
  if (subjectGroup !== null) {
    const sameSuperGroup = universe.filter(
      (c) => exclSubject(c) && superGroupOf(c.industry) === subjectGroup,
    );
    if (sameSuperGroup.length >= COHORT_NARROW_MIN) {
      return { peerSet: "super-group", peers: sameSuperGroup };
    }
  }

  const sameSector = universe.filter(
    (c) => exclSubject(c) && c.sector === subject.sector,
  );
  return { peerSet: "sector", peers: sameSector };
}

export function _bucketFor(marketCap: number): CapBucket {
  return capBucketFor(marketCap);
}
