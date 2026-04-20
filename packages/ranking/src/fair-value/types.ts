/**
 * Fair-value module type stub. Concrete implementation lands with
 * the fair-value module itself; types.ts and ranking row need it
 * declared so they can hold the field even before the module is
 * implemented.
 */

export type FairValueAnchorKey =
  | "peerMedianPE"
  | "peerMedianEVEBITDA"
  | "peerMedianPFCF"
  | "ownHistoricalPE"
  | "ownHistoricalEVEBITDA"
  | "ownHistoricalPFCF"
  | "normalizedPE"
  | "normalizedEVEBITDA"
  | "normalizedPFCF";

export type FairValuePeerSet = "cohort" | "narrow" | "industry" | "sector";
export type FairValueConfidence = "high" | "medium" | "low";

export type FairValueAnchors = Record<FairValueAnchorKey, number | null>;

export type FairValue = {
  peerSet: FairValuePeerSet;
  peerCount: number;
  anchors: FairValueAnchors;
  range: { p25: number; median: number; p75: number } | null;
  current: number;
  upsideToMedianPct: number | null;
  confidence: FairValueConfidence;
};
