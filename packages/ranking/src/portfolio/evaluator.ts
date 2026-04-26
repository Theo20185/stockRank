/**
 * Portfolio v1 — evaluate each held position against the current
 * snapshot. Surfaces realized P&L, current bucket assignment, and
 * sell signals.
 *
 * Pure function — caller supplies the portfolio and the live ranked
 * snapshot. v2 adds editing UI; v3 may add tax-aware cost-basis and
 * options-leg tracking.
 */

import type { Portfolio, Position } from "@stockrank/core";
import { bucketRows, type BucketKey } from "../buckets.js";
import type { RankedRow, RankedSnapshot } from "../types.js";

export type SellSignal =
  /**
   * Composite dropped into the Avoid bucket — engine wants you out.
   * Highest-confidence signal per Phase 4A long/short evidence.
   */
  | "in-avoid-bucket"
  /**
   * Price reached or exceeded the FV-median anchor — the value
   * thesis has played out at the central estimate.
   */
  | "price-at-or-above-fv-median"
  /**
   * Price reached or exceeded the FV-p75 anchor — fully priced;
   * higher-conviction sell.
   */
  | "price-at-or-above-fv-p75"
  /**
   * Composite dropped below the universe median — the position
   * isn't a top idea anymore even if it hasn't hit Avoid yet.
   */
  | "composite-below-universe-median";

export type PositionEvaluation = {
  position: Position;
  /** True iff the symbol was found in the current snapshot. */
  inSnapshot: boolean;
  /** Live row from the snapshot (null when symbol is missing). */
  row: RankedRow | null;
  /** Bucket the row currently lands in. */
  currentBucket: BucketKey | null;
  /** Current price per share from the snapshot. */
  currentPrice: number | null;
  /** Realized P&L per share = current - entry. */
  pnlPerShare: number | null;
  /** Realized P&L as a percentage of entry price. */
  pnlPct: number | null;
  /** Total realized $ P&L = pnlPerShare × sharesOwned. */
  pnlDollars: number | null;
  /** Sell signals currently firing — empty array when nothing fires. */
  sellSignals: SellSignal[];
};

export type PortfolioEvaluation = {
  generatedAt: string;
  /** Timestamp of the source portfolio file. */
  portfolioUpdatedAt: string;
  /** Per-position evaluation rows in the same order as portfolio.positions. */
  positions: PositionEvaluation[];
  /** Summary stats. */
  summary: {
    totalPositions: number;
    positionsInSnapshot: number;
    positionsInAvoid: number;
    positionsWithSellSignal: number;
    /** Aggregate realized P&L across all positions found in snapshot. */
    aggregatePnlDollars: number;
  };
};

export function evaluatePortfolio(
  portfolio: Portfolio,
  snapshot: RankedSnapshot,
): PortfolioEvaluation {
  // Build a lookup so we can find each position's row in O(1).
  const allRows: RankedRow[] = [...snapshot.rows, ...snapshot.ineligibleRows];
  const rowsBySymbol = new Map(allRows.map((r) => [r.symbol, r]));
  const buckets = bucketRows(snapshot.rows);
  // Map symbol → bucket key (only eligible rows; ineligible rows
  // implicitly land in `excluded` per snapshot.ineligibleRows).
  const bucketBySymbol = new Map<string, BucketKey>();
  for (const k of Object.keys(buckets) as BucketKey[]) {
    for (const row of buckets[k]) bucketBySymbol.set(row.symbol, k);
  }
  for (const row of snapshot.ineligibleRows) {
    bucketBySymbol.set(row.symbol, "excluded");
  }
  // Universe median composite — used for the
  // composite-below-universe-median sell signal.
  const eligibleComposites = snapshot.rows
    .filter((r) => r.composite > 0)
    .map((r) => r.composite)
    .sort((a, b) => a - b);
  const universeMedian =
    eligibleComposites.length > 0
      ? eligibleComposites[Math.floor(eligibleComposites.length / 2)]!
      : 0;

  let aggregatePnl = 0;
  let positionsInAvoid = 0;
  let positionsWithSellSignal = 0;
  let positionsInSnapshot = 0;

  const positions: PositionEvaluation[] = portfolio.positions.map(
    (position) => {
      const row = rowsBySymbol.get(position.symbol) ?? null;
      const currentBucket = bucketBySymbol.get(position.symbol) ?? null;
      const currentPrice = row?.price ?? null;
      const pnlPerShare =
        currentPrice !== null ? currentPrice - position.entryPrice : null;
      const pnlPct =
        pnlPerShare !== null && position.entryPrice > 0
          ? (pnlPerShare / position.entryPrice) * 100
          : null;
      const pnlDollars =
        pnlPerShare !== null ? pnlPerShare * position.sharesOwned : null;

      const signals: SellSignal[] = [];
      if (currentBucket === "avoid") {
        signals.push("in-avoid-bucket");
      }
      if (row?.fairValue?.range && currentPrice !== null) {
        if (currentPrice >= row.fairValue.range.p75) {
          signals.push("price-at-or-above-fv-p75");
        } else if (currentPrice >= row.fairValue.range.median) {
          signals.push("price-at-or-above-fv-median");
        }
      }
      if (
        row !== null &&
        row.composite > 0 &&
        universeMedian > 0 &&
        row.composite < universeMedian &&
        currentBucket !== "avoid" // avoid signal already fires above
      ) {
        signals.push("composite-below-universe-median");
      }

      if (row !== null) positionsInSnapshot += 1;
      if (currentBucket === "avoid") positionsInAvoid += 1;
      if (signals.length > 0) positionsWithSellSignal += 1;
      if (pnlDollars !== null) aggregatePnl += pnlDollars;

      return {
        position,
        inSnapshot: row !== null,
        row,
        currentBucket,
        currentPrice,
        pnlPerShare,
        pnlPct,
        pnlDollars,
        sellSignals: signals,
      };
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    portfolioUpdatedAt: portfolio.updatedAt,
    positions,
    summary: {
      totalPositions: portfolio.positions.length,
      positionsInSnapshot,
      positionsInAvoid,
      positionsWithSellSignal,
      aggregatePnlDollars: aggregatePnl,
    },
  };
}

export const SELL_SIGNAL_LABELS: Record<SellSignal, string> = {
  "in-avoid-bucket":
    "Composite dropped to Avoid bucket — engine's strongest exit signal",
  "price-at-or-above-fv-median":
    "Price reached the FV-median anchor — value thesis played out at the central estimate",
  "price-at-or-above-fv-p75":
    "Price exceeded the FV-p75 anchor — fully priced; high-conviction exit",
  "composite-below-universe-median":
    "Composite below universe median — no longer a top idea",
};
