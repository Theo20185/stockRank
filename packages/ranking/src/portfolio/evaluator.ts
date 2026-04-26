/**
 * Portfolio v2 evaluator — handles stock, option, and cash positions.
 *
 * Pure function: caller supplies the portfolio and a live ranked
 * snapshot (used for stock prices + bucket assignment + FV anchors).
 *
 * Per-type evaluations:
 *   - Stock  → mark-to-market P&L, bucket assignment, sell signals
 *   - Option → intrinsic value at current price, P&L-at-expiry
 *              scenarios (current / called / assigned), annualized
 *              yield-on-collateral for shorts, paired-stock awareness
 *   - Cash   → simple-interest accrual from entryDate to snapshot date
 *
 * Pairing: an OptionPosition with `pairedStockId` set is treated as
 * one leg of a covered position (covered call, cash-secured put with
 * collateral, buy-write). The stock side keeps its own evaluation;
 * the option side gains a `pairedStock` reference and a combined
 * yield-at-expiry calc.
 *
 * v2 does NOT fetch live option chain data — option market value
 * uses intrinsic-only (no time premium). For short positions held to
 * expiry that's the relevant figure; for early-close decisions the
 * user needs to consult their broker.
 */

import type {
  CashPosition,
  OptionPosition,
  Portfolio,
  Position,
  StockPosition,
} from "@stockrank/core";
import {
  isCashPosition,
  isOptionPosition,
  isStockPosition,
} from "@stockrank/core";
import { bucketRows, type BucketKey } from "../buckets.js";
import type { RankedRow, RankedSnapshot } from "../types.js";

export type SellSignal =
  | "in-avoid-bucket"
  | "price-at-or-above-fv-median"
  | "price-at-or-above-fv-p75"
  | "composite-below-universe-median";

export type StockEvaluation = {
  kind: "stock";
  position: StockPosition;
  inSnapshot: boolean;
  row: RankedRow | null;
  currentBucket: BucketKey | null;
  currentPrice: number | null;
  /** sharesOwned × currentPrice (null when not in snapshot). */
  marketValue: number | null;
  /** marketValue − costBasis (null when not in snapshot). */
  unrealizedPnlDollars: number | null;
  /** unrealizedPnl / costBasis × 100 (null when costBasis is 0). */
  unrealizedPnlPct: number | null;
  sellSignals: SellSignal[];
};

/** Result of evaluating an option position at a single milestone date. */
export type OptionMilestone = {
  /** Stock-price scenario (current spot, or strike, or 0). */
  scenario: "current-price" | "called-away" | "assigned" | "expires-otm";
  /** Hypothetical stock price at this milestone. */
  hypotheticalPrice: number | null;
  /**
   * Net P&L of the OPTION leg only, in dollars (signed: positive =
   * gain, negative = loss). Excludes the underlying stock leg even
   * for paired positions; the stock side has its own evaluation.
   */
  optionPnl: number;
  /**
   * Combined P&L if a paired stock exists (paired stock realized P&L
   * at the scenario price + option P&L). Null for unpaired options.
   */
  combinedPnl: number | null;
};

export type OptionEvaluation = {
  kind: "option";
  position: OptionPosition;
  /** Underlying price from the snapshot (null when not in snapshot). */
  underlyingPrice: number | null;
  /** Days from snapshot date to expiration. Negative when expired. */
  daysToExpiration: number;
  isExpired: boolean;
  /** Net cash at entry — long: -premium (paid); short: +premium (received). */
  cashAtEntry: number;
  /**
   * Intrinsic value per share at the current spot. Multiply by
   * 100 × |contracts| for total intrinsic dollar value of the position.
   */
  intrinsicPerShare: number | null;
  /**
   * Total intrinsic dollar value (intrinsicPerShare × 100 × |contracts|).
   * For shorts this is the dollar AMOUNT the user would pay to close
   * (cost to buy back). For longs it's the dollar amount the position
   * is worth.
   */
  intrinsicDollars: number | null;
  /**
   * Annualized yield on premium, computed for short options where the
   * "capital tied up" is unambiguous:
   *   - Covered call (paired short call): premium / pairedStock.costBasis
   *     × 365 / DTE
   *   - Cash-secured put (unpaired short put): premium / (strike × 100
   *     × |contracts|) × 365 / DTE
   * Null for long options (no collateral concept) and for shorts past
   * expiration.
   */
  annualizedPremiumYield: number | null;
  /** True when the option references a paired stock position by id. */
  paired: boolean;
  pairedStock: StockPosition | null;
  /** Milestone scenarios for end-of-expiry decision-making. */
  milestones: OptionMilestone[];
};

export type CashEvaluation = {
  kind: "cash";
  position: CashPosition;
  /** Days from entryDate to snapshot date (clamped at 0). */
  daysHeld: number;
  /** Simple interest: amount × yield% / 100 × daysHeld / 365. */
  accruedInterest: number;
  /** amount + accruedInterest. */
  currentValue: number;
};

export type PositionEvaluation =
  | StockEvaluation
  | OptionEvaluation
  | CashEvaluation;

export type PortfolioSummary = {
  totalPositions: number;
  stockPositions: number;
  optionPositions: number;
  cashPositions: number;
  /** Stock positions whose symbol is in the snapshot. */
  stocksInSnapshot: number;
  /** Stock positions that landed in the Avoid bucket. */
  positionsInAvoid: number;
  /** Stock positions with at least one sell signal firing. */
  positionsWithSellSignal: number;
  /**
   * Total market value across all positions:
   *   - stocks: marketValue (when in snapshot, else costBasis fallback)
   *   - options: signed intrinsic value (long → +intrinsic, short → -intrinsic to close)
   *   - cash: currentValue (amount + accrued interest)
   */
  totalMarketValue: number;
  /** Sum of stock unrealized P&L (excludes options + cash interest). */
  aggregateStockPnlDollars: number;
  /** Sum of cash positions' accrued interest. */
  aggregateAccruedInterest: number;
};

export type PortfolioEvaluation = {
  generatedAt: string;
  portfolioUpdatedAt: string;
  positions: PositionEvaluation[];
  summary: PortfolioSummary;
};

const MS_PER_DAY = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

/* ─── Stock evaluation ─────────────────────────────────────────── */

function evaluateStock(
  position: StockPosition,
  snapshot: RankedSnapshot,
  bucketBySymbol: Map<string, BucketKey>,
  rowsBySymbol: Map<string, RankedRow>,
  universeMedian: number,
): StockEvaluation {
  const row = rowsBySymbol.get(position.symbol) ?? null;
  const currentBucket = bucketBySymbol.get(position.symbol) ?? null;
  const currentPrice = row?.price ?? null;
  const marketValue =
    currentPrice !== null ? currentPrice * position.shares : null;
  const unrealizedPnlDollars =
    marketValue !== null ? marketValue - position.costBasis : null;
  const unrealizedPnlPct =
    unrealizedPnlDollars !== null && position.costBasis > 0
      ? (unrealizedPnlDollars / position.costBasis) * 100
      : null;

  const signals: SellSignal[] = [];
  if (currentBucket === "avoid") signals.push("in-avoid-bucket");
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
    currentBucket !== "avoid"
  ) {
    signals.push("composite-below-universe-median");
  }

  return {
    kind: "stock",
    position,
    inSnapshot: row !== null,
    row,
    currentBucket,
    currentPrice,
    marketValue,
    unrealizedPnlDollars,
    unrealizedPnlPct,
    sellSignals: signals,
  };
}

/* ─── Option evaluation ────────────────────────────────────────── */

/** Per-share intrinsic value of an option at a given spot price. */
function intrinsicPerShare(
  optionType: OptionPosition["optionType"],
  strike: number,
  spot: number,
): number {
  if (optionType === "call") return Math.max(0, spot - strike);
  return Math.max(0, strike - spot);
}

/**
 * Option leg P&L (signed dollars) at a hypothetical stock price.
 *
 *   long  call: intrinsic × 100 × contracts − premium
 *   short call: premium − intrinsic × 100 × |contracts|
 *   long  put:  intrinsic × 100 × contracts − premium
 *   short put:  premium − intrinsic × 100 × |contracts|
 */
function optionLegPnlAtPrice(opt: OptionPosition, spot: number): number {
  const intrinsic = intrinsicPerShare(opt.optionType, opt.strike, spot);
  const totalIntrinsic = intrinsic * 100 * Math.abs(opt.contracts);
  const isLong = opt.contracts > 0;
  return isLong ? totalIntrinsic - opt.premium : opt.premium - totalIntrinsic;
}

/** Stock-leg realized P&L if the stock is sold at scenarioPrice. */
function stockLegPnl(stock: StockPosition, scenarioPrice: number): number {
  return scenarioPrice * stock.shares - stock.costBasis;
}

function buildMilestones(
  opt: OptionPosition,
  underlyingPrice: number | null,
  pairedStock: StockPosition | null,
): OptionMilestone[] {
  const out: OptionMilestone[] = [];

  // Scenario 1: stock stays at current spot.
  if (underlyingPrice !== null) {
    const optionPnl = optionLegPnlAtPrice(opt, underlyingPrice);
    const combinedPnl = pairedStock
      ? optionPnl + stockLegPnl(pairedStock, underlyingPrice)
      : null;
    out.push({
      scenario: "current-price",
      hypotheticalPrice: underlyingPrice,
      optionPnl,
      combinedPnl,
    });
  }

  // Scenario 2: assigned / called away at strike.
  if (opt.contracts < 0) {
    // Short option — at-strike scenario is the boundary case where the
    // option expires ATM. Useful as a reference point even when the
    // current price isn't there yet.
    const isShortCall = opt.optionType === "call";
    const optionPnl = optionLegPnlAtPrice(opt, opt.strike);
    let combinedPnl: number | null = null;
    if (pairedStock && isShortCall) {
      // Covered call: stock called away at strike.
      combinedPnl = optionPnl + stockLegPnl(pairedStock, opt.strike);
    }
    out.push({
      scenario: isShortCall ? "called-away" : "assigned",
      hypotheticalPrice: opt.strike,
      optionPnl,
      combinedPnl,
    });
  }

  // Scenario 3: option expires worthless (OTM).
  // For shorts → keep premium; for longs → lose premium.
  // Hypothetical price for OTM:
  //   long/short call: any price ≤ strike → 0 intrinsic; use strike − 1
  //   long/short put:  any price ≥ strike → 0 intrinsic; use strike + 1
  if (opt.contracts !== 0) {
    const otmPrice = opt.optionType === "call" ? Math.max(0, opt.strike - 1) : opt.strike + 1;
    const optionPnl = optionLegPnlAtPrice(opt, otmPrice);
    const combinedPnl = pairedStock
      ? optionPnl + stockLegPnl(pairedStock, otmPrice)
      : null;
    out.push({
      scenario: "expires-otm",
      hypotheticalPrice: otmPrice,
      optionPnl,
      combinedPnl,
    });
  }

  return out;
}

function annualizedPremiumYield(
  opt: OptionPosition,
  pairedStock: StockPosition | null,
  daysToExpiration: number,
): number | null {
  if (opt.contracts >= 0) return null; // longs have no collateral concept
  if (daysToExpiration <= 0) return null; // expired
  let collateral: number;
  if (opt.optionType === "call") {
    if (!pairedStock) return null; // naked call — no defined collateral here
    collateral = pairedStock.costBasis;
  } else {
    // Cash-secured put — collateral = strike × 100 × contracts
    collateral = opt.strike * 100 * Math.abs(opt.contracts);
  }
  if (collateral <= 0) return null;
  return (opt.premium / collateral) * (365 / daysToExpiration) * 100;
}

function evaluateOption(
  position: OptionPosition,
  snapshot: RankedSnapshot,
  rowsBySymbol: Map<string, RankedRow>,
  stockById: Map<string, StockPosition>,
): OptionEvaluation {
  const underlyingPrice = rowsBySymbol.get(position.symbol)?.price ?? null;
  const daysToExpiration = daysBetween(snapshot.snapshotDate, position.expiration);
  const isExpired = daysToExpiration < 0;
  const cashAtEntry = position.contracts > 0 ? -position.premium : position.premium;
  const intrinsicPS =
    underlyingPrice !== null
      ? intrinsicPerShare(position.optionType, position.strike, underlyingPrice)
      : null;
  const intrinsicDollars =
    intrinsicPS !== null
      ? intrinsicPS * 100 * Math.abs(position.contracts)
      : null;
  const pairedStock = position.pairedStockId
    ? stockById.get(position.pairedStockId) ?? null
    : null;
  const yieldPct = annualizedPremiumYield(position, pairedStock, daysToExpiration);
  const milestones = buildMilestones(position, underlyingPrice, pairedStock);

  return {
    kind: "option",
    position,
    underlyingPrice,
    daysToExpiration,
    isExpired,
    cashAtEntry,
    intrinsicPerShare: intrinsicPS,
    intrinsicDollars,
    annualizedPremiumYield: yieldPct,
    paired: pairedStock !== null,
    pairedStock,
    milestones,
  };
}

/* ─── Cash evaluation ──────────────────────────────────────────── */

function evaluateCash(
  position: CashPosition,
  snapshot: RankedSnapshot,
): CashEvaluation {
  const daysHeld = Math.max(0, daysBetween(position.entryDate, snapshot.snapshotDate));
  const accruedInterest =
    (position.amount * (position.yieldPct / 100) * daysHeld) / 365;
  return {
    kind: "cash",
    position,
    daysHeld,
    accruedInterest,
    currentValue: position.amount + accruedInterest,
  };
}

/* ─── Top-level orchestration ──────────────────────────────────── */

export function evaluatePortfolio(
  portfolio: Portfolio,
  snapshot: RankedSnapshot,
): PortfolioEvaluation {
  const allRows: RankedRow[] = [...snapshot.rows, ...snapshot.ineligibleRows];
  const rowsBySymbol = new Map(allRows.map((r) => [r.symbol, r]));

  const buckets = bucketRows(snapshot.rows);
  const bucketBySymbol = new Map<string, BucketKey>();
  for (const k of Object.keys(buckets) as BucketKey[]) {
    for (const row of buckets[k]) bucketBySymbol.set(row.symbol, k);
  }
  for (const row of snapshot.ineligibleRows) {
    bucketBySymbol.set(row.symbol, "avoid");
  }

  const eligibleComposites = snapshot.rows
    .filter((r) => r.composite > 0)
    .map((r) => r.composite)
    .sort((a, b) => a - b);
  const universeMedian =
    eligibleComposites.length > 0
      ? eligibleComposites[Math.floor(eligibleComposites.length / 2)]!
      : 0;

  // Build a lookup for stocks (used to resolve option pairings).
  const stockById = new Map<string, StockPosition>();
  for (const p of portfolio.positions) {
    if (isStockPosition(p)) stockById.set(p.id, p);
  }

  const positions: PositionEvaluation[] = portfolio.positions.map((p): PositionEvaluation => {
    if (isStockPosition(p)) {
      return evaluateStock(p, snapshot, bucketBySymbol, rowsBySymbol, universeMedian);
    }
    if (isOptionPosition(p)) {
      return evaluateOption(p, snapshot, rowsBySymbol, stockById);
    }
    if (isCashPosition(p)) {
      return evaluateCash(p, snapshot);
    }
    // Exhaustive — discriminated union should make this unreachable.
    throw new Error(`Unknown position kind: ${(p as Position).kind}`);
  });

  // Build summary.
  let stockPositions = 0;
  let optionPositions = 0;
  let cashPositions = 0;
  let stocksInSnapshot = 0;
  let positionsInAvoid = 0;
  let positionsWithSellSignal = 0;
  let totalMarketValue = 0;
  let aggregateStockPnlDollars = 0;
  let aggregateAccruedInterest = 0;

  for (const e of positions) {
    if (e.kind === "stock") {
      stockPositions += 1;
      if (e.inSnapshot) stocksInSnapshot += 1;
      if (e.currentBucket === "avoid") positionsInAvoid += 1;
      if (e.sellSignals.length > 0) positionsWithSellSignal += 1;
      totalMarketValue += e.marketValue ?? e.position.costBasis;
      if (e.unrealizedPnlDollars !== null) {
        aggregateStockPnlDollars += e.unrealizedPnlDollars;
      }
    } else if (e.kind === "option") {
      optionPositions += 1;
      // Add the OPTION leg's mark-to-market: long → +intrinsic value;
      // short → -intrinsic (cost to close). When intrinsic isn't
      // available (no underlying price), skip the contribution.
      if (e.intrinsicDollars !== null) {
        const sign = e.position.contracts > 0 ? 1 : -1;
        totalMarketValue += sign * e.intrinsicDollars;
      }
    } else {
      cashPositions += 1;
      totalMarketValue += e.currentValue;
      aggregateAccruedInterest += e.accruedInterest;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    portfolioUpdatedAt: portfolio.updatedAt,
    positions,
    summary: {
      totalPositions: portfolio.positions.length,
      stockPositions,
      optionPositions,
      cashPositions,
      stocksInSnapshot,
      positionsInAvoid,
      positionsWithSellSignal,
      totalMarketValue,
      aggregateStockPnlDollars,
      aggregateAccruedInterest,
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

export const MILESTONE_LABELS: Record<OptionMilestone["scenario"], string> = {
  "current-price": "If price stays here",
  "called-away": "If called away (price ≥ strike at expiry)",
  assigned: "If assigned (price ≤ strike at expiry)",
  "expires-otm": "If expires worthless (OTM)",
};
