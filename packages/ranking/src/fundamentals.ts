/**
 * Classifies a company's fundamental trajectory using both the
 * historical EPS slope (last few annual reports + TTM) and the
 * forward EPS expectation (analyst consensus next year).
 *
 * Used to defend against the LULU pattern: the FV-trend signal can
 * register "improving" purely because peer-cohort multiples expanded,
 * even when the company's own earnings are flat or declining. We
 * gate "improving FV → Candidate" on this classifier confirming that
 * fundamentals are *also* improving.
 *
 * Munger inversion: only the unambiguous "improving" classification
 * counts as confirmation. Mixed signals (past growing but forward
 * flat, or vice versa) → "stable" (not confirmed). Unambiguous
 * decline → "declining" (treat as broken).
 */

export type FundamentalsDirection =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient_data";

export type ClassifyFundamentalsInput = {
  /** Trailing-12-month EPS, present-time. Prefer Yahoo TTM; fall
   * back to most-recent annual EPS at the call site. */
  trailingEps: number | null;
  /** Analyst-consensus next-fiscal-year EPS. Null when no coverage. */
  forwardEps: number | null;
  /** Annual EPS prior to TTM, newest first. Older periods only —
   * caller should NOT include the most-recent annual if it equals
   * TTM. Null entries are filtered out before slope computation. */
  pastAnnualEps: Array<number | null>;
  /** Symmetric "stable" tolerance, in percent. Default 5. */
  thresholdPct?: number;
};

/** Internal: linear-regression slope of `ys` against equally-spaced
 * `xs` (one unit per index step). Returns null when fewer than 2
 * usable points or the x-variance is zero. */
function linearSlope(ys: number[]): number | null {
  if (ys.length < 2) return null;
  const xs = ys.map((_, i) => i);
  const n = ys.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

type Direction = "improving" | "flat" | "declining" | "unknown";

/** Classify the past-trend direction by regressing oldest→newest
 * (past annuals reversed + trailing). Slope is normalized to %/yr
 * of the start value (start = oldest usable annual). */
function classifyPastTrend(
  trailingEps: number,
  pastAnnualEps: Array<number | null>,
  thresholdPct: number,
): Direction {
  // Filter out nulls; pastAnnualEps arrives newest-first → reverse to oldest-first.
  const cleanPast = pastAnnualEps.filter((v): v is number => typeof v === "number");
  if (cleanPast.length < 2) return "unknown";
  const ordered = [...cleanPast].reverse(); // oldest → newest
  ordered.push(trailingEps); // append present
  const slope = linearSlope(ordered);
  if (slope === null) return "unknown";
  const start = ordered[0]!;
  // Negative-start anchoring breaks % normalization. Use absolute
  // value for the denominator so a loss-to-loss-narrowing trend is
  // measured cleanly.
  const denom = Math.abs(start);
  if (denom < 0.01) return "unknown";
  const slopePct = (slope / denom) * 100;
  if (slopePct < -thresholdPct) return "declining";
  if (slopePct > thresholdPct) return "improving";
  return "flat";
}

/** Classify the recent-decay signal: TTM vs the PEAK of the recent
 * annuals. Catches the post-peak stall pattern (LULU 2026: peak
 * $14.64 → TTM $13.26, down 9.4% from peak — even though TTM equals
 * the just-released annual). Comparing to the most-recent annual
 * alone misses this when TTM ≈ FY-0 because the company just
 * filed; the peak is one year back. */
function classifyRecentDecay(
  trailingEps: number,
  recentAnnualEps: number[], // newest-first, already filtered non-null
  thresholdPct: number,
): Direction {
  if (recentAnnualEps.length === 0) return "unknown";
  // Use peak of the LAST 3 annuals as the comparator — captures the
  // most-recent earnings cycle high. (3 covers a typical 1-2 year
  // peak-to-trough cyclical move; longer windows would over-flag.)
  const window = recentAnnualEps.slice(0, 3);
  const peak = Math.max(...window);
  // Sign-change cases.
  if (peak <= 0 && trailingEps > 0) return "improving";
  if (peak > 0 && trailingEps <= 0) return "declining";
  if (peak <= 0 && trailingEps <= 0) {
    if (trailingEps > peak) return "improving";
    if (trailingEps < peak) return "declining";
    return "flat";
  }
  const pct = ((trailingEps - peak) / peak) * 100;
  if (pct < -thresholdPct) return "declining";
  if (pct > thresholdPct) return "improving";
  return "flat";
}

/** Classify the forward signal: forward EPS vs trailing. Negative-
 * crossing cases (loss → profit, profit → loss) are explicit. */
function classifyForwardSignal(
  trailingEps: number,
  forwardEps: number | null,
  thresholdPct: number,
): Direction {
  if (forwardEps === null) return "unknown";
  // Sign-change cases dominate the percentage math.
  if (trailingEps <= 0 && forwardEps > 0) return "improving";
  if (trailingEps > 0 && forwardEps <= 0) return "declining";
  if (trailingEps <= 0 && forwardEps <= 0) {
    // Loss-to-loss: improving = loss narrowing, declining = loss widening.
    if (forwardEps > trailingEps) return "improving";
    if (forwardEps < trailingEps) return "declining";
    return "flat";
  }
  // Both positive — standard percentage comparison.
  const pct = ((forwardEps - trailingEps) / trailingEps) * 100;
  if (pct < -thresholdPct) return "declining";
  if (pct > thresholdPct) return "improving";
  return "flat";
}

export function classifyFundamentalsDirection(
  input: ClassifyFundamentalsInput,
): FundamentalsDirection {
  const { trailingEps, forwardEps, pastAnnualEps } = input;
  const threshold = input.thresholdPct ?? 5;

  // Need at minimum: a present-time EPS reading + 2 historical points.
  if (trailingEps === null) return "insufficient_data";
  const cleanPast = pastAnnualEps.filter((v): v is number => typeof v === "number");
  if (cleanPast.length < 2) return "insufficient_data";

  const past = classifyPastTrend(trailingEps, pastAnnualEps, threshold);
  const forward = classifyForwardSignal(trailingEps, forwardEps, threshold);
  const recentDecay = classifyRecentDecay(trailingEps, cleanPast, threshold);

  // ---- Negative-EPS shortcuts (sign changes carry more weight) ----
  // A clear sign-change forward signal overrides past-trend ambiguity.
  if (trailingEps <= 0 && forwardEps !== null && forwardEps > 0) {
    return "improving";
  }
  if (trailingEps > 0 && forwardEps !== null && forwardEps <= 0) {
    return "declining";
  }
  if (trailingEps <= 0 && forwardEps !== null && forwardEps <= 0) {
    return "declining";
  }

  // ---- Standard combination rules ----
  // Munger discipline: only confirm "improving" when both past trend
  // and forward signal point that way.
  if (past === "improving" && forward === "improving") return "improving";

  // Forward "declining" (analyst-consensus cut) is a strong present-
  // time signal — overrides historical strength.
  if (forward === "declining") return "declining";

  // Recent-decay "declining" (TTM materially below most-recent annual)
  // catches the LULU pattern: forward-vs-TTM reads flat but TTM has
  // already rolled over from peak. Treat as declining unless forward
  // gives clear evidence of recovery.
  if (recentDecay === "declining" && forward !== "improving") return "declining";

  // Past "declining" alone is enough to classify as declining unless
  // forward signal pushes back with an "improving" reading.
  if (past === "declining" && forward !== "improving") return "declining";

  // Everything else — mixed, flat, or unknown forward — is "stable."
  return "stable";
}
