/**
 * Per-stock bucket rationale — the "Why this bucket?" answer surfaced
 * on the stock detail page. Pure function over a row + the snapshot
 * it lives in.
 *
 * Two layers of information:
 *  1. **Primary reason** — the rule that placed the row. One of:
 *       actionable-buy, above-conservative-tail, negative-equity,
 *       bottom-decile-composite, no-fair-value, failed-quality-floor,
 *       model-incompatible-industry. The headline string is built
 *       from this.
 *  2. **Strengths / weaknesses** — top and bottom category scores
 *       relative to the eligible cohort, plus tracked structural
 *       flags (negativeEquity, declining FV trend, etc.). Surfaced
 *       as short bullet items so the user can scan in <5 seconds.
 *
 * The Avoid bucket merge (2026-04-26) collapsed four sub-cases into
 * one user-facing answer; this module is the way the user can still
 * tell *which* sub-case applies to a specific stock.
 */

import type { CategoryKey, RankedRow, RankedSnapshot } from "../types.js";
import { MODEL_INCOMPATIBLE_INDUSTRIES, classifyRow, type BucketKey } from "../buckets.js";

export type BucketReasonCode =
  | "actionable-buy"
  | "above-conservative-tail"
  | "negative-equity"
  | "bottom-decile-composite"
  | "no-fair-value"
  | "failed-quality-floor"
  | "model-incompatible-industry";

export type BucketRationale = {
  bucket: BucketKey;
  primaryReason: BucketReasonCode;
  /** One-sentence explanation of why the row landed in its bucket. */
  headline: string;
  /** Up to 3 short bullets — what the engine likes about this name. */
  strengths: string[];
  /** Up to 3 short bullets — what the engine doesn't like or can't see. */
  weaknesses: string[];
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  valuation: "Valuation",
  health: "Financial health",
  quality: "Quality",
  shareholderReturn: "Shareholder return",
  growth: "Growth",
  momentum: "Momentum",
};

/** Category-score thresholds. Scores are normalized 0-1 in RankedRow. */
const STRENGTH_THRESHOLD = 0.65;
const WEAKNESS_THRESHOLD = 0.35;

const AVOID_PERCENTILE_DEFAULT = 0.10;

/**
 * Determine which sub-reason of Avoid (or Watch) applies. This duplicates
 * the bucket logic in classifyRow but returns the *why*, not the bucket.
 */
function avoidReasonFor(
  row: RankedRow,
  inBottomDecile: boolean,
): BucketReasonCode {
  if (MODEL_INCOMPATIBLE_INDUSTRIES.has(row.industry))
    return "model-incompatible-industry";
  const allFiveMissing = (Object.values(row.categoryScores) as Array<number | null>)
    .filter((v, i) => i < 5) // momentum (idx 5) excluded
    .every((v) => v === null);
  if (allFiveMissing) return "failed-quality-floor";
  if (!row.fairValue || !row.fairValue.range) return "no-fair-value";
  if (inBottomDecile) return "bottom-decile-composite";
  // Fallback — shouldn't normally hit.
  return "bottom-decile-composite";
}

function bottomDecileCutoff(snapshot: RankedSnapshot, percentile: number): number {
  const composites = snapshot.rows
    .filter((r) => {
      const k = classifyRow(r);
      return k !== "avoid" && r.composite > 0;
    })
    .map((r) => r.composite)
    .sort((a, b) => a - b);
  if (composites.length === 0 || percentile <= 0) return -Infinity;
  const idx = Math.max(0, Math.ceil(composites.length * percentile) - 1);
  return composites[idx]!;
}

function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

function formatScore(value: number): string {
  return Math.round(value * 100).toString();
}

/**
 * Build the strengths list from category scores ≥ STRENGTH_THRESHOLD,
 * sorted descending. Caps at 3 entries.
 */
function buildStrengths(row: RankedRow): string[] {
  const items: Array<{ score: number; text: string }> = [];
  for (const cat of Object.keys(row.categoryScores) as CategoryKey[]) {
    if (cat === "momentum") continue; // weighted 0; not user-facing
    const score = row.categoryScores[cat];
    if (score === null || score < STRENGTH_THRESHOLD) continue;
    items.push({
      score,
      text: `${CATEGORY_LABELS[cat]} score ${formatScore(score)}/100`,
    });
  }
  items.sort((a, b) => b.score - a.score);
  const out = items.slice(0, 3).map((i) => i.text);
  // Add structural positives.
  if (
    row.fairValue?.range &&
    row.fairValue.current < row.fairValue.range.p25 &&
    row.fairValue.upsideToP25Pct !== null &&
    out.length < 3
  ) {
    out.push(
      `Trades ${formatPct(row.fairValue.upsideToP25Pct, 1)} below conservative fair value (p25)`,
    );
  }
  if (row.fairValue?.confidence === "high" && out.length < 3) {
    out.push("High-confidence fair value (full anchor coverage)");
  }
  return out;
}

/**
 * Build the weaknesses list from category scores ≤ WEAKNESS_THRESHOLD
 * + structural flags + missing categories. Caps at 3 entries.
 */
function buildWeaknesses(row: RankedRow): string[] {
  const items: Array<{ score: number; text: string }> = [];
  for (const cat of Object.keys(row.categoryScores) as CategoryKey[]) {
    if (cat === "momentum") continue;
    const score = row.categoryScores[cat];
    if (score === null || score > WEAKNESS_THRESHOLD) continue;
    items.push({
      score,
      text: `${CATEGORY_LABELS[cat]} score ${formatScore(score)}/100`,
    });
  }
  items.sort((a, b) => a.score - b.score); // lowest first
  const out = items.slice(0, 3).map((i) => i.text);

  // Structural flags.
  if (row.negativeEquity && out.length < 3) {
    out.push("Negative shareholders' equity (sustained buybacks; ROIC nulls structurally)");
  }
  if (row.fvTrend === "declining" && out.length < 3) {
    out.push("Fair value trending down ~2 years (informational; not a demote)");
  }
  if (row.fairValue?.peerCohortDivergent && out.length < 3) {
    out.push("Peer cohort deemed unreliable — FV uses own history only");
  }
  if (row.fairValue?.confidence === "low" && out.length < 3) {
    out.push("Low-confidence fair value (limited anchor coverage)");
  }
  // Missing-category callout — only if any are missing AND we have room.
  const missingCats = (Object.keys(row.categoryScores) as CategoryKey[]).filter(
    (c) => c !== "momentum" && row.categoryScores[c] === null,
  );
  if (missingCats.length > 0 && out.length < 3) {
    const labels = missingCats.map((c) => CATEGORY_LABELS[c]).join(", ");
    out.push(`Missing data for: ${labels}`);
  }
  return out;
}

const HEADLINE_BY_REASON: Record<BucketReasonCode, (row: RankedRow) => string> = {
  "actionable-buy": (row) => {
    const upside = row.fairValue?.upsideToP25Pct;
    if (upside === null || upside === undefined) {
      return "Buy candidate — trades below the conservative fair value (p25).";
    }
    return `Buy candidate — trades ${formatPct(upside, 1)} below the conservative fair value (p25).`;
  },
  "above-conservative-tail": () =>
    "Watch — fair value present but the price is at or above the conservative tail (p25). Worth tracking; not actionable today.",
  "negative-equity": () =>
    "Watch — sustained buybacks have driven shareholders' equity below zero. ROIC nulls out structurally; otherwise the engine still scores the company.",
  "bottom-decile-composite": (row) =>
    `Avoid — composite (${formatScore(row.composite / 100)}/100) sits in the bottom decile of the eligible cohort. Phase 4A long/short evidence: this tail underperformed SPY by ~25 pp at 3y in COVID-era PIT data.`,
  "no-fair-value": () =>
    "Avoid — couldn't compute a fair value range (insufficient anchors). Without an FV anchor the engine can't tell if the price is cheap or expensive.",
  "failed-quality-floor": () =>
    "Avoid — failed the §4 quality floor entirely (no category scored). The engine can't size up the business well enough to act.",
  "model-incompatible-industry": (row) =>
    `Avoid — ${row.industry} accounting is outside the model's domain (PE / EV-EBITDA / P-FCF anchors don't apply to banks, capital markets, or reinsurers). Even an attractive-looking FV here would be extrapolation noise.`,
};

export function bucketRationaleFor(
  row: RankedRow,
  snapshot: RankedSnapshot,
  options: { avoidPercentile?: number } = {},
): BucketRationale {
  const avoidPercentile = options.avoidPercentile ?? AVOID_PERCENTILE_DEFAULT;
  const klass = classifyRow(row);

  // Determine if it's in the bottom-decile cohort (only eligible
  // rows compete for that cutoff).
  const cutoff = bottomDecileCutoff(snapshot, avoidPercentile);
  const inBottomDecile =
    klass !== "avoid" && row.composite > 0 && row.composite <= cutoff;

  let bucket: BucketKey;
  let reason: BucketReasonCode;
  if (klass === "avoid") {
    bucket = "avoid";
    reason = avoidReasonFor(row, false);
  } else if (inBottomDecile) {
    bucket = "avoid";
    reason = "bottom-decile-composite";
  } else if (klass === "ranked") {
    bucket = "ranked";
    reason = "actionable-buy";
  } else {
    bucket = "watch";
    reason = row.negativeEquity ? "negative-equity" : "above-conservative-tail";
  }

  const headline = HEADLINE_BY_REASON[reason](row);
  const strengths = buildStrengths(row);
  const weaknesses = buildWeaknesses(row);

  return { bucket, primaryReason: reason, headline, strengths, weaknesses };
}

export const BUCKET_REASON_LABELS: Record<BucketReasonCode, string> = {
  "actionable-buy": "Actionable buy candidate",
  "above-conservative-tail": "Above conservative-tail FV",
  "negative-equity": "Negative shareholders' equity (structural)",
  "bottom-decile-composite": "Bottom decile of composite scores",
  "no-fair-value": "No fair value range",
  "failed-quality-floor": "Failed §4 quality floor",
  "model-incompatible-industry": "Model-incompatible industry",
};
