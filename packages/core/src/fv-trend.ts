/**
 * Fair-value trend signal: tracks the slope of each ranked symbol's
 * historical fair-value-median over a recent window. When a name's FV
 * has been declining materially, the bucket classifier demotes it to
 * Watch — per the back-test miss-analysis finding that ~96% of
 * miss-p25 events coincide with a declining FV trajectory.
 *
 * Computed by `scripts/compute-fv-trend.ts` from the back-test's
 * per-symbol CSVs and persisted at `public/data/fv-trend.json`.
 *
 * Methodology lives in the script's docstring; this file is the wire
 * format only.
 */

export type FvTrend = "declining" | "stable" | "improving" | "insufficient_data";

export type FvTrendEntry = {
  trend: FvTrend;
  /** Linear-regression slope of fvMedian vs time, expressed as percent
   * of the window's starting fvMedian per year. Null when the window
   * had too few samples. */
  slopePctPerYear: number | null;
  fvMedianStart: number | null;
  fvMedianEnd: number | null;
  /** (end - start) / start × 100 — full-window cumulative change. */
  totalChangePct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  samples: number;
};

export type FvTrendArtifact = {
  generatedAt: string;
  windowYears: number;
  slopeThresholdPctPerYear: number;
  symbols: Record<string, FvTrendEntry>;
};
