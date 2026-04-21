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
  /**
   * Headline upside vs the conservative-tail fair value (p25). The
   * primary "Upside" column on the ranked table reads this — a stock
   * being above its conservative tail is a hard disqualifier from the
   * Ranked bucket, regardless of how well it scores on the median.
   */
  upsideToP25Pct: number | null;
  /** Legacy upside vs the median anchor; kept for reference. */
  upsideToMedianPct: number | null;
  confidence: FairValueConfidence;
  /**
   * Indicates whether the peer-median P/E anchor used the raw TTM EPS
   * ("ttm") or fell back to a normalized prior-years mean because the
   * TTM number looked like a one-time spike ("normalized"). Surfaced
   * so the UI can flag fair-value rows where the model adjusted.
   */
  ttmTreatment: "ttm" | "normalized";
  /**
   * True when the peer-median P/E multiple diverged from the subject's
   * own historical P/E by more than the configured threshold (3× by
   * default). The 6 peer-derived anchors (peerMedian* and normalized*)
   * are dropped from the range when this fires; only the 3
   * own-historical anchors contribute. Surfaced so the UI can display
   * "peer cohort deemed unreliable" — the resulting fair-value range
   * reflects only the company's own valuation history.
   */
  peerCohortDivergent: boolean;
};
