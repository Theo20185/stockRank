/**
 * Portfolio data model — closes the loop between the engine's
 * surfacing of candidates and the user's actual holdings.
 *
 * v1 is read-only from the web side: the user maintains
 * `public/data/portfolio.json` directly. The web layer evaluates
 * each position against the current snapshot and surfaces:
 *  - current price + P&L vs entry
 *  - current bucket assignment (ranked/watch/avoid/excluded)
 *  - sell signals (price ≥ FV median; composite dropped to Avoid;
 *    composite below universe median)
 *
 * v2 (later) adds UI for editing positions; v3 may add tax-aware
 * cost-basis tracking and options-leg tracking.
 */

export type Position = {
  symbol: string;
  /** ISO date the user entered the position. */
  entryDate: string;
  /** Cost-basis price per share at entry. */
  entryPrice: number;
  /** Number of shares held (whole-share or fractional). */
  sharesOwned: number;
  /**
   * Free-form note — used for entry rationale, scenarios watched,
   * any context the user wants the position to carry. Surfaces in
   * the position drill-down.
   */
  notes?: string;
};

export type Portfolio = {
  /** ISO timestamp the portfolio file was last edited. */
  updatedAt: string;
  positions: Position[];
};

/**
 * Empty-portfolio sentinel — used as a fallback when no
 * `public/data/portfolio.json` is present (the web layer treats
 * "no portfolio" gracefully — Portfolio tab still renders, just
 * shows a "no positions" empty state).
 */
export const EMPTY_PORTFOLIO: Portfolio = {
  updatedAt: "1970-01-01T00:00:00Z",
  positions: [],
};
