/**
 * Portfolio data model — closes the loop between the engine's
 * surfacing of candidates and the user's actual holdings.
 *
 * v2 introduced a discriminated union of position types so the
 * portfolio can hold stock, option, and cash positions:
 *   - StockPosition  — long shares of a security
 *   - OptionPosition — calls / puts (long or short via signed contracts)
 *   - CashPosition   — money-market funds or T-bill ETFs (SPAXX, BIL)
 *
 * Each position carries a stable `id` so options can be paired with
 * underlying stock positions (covered call → long stock + short call)
 * and so the UI can target individual rows for delete operations.
 *
 * Storage lives in browser localStorage (key: stockrank.portfolio) —
 * the StockRank web app is publicly hosted, so portfolio data must
 * never reach the deployed bundle.
 */

export type PositionKind = "stock" | "option" | "cash";

export interface BasePosition {
  /** Stable identifier (UUID-ish). Generated client-side at create time. */
  id: string;
  /** ISO date the user entered the position. */
  entryDate: string;
  /**
   * Free-form note — used for entry rationale, scenarios watched,
   * any context the user wants the position to carry.
   */
  notes?: string;
}

export interface StockPosition extends BasePosition {
  kind: "stock";
  symbol: string;
  /** Number of shares held (whole-share or fractional). */
  shares: number;
  /**
   * Total dollar cost basis across all shares — what the user paid
   * including any commissions. Per-share basis is `costBasis / shares`.
   */
  costBasis: number;
}

export type OptionType = "call" | "put";

export interface OptionPosition extends BasePosition {
  kind: "option";
  /** Underlying ticker symbol. */
  symbol: string;
  optionType: OptionType;
  /**
   * Number of contracts. Sign indicates direction:
   *   - positive → LONG (user paid the premium; debit)
   *   - negative → SHORT (user received the premium; credit)
   */
  contracts: number;
  /** Strike price per share. */
  strike: number;
  /** Expiration date, ISO YYYY-MM-DD. */
  expiration: string;
  /**
   * Total premium dollars at entry — always non-negative. Sign of
   * the cash flow comes from `contracts`: long pays, short receives.
   * Stored as the absolute dollar amount the user paid or received.
   */
  premium: number;
  /**
   * If this option is part of a covered position (covered call,
   * cash-secured put with collateral, buy-write), the id of the
   * paired stock position. The evaluator uses this to compute
   * combined yield-at-expiry scenarios.
   */
  pairedStockId?: string;
}

export interface CashPosition extends BasePosition {
  kind: "cash";
  /** Symbol — e.g. SPAXX, BIL, FZDXX. Free-form. */
  symbol: string;
  /** Dollars held. */
  amount: number;
  /**
   * Annual yield as a percentage (e.g. 4.85 means 4.85%). The
   * evaluator accrues simple interest from `entryDate` to the
   * snapshot date.
   */
  yieldPct: number;
}

export type Position = StockPosition | OptionPosition | CashPosition;

export type Portfolio = {
  /** ISO timestamp the portfolio was last edited. */
  updatedAt: string;
  positions: Position[];
};

export const EMPTY_PORTFOLIO: Portfolio = {
  updatedAt: "1970-01-01T00:00:00Z",
  positions: [],
};

/* ─── Type guards ─────────────────────────────────────────────────── */

export function isStockPosition(p: Position): p is StockPosition {
  return p.kind === "stock";
}
export function isOptionPosition(p: Position): p is OptionPosition {
  return p.kind === "option";
}
export function isCashPosition(p: Position): p is CashPosition {
  return p.kind === "cash";
}

/* ─── Migration ───────────────────────────────────────────────────── */

/**
 * v1 position shape (pre-2026-04-26): bare stock-only fields, no `id`,
 * no `kind` discriminator. Kept here for migration only.
 */
type LegacyStockPosition = {
  symbol: string;
  entryDate: string;
  entryPrice: number;
  sharesOwned: number;
  notes?: string;
};

function isLegacyStock(p: unknown): p is LegacyStockPosition {
  if (typeof p !== "object" || p === null) return false;
  const o = p as Record<string, unknown>;
  return (
    o.kind === undefined &&
    typeof o.symbol === "string" &&
    typeof o.entryPrice === "number" &&
    typeof o.sharesOwned === "number"
  );
}

/**
 * Generate a positionId. Crypto.randomUUID is available in modern
 * browsers and node ≥ 19; we fall back to Math.random for jsdom and
 * older environments. The collision risk is irrelevant for a single-
 * user portfolio that holds a few dozen positions.
 */
export function newPositionId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  return `pos_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Migrate a portfolio loaded from disk to the current schema.
 * Currently handles:
 *   - v1 (legacy) stock-only positions → StockPosition with kind+id
 *   - missing `id` on otherwise-current positions
 */
export function migratePortfolio(raw: unknown): Portfolio {
  if (typeof raw !== "object" || raw === null) return EMPTY_PORTFOLIO;
  const obj = raw as Record<string, unknown>;
  const updatedAt =
    typeof obj.updatedAt === "string" ? obj.updatedAt : EMPTY_PORTFOLIO.updatedAt;
  const rawPositions = Array.isArray(obj.positions) ? obj.positions : [];
  const positions: Position[] = [];
  for (const p of rawPositions) {
    if (isLegacyStock(p)) {
      const migrated: StockPosition = {
        kind: "stock",
        id: newPositionId(),
        symbol: p.symbol,
        entryDate: p.entryDate,
        shares: p.sharesOwned,
        costBasis: p.entryPrice * p.sharesOwned,
      };
      if (p.notes !== undefined) migrated.notes = p.notes;
      positions.push(migrated);
      continue;
    }
    if (typeof p !== "object" || p === null) continue;
    const candidate = p as Record<string, unknown>;
    if (
      candidate.kind === "stock" ||
      candidate.kind === "option" ||
      candidate.kind === "cash"
    ) {
      // Mint an id if missing (e.g. hand-written JSON).
      if (typeof candidate.id !== "string" || candidate.id.length === 0) {
        candidate.id = newPositionId();
      }
      positions.push(candidate as unknown as Position);
    }
  }
  return { updatedAt, positions };
}
