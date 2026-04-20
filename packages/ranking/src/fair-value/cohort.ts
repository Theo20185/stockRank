import type { CompanySnapshot } from "@stockrank/core";
import { capBucketFor } from "@stockrank/core";
import type { CapBucket } from "@stockrank/core";
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
 * 4. sector alone if industry is also < 3.
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

  const sameSector = universe.filter(
    (c) => exclSubject(c) && c.sector === subject.sector,
  );
  return { peerSet: "sector", peers: sameSector };
}

export function _bucketFor(marketCap: number): CapBucket {
  return capBucketFor(marketCap);
}
