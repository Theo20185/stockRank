/**
 * Phase 4C — H10 FV-trend demotion validation.
 *
 * The production rule (from `ranking.md` FV-trend section): names
 * with a declining 2-year FV-median slope are demoted from
 * Candidates → Watch. The original calibration came from the
 * fair-value miss-analysis (~96% of miss-p25 events coincide with
 * declining FV) but the rule itself was never validated against
 * forward returns.
 *
 * This module:
 *   1. For each (snapshot date, company) reconstructs FV.
 *   2. Maintains per-symbol FV history across the backtest dates.
 *   3. At each date, computes trailing slope of fvMedian (last
 *      ~2 years of dated samples).
 *   4. Classifies each (symbol, date) as declining/stable/improving
 *      using the same threshold as production (5%/yr).
 *   5. Stratifies forward excess returns by classification and
 *      returns the verdict.
 *
 * Pure function — caller supplies the universe data; module computes
 * the FV-trend audit.
 */

import type { CompanySnapshot } from "@stockrank/core";
import { bootstrapMeanCi, mulberry32 } from "../../stats.js";
import { fairValueFor } from "../../fair-value/index.js";

const SLOPE_THRESHOLD_PCT = 5;
const TREND_WINDOW_YEARS = 2;
const MIN_SAMPLES = 4;

export type FvTrendClass = "declining" | "stable" | "improving" | "insufficient_data";

export type FvTrendAuditInput = {
  snapshotsByDate: ReadonlyMap<string, CompanySnapshot[]>;
  forwardReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  spyReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  horizons: readonly number[];
  bootstrapResamples?: number;
  seed?: number;
};

export type FvTrendStratumRow = {
  trend: FvTrendClass;
  horizon: number;
  nObservations: number;
  meanForwardExcess: number | null;
  excessCi95: { lo: number; hi: number } | null;
};

export type FvTrendAuditReport = {
  generatedAt: string;
  snapshotRange: { start: string; end: string };
  /** Per-trend × per-horizon excess return rows. */
  rows: FvTrendStratumRow[];
  /** Verdict on H10: do declining-trend names underperform peers? */
  verdict: {
    hypothesis: string;
    verdict: "pass" | "fail" | "inconclusive";
    evidence: string;
  };
  /** Sample classification breakdown — how many (symbol, date)
   * observations landed in each trend bucket per horizon. */
  classificationCounts: Record<FvTrendClass, number>;
};

export function runFvTrendAudit(input: FvTrendAuditInput): FvTrendAuditReport {
  const {
    snapshotsByDate,
    forwardReturnsByDate,
    spyReturnsByDate,
    horizons,
    bootstrapResamples = 1000,
    seed = 1,
  } = input;

  // Walk dates chronologically and build per-symbol FV history.
  const sortedDates = [...snapshotsByDate.keys()].sort();
  // Map: symbol → array of (date, fvMedian) samples in chronological
  // order. fvMedian can be null when fairValueFor fails to compute a
  // range (e.g., insufficient peers or model-incompatible industry).
  const fvHistoryBySymbol = new Map<
    string,
    Array<{ date: string; fvMedian: number | null }>
  >();

  for (const date of sortedDates) {
    const universe = snapshotsByDate.get(date) ?? [];
    for (const c of universe) {
      let fvMedian: number | null = null;
      try {
        const fv = fairValueFor(c, universe);
        fvMedian = fv.range?.median ?? null;
      } catch {
        // fairValueFor can throw on degenerate cohorts — treat as null.
      }
      const arr = fvHistoryBySymbol.get(c.symbol) ?? [];
      arr.push({ date, fvMedian });
      fvHistoryBySymbol.set(c.symbol, arr);
    }
  }

  // Now classify each (symbol, date) based on trailing 2-year slope.
  // Map: `${symbol}|${date}` → trend.
  const classifications = new Map<string, FvTrendClass>();
  for (const [symbol, samples] of fvHistoryBySymbol) {
    for (let i = 0; i < samples.length; i += 1) {
      const cur = samples[i]!;
      // Window: samples within (cur.date - TREND_WINDOW_YEARS, cur.date]
      const windowStart = subYearsIso(cur.date, TREND_WINDOW_YEARS);
      const windowSamples = samples
        .slice(0, i + 1)
        .filter((s) => s.date > windowStart && s.fvMedian !== null) as Array<{
        date: string;
        fvMedian: number;
      }>;
      const cls = classifyFromWindow(windowSamples);
      classifications.set(`${symbol}|${cur.date}`, cls);
    }
  }

  // Stratify forward excess returns by classification.
  const excessByStratum = new Map<string, number[]>();
  for (const [date, universe] of snapshotsByDate) {
    const fwdAtDate = forwardReturnsByDate.get(date);
    const spyAtDate = spyReturnsByDate.get(date);
    if (!fwdAtDate || !spyAtDate) continue;
    for (const c of universe) {
      const cls = classifications.get(`${c.symbol}|${date}`) ?? "insufficient_data";
      for (const horizon of horizons) {
        const fwd = fwdAtDate.get(`${c.symbol}|${horizon}`);
        const spy = spyAtDate.get(String(horizon));
        if (fwd === undefined || spy === undefined) continue;
        const key = `${cls}|${horizon}`;
        const arr = excessByStratum.get(key) ?? [];
        arr.push(fwd - spy);
        excessByStratum.set(key, arr);
      }
    }
  }

  const allTrends: FvTrendClass[] = [
    "declining",
    "stable",
    "improving",
    "insufficient_data",
  ];
  const rows: FvTrendStratumRow[] = [];
  let rngOffset = 0;
  for (const horizon of horizons) {
    for (const trend of allTrends) {
      const arr = excessByStratum.get(`${trend}|${horizon}`) ?? [];
      const mean =
        arr.length === 0
          ? null
          : arr.reduce((a, b) => a + b, 0) / arr.length;
      const ci =
        arr.length >= 5
          ? bootstrapMeanCi(arr, bootstrapResamples, 0.05, mulberry32(seed + rngOffset))
          : null;
      rngOffset += 1;
      rows.push({
        trend,
        horizon,
        nObservations: arr.length,
        meanForwardExcess: mean,
        excessCi95: ci,
      });
    }
  }

  // Classification counts (per trend, summed over horizons —
  // approximate, since each (symbol, date) appears once per horizon).
  const classificationCounts: Record<FvTrendClass, number> = {
    declining: 0,
    stable: 0,
    improving: 0,
    insufficient_data: 0,
  };
  for (const cls of classifications.values()) {
    classificationCounts[cls] += 1;
  }

  // H10 verdict — at the 3y horizon, does declining underperform
  // stable+improving by a meaningful margin?
  const declining3y = rows.find((r) => r.trend === "declining" && r.horizon === 3);
  const stable3y = rows.find((r) => r.trend === "stable" && r.horizon === 3);
  const improving3y = rows.find((r) => r.trend === "improving" && r.horizon === 3);
  let v: "pass" | "fail" | "inconclusive" = "inconclusive";
  let evidence = "missing 3y data on one or more strata";
  if (
    declining3y?.meanForwardExcess !== null &&
    declining3y?.meanForwardExcess !== undefined &&
    stable3y?.meanForwardExcess !== null &&
    stable3y?.meanForwardExcess !== undefined &&
    declining3y.nObservations >= 30 &&
    stable3y.nObservations >= 30
  ) {
    // Reference cohort is stable + improving combined (the names
    // production keeps in Candidates).
    const stableImpExcess: number[] = [];
    const stableArr = excessByStratum.get(`stable|3`) ?? [];
    const impArr = excessByStratum.get(`improving|3`) ?? [];
    stableImpExcess.push(...stableArr, ...impArr);
    const stableImpMean =
      stableImpExcess.length === 0
        ? null
        : stableImpExcess.reduce((a, b) => a + b, 0) / stableImpExcess.length;
    if (stableImpMean !== null) {
      const gap = declining3y.meanForwardExcess - stableImpMean;
      const meaningful = 0.02; // 2pp absolute gap
      if (gap < -meaningful) {
        v = "pass";
        evidence = `declining cohort 3y excess ${(declining3y.meanForwardExcess * 100).toFixed(2)}% vs stable+improving ${(stableImpMean * 100).toFixed(2)}% — gap ${(gap * 100).toFixed(2)} pp (declining UNDERPERFORMS, demotion justified)`;
      } else if (gap > meaningful) {
        v = "fail";
        evidence = `declining cohort 3y excess ${(declining3y.meanForwardExcess * 100).toFixed(2)}% vs stable+improving ${(stableImpMean * 100).toFixed(2)}% — gap +${(gap * 100).toFixed(2)} pp (declining OUTPERFORMED, demotion harmful)`;
      } else {
        v = "inconclusive";
        evidence = `declining vs stable+improving within ${(meaningful * 100).toFixed(0)} pp — no clear edge`;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    snapshotRange: {
      start: sortedDates[0] ?? "",
      end: sortedDates[sortedDates.length - 1] ?? "",
    },
    rows,
    verdict: {
      hypothesis:
        "Names with declining FV-trend at T underperform stable+improving cohort on 3y forward excess return (validates the §FV-trend demotion-to-Watch rule)",
      verdict: v,
      evidence,
    },
    classificationCounts,
  };
}

/**
 * Classify a window of (date, fvMedian) samples by linear-regression
 * slope, expressed as percent-of-window-start per year. Mirrors the
 * production fv-trend computation in scripts/compute-fv-trend.ts.
 */
function classifyFromWindow(
  samples: ReadonlyArray<{ date: string; fvMedian: number }>,
): FvTrendClass {
  if (samples.length < MIN_SAMPLES) return "insufficient_data";
  const startMs = Date.parse(`${samples[0]!.date}T00:00:00Z`);
  const xsYears = samples.map(
    (s) => (Date.parse(`${s.date}T00:00:00Z`) - startMs) / (365.25 * 24 * 3600 * 1000),
  );
  const ys = samples.map((s) => s.fvMedian);
  const slope = linearSlope(xsYears, ys);
  if (slope === null) return "insufficient_data";
  const startMedian = samples[0]!.fvMedian;
  if (startMedian <= 0) return "insufficient_data";
  const slopePct = (slope / startMedian) * 100;
  if (slopePct < -SLOPE_THRESHOLD_PCT) return "declining";
  if (slopePct > SLOPE_THRESHOLD_PCT) return "improving";
  return "stable";
}

function linearSlope(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

function subYearsIso(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}
