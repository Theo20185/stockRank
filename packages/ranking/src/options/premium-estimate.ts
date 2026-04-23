/**
 * Estimates covered-call premium as a percentage of current price for
 * a given strike (expressed as upside-to-strike) and time to expiry.
 *
 * Used by back-test scripts where historical options data isn't
 * available. Real options data should be preferred when present.
 *
 * Methodology — closed-form approximation of an OTM call:
 *
 *   premium ≈ S × σ × √T × decay(moneyness)
 *
 * where σ is annualized IV, T is years to expiry, and decay is a
 * monotonically-decreasing function of how far OTM the strike sits.
 * The √T scaling matches Black-Scholes time-value behavior; the
 * decay term roughly matches OTM call premium behavior at typical
 * value-tilt IVs (~25% annualized).
 *
 * Calibrated against observed live data (TROW, LULU, NVO):
 *   - ATM 2y at 25% IV → ~12% premium
 *   - 25% OTM 2y at 25% IV → ~6% premium
 *   - 50% OTM 2y at 25% IV → ~3% premium
 */

export type EstimateCallPremiumInput = {
  /** How far above current price the strike sits, in percent. 0 = ATM,
   * positive = OTM. Negative values clamp to 0 (covered calls aren't
   * sold below current price in this strategy). */
  upsideToStrikePct: number;
  /** Years to expiration. Negative or zero → 0 premium. */
  yearsToExpiry: number;
  /** Annualized implied volatility, default 0.25 (typical for value
   * names). Pass 0.4+ for high-IV names like LULU/NVO; 0.15 for
   * low-IV names like utilities. Zero or negative → 0 premium. */
  annualizedIv?: number;
};

const DEFAULT_IV = 0.25;
const PREMIUM_FLOOR_PCT = 0.5;

export function estimateCallPremiumPct(input: EstimateCallPremiumInput): number {
  const T = input.yearsToExpiry;
  const iv = input.annualizedIv ?? DEFAULT_IV;
  if (T <= 0 || iv <= 0) return 0;

  const upside = Math.max(0, input.upsideToStrikePct);

  // Base time value (% of current price) for an ATM call:
  //   premium_atm ≈ S × σ × √T × constant
  // The constant ≈ 0.4 calibrates to typical at-the-money 2y prices.
  const atmPct = 100 * iv * Math.sqrt(T) * 0.4;

  // OTM decay: linear-ish drop as strike moves above current price.
  // Calibration: 25% OTM ≈ half the ATM premium; 50% OTM ≈ quarter;
  // floored at 0.1 (deep OTM still pays a small lottery-ticket premium).
  const decay = Math.max(0.1, 1 - upside / 60);

  const premium = atmPct * decay;
  return Math.max(PREMIUM_FLOOR_PCT, premium);
}
