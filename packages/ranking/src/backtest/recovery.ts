/**
 * Pure helpers for the "undervalued recovery" back-test.
 *
 * Methodology question:
 *   When the engine flags a ticker as undervalued (price < fvP25) at
 *   some past date, what happens over the next ~2 years? Did the
 *   price recover to the conservative-FV target? If not, what was
 *   the failure mode (lost money, stayed flat, partial gain)?
 */

export type PriceBar = {
  date: string;
  high: number;
  low: number;
  close: number;
};

export type DidRecoverInput = {
  entryPrice: number;
  /** Conservative fair-value target captured at the entry date (does
   * not move — we're asking whether the stock ever reached the
   * specific FV the engine projected on entry). */
  targetPrice: number;
  /** Price bars covering the post-entry holding window, sorted
   * ascending by date. The function looks at `bar.high` so intraday
   * spikes count as recovery — the user could have sold at the high. */
  forwardBars: PriceBar[];
};

export type DidRecoverResult = {
  recovered: boolean;
  /** First bar-date whose high reached the target. Null when never. */
  recoveryDate: string | null;
  /** Maximum bar.high across the entire forward window (for capital-
   * gains stats — the realizable peak). 0 when window is empty. */
  peakHigh: number;
};

export function didRecover(input: DidRecoverInput): DidRecoverResult {
  const { targetPrice, forwardBars } = input;
  let recoveryDate: string | null = null;
  let peakHigh = 0;
  for (const b of forwardBars) {
    if (b.high > peakHigh) peakHigh = b.high;
    if (recoveryDate === null && b.high >= targetPrice) {
      recoveryDate = b.date;
    }
  }
  return {
    recovered: recoveryDate !== null,
    recoveryDate,
    peakHigh,
  };
}

export type NonRecoveryClass = "lost" | "stable" | "partial-gain";

export type ClassifyNonRecoveryInput = {
  entryPrice: number;
  /** Final-price (last close) at end of holding window. */
  finalPrice: number;
  /** Symmetric tolerance around 0% defining "stable." Default 5%. */
  stableTolerancePct?: number;
};

export function classifyNonRecovery(
  input: ClassifyNonRecoveryInput,
): NonRecoveryClass {
  const tol = input.stableTolerancePct ?? 5;
  if (input.entryPrice <= 0) return "stable";
  const pct = ((input.finalPrice - input.entryPrice) / input.entryPrice) * 100;
  if (pct < -tol) return "lost";
  if (pct <= tol) return "stable";
  return "partial-gain";
}

export type FvDirectionResult = "declining" | "flat" | "improving";

export type FvDirectionInput = {
  fvAtEntry: number | null;
  fvAtExit: number | null;
  /** Symmetric tolerance for "flat" classification. Default 5%. */
  thresholdPct?: number;
};

export function fvDirection(input: FvDirectionInput): FvDirectionResult {
  const tol = input.thresholdPct ?? 5;
  // Without a baseline we can't say anything — call it flat (no signal).
  if (input.fvAtEntry === null || input.fvAtEntry <= 0) return "flat";
  // Exit FV missing or zero — engine couldn't compute → treat as collapse.
  if (input.fvAtExit === null || input.fvAtExit <= 0) return "declining";
  const pct = ((input.fvAtExit - input.fvAtEntry) / input.fvAtEntry) * 100;
  if (pct < -tol) return "declining";
  if (pct <= tol) return "flat";
  return "improving";
}
