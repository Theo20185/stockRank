/**
 * Frictions overlay — turnover-cost drag and tax haircuts applied to
 * the cumulative horizon return.
 *
 * Pure functions; no I/O. Each candidate (weight-vector or static)
 * declares its `annualTurnover` and `incomeShare`, and the overlay
 * applies a uniform haircut so cross-candidate comparison stays apples-
 * to-apples.
 *
 * Tax rates default to the user's confirmed California+Fed combined
 * rates including the 3.8% Net Investment Income Tax (NIIT):
 *   - STCG: 37% Fed + 13.3% CA + 3.8% NIIT = 54.1%
 *   - LTCG: 20% Fed + 13.3% CA + 3.8% NIIT = 37.1%
 * (CA doesn't differentiate ST vs LT; both get the 13.3% top bracket.)
 */

/** California + Fed top-bracket short-term gains rate: 37% + 13.3% + 3.8%. */
export const CA_FED_STCG_RATE = 0.37 + 0.133 + 0.038;
/** California + Fed top-bracket long-term gains rate: 20% + 13.3% + 3.8%. */
export const CA_FED_LTCG_RATE = 0.20 + 0.133 + 0.038;

/** Holding-period threshold for short-term-vs-long-term gains classification. */
const LTCG_HOLDING_THRESHOLD_YEARS = 1;

export type TaxRegime =
  | "tax-free"
  | "ltcg-only"
  | "blended-by-horizon";

export type Frictions = {
  /** Round-trip transaction cost in basis points (commission + spread + slippage). */
  roundTripBps?: number;
  /** Tax regime applied to the after-friction return. */
  taxRegime?: TaxRegime;
  /** Override the default 54.1% combined STCG rate. */
  shortTermRate?: number;
  /** Override the default 37.1% combined LTCG rate. */
  longTermRate?: number;
};

export type FrictionInput = {
  /** Cumulative return at the horizon, decimal (e.g. 0.30 = +30% over 3y). */
  cumulativeReturn: number;
  /** Horizon length in years (1, 3, ...). */
  horizonYears: number;
  /** Implied portfolio turnover per year (1.0 = full rebuild yearly, 0 = buy-and-hold). */
  annualTurnover: number;
  /** Fraction of total return that's ordinary-income / short-term gains. */
  incomeShare: number;
};

export type FrictionResult = {
  /** Return after subtracting the turnover-cost drag. */
  afterFriction: number;
  /** Return after applying the tax regime to the after-friction return. */
  afterTax: number;
};

export function applyFrictions(
  input: FrictionInput,
  frictions: Frictions,
): FrictionResult {
  const roundTripBps = frictions.roundTripBps ?? 0;
  const taxRegime: TaxRegime = frictions.taxRegime ?? "tax-free";
  const stcg = frictions.shortTermRate ?? CA_FED_STCG_RATE;
  const ltcg = frictions.longTermRate ?? CA_FED_LTCG_RATE;

  // Cost overlay: drag = 2 × bps × turnover × horizonYears.
  //   2× because every round trip pays the spread on entry AND exit.
  //   turnover scales the drag by how often the position recycles.
  //   horizonYears stacks the per-year drag over the holding period.
  const costDrag =
    2 * (roundTripBps / 10_000) * input.annualTurnover * input.horizonYears;
  const afterFriction = input.cumulativeReturn - costDrag;

  // Losses pass through unchanged — wash-sale / loss-harvesting out of scope.
  if (afterFriction <= 0) {
    return { afterFriction, afterTax: afterFriction };
  }

  let afterTax: number;
  switch (taxRegime) {
    case "tax-free":
      afterTax = afterFriction;
      break;
    case "ltcg-only":
      afterTax = afterFriction * (1 - ltcg);
      break;
    case "blended-by-horizon":
      // IRS rule: gains qualify for LTCG only when the position is
      // held MORE than one year. A 1y horizon means exactly 365d, which
      // doesn't qualify, so we apply STCG to the entire return.
      if (input.horizonYears <= LTCG_HOLDING_THRESHOLD_YEARS) {
        afterTax = afterFriction * (1 - stcg);
      } else {
        // Income portion is always STCG. Capital appreciation portion
        // gets STCG if held < 1y else LTCG.
        const incomePortion = afterFriction * input.incomeShare;
        const capitalPortion = afterFriction * (1 - input.incomeShare);
        afterTax =
          incomePortion * (1 - stcg) + capitalPortion * (1 - ltcg);
      }
      break;
  }

  return { afterFriction, afterTax };
}
