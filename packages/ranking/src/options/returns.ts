import type { ContractQuote } from "@stockrank/core";

/**
 * Per-contract return math for covered calls and cash-secured puts.
 * See docs/specs/options.md §4.
 *
 * All calculations assume fill at the bid (we sell) and hold to
 * expiry. No time-decay modeling, no rolling — just two outcomes per
 * trade: not assigned and assigned.
 */

const SHORT_DATED_DAYS = 30;

/** Maintained constant, not a feed — revisit when short rates move
 * materially (options.md §4.5). */
const ASSIGNMENT_RISK_FREE_RATE = 0.04;

export type ContractReturnFlags = {
  shortDated: boolean;
  /** Early-assignment rationality (options.md §4.5): from here, a
   * rational counterparty plausibly exercises early. Puts: extrinsic
   * below interest-on-strike net of dividends. Calls: extrinsic below
   * the approximated next quarterly dividend. */
  assignmentRisk: boolean;
};

/**
 * Early assignment of a short put becomes rational for the
 * counterparty when the time value they'd forfeit is less than the
 * interest they'd earn on the strike proceeds, net of the dividends
 * they'd stop collecting by delivering the shares. Bid basis; a
 * null/zero bid never flags (the row is untradeable anyway).
 */
export function earlyPutAssignmentRisk(
  contract: ContractQuote,
  currentPrice: number,
  annualDividendPerShare = 0,
): boolean {
  const bid = contract.bid ?? 0;
  if (bid <= 0) return false;
  const intrinsic = Math.max(0, contract.strike - currentPrice);
  if (intrinsic <= 0) return false;
  const extrinsic = bid - intrinsic;
  const T = contract.daysToExpiry / 365;
  const carry =
    contract.strike * ASSIGNMENT_RISK_FREE_RATE * T -
    annualDividendPerShare * T;
  return extrinsic < carry;
}

/**
 * Early assignment of a short call concentrates just before an
 * ex-dividend date when the dividend exceeds remaining time value.
 * No ex-div calendar in the data — approximate the next dividend as
 * annualDividendPerShare / 4 (options.md §4.5 documents the
 * over/under-flagging this implies).
 */
export function earlyCallAssignmentRisk(
  contract: ContractQuote,
  currentPrice: number,
  annualDividendPerShare: number,
): boolean {
  const bid = contract.bid ?? 0;
  if (bid <= 0) return false;
  if (annualDividendPerShare <= 0) return false;
  const intrinsic = Math.max(0, currentPrice - contract.strike);
  if (intrinsic <= 0) return false;
  const extrinsic = bid - intrinsic;
  return extrinsic < annualDividendPerShare / 4;
}

export type CallReturnInputs = {
  contract: ContractQuote;
  /** Underlying spot price. */
  currentPrice: number;
  /** Annual dividend per share (snapshot.ttm.dividendYield × price). */
  annualDividendPerShare: number;
};

export type CallReturns = ContractReturnFlags & {
  staticReturnPct: number;
  staticAnnualizedPct: number;
  assignedReturnPct: number;
  assignedAnnualizedPct: number;
  effectiveCostBasis: number;
  effectiveDiscountPct: number;
};

export type PutReturnInputs = {
  contract: ContractQuote;
  currentPrice: number;
  /** For the assignment-risk carry term — dividends delay rational
   * early exercise of puts. Omitted = 0, the conservative side (flags
   * earlier). */
  annualDividendPerShare?: number;
};

export type PutReturns = ContractReturnFlags & {
  notAssignedReturnPct: number;
  notAssignedAnnualizedPct: number;
  effectiveCostBasis: number;
  effectiveDiscountPct: number;
  inTheMoney: boolean;
};

function annualize(returnPct: number, daysToExpiry: number): number {
  if (daysToExpiry <= 0) return 0;
  return returnPct * (365 / daysToExpiry);
}

export function computeCallReturns(input: CallReturnInputs): CallReturns {
  const { contract, currentPrice, annualDividendPerShare } = input;
  const bid = contract.bid ?? 0;
  const T = contract.daysToExpiry;

  const expectedDividends = annualDividendPerShare * (T / 365);

  const staticDollar = bid + expectedDividends;
  const staticReturnPct = currentPrice > 0 ? staticDollar / currentPrice : 0;
  const staticAnnualizedPct = annualize(staticReturnPct, T);

  const assignedDollar = bid + expectedDividends + (contract.strike - currentPrice);
  const assignedReturnPct = currentPrice > 0 ? assignedDollar / currentPrice : 0;
  const assignedAnnualizedPct = annualize(assignedReturnPct, T);

  const effectiveCostBasis = currentPrice - bid;
  const effectiveDiscountPct = currentPrice > 0 ? bid / currentPrice : 0;

  return {
    shortDated: T < SHORT_DATED_DAYS,
    assignmentRisk: earlyCallAssignmentRisk(
      contract,
      currentPrice,
      annualDividendPerShare,
    ),
    staticReturnPct,
    staticAnnualizedPct,
    assignedReturnPct,
    assignedAnnualizedPct,
    effectiveCostBasis,
    effectiveDiscountPct,
  };
}

export function computePutReturns(input: PutReturnInputs): PutReturns {
  const { contract, currentPrice, annualDividendPerShare = 0 } = input;
  const bid = contract.bid ?? 0;
  const T = contract.daysToExpiry;
  const K = contract.strike;

  const notAssignedReturnPct = K > 0 ? bid / K : 0;
  const notAssignedAnnualizedPct = annualize(notAssignedReturnPct, T);

  const effectiveCostBasis = K - bid;
  const effectiveDiscountPct = currentPrice > 0
    ? (currentPrice - effectiveCostBasis) / currentPrice
    : 0;

  return {
    shortDated: T < SHORT_DATED_DAYS,
    assignmentRisk: earlyPutAssignmentRisk(
      contract,
      currentPrice,
      annualDividendPerShare,
    ),
    notAssignedReturnPct,
    notAssignedAnnualizedPct,
    effectiveCostBasis,
    effectiveDiscountPct,
    inTheMoney: contract.inTheMoney,
  };
}
