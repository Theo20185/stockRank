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

export type ContractReturnFlags = {
  shortDated: boolean;
};

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
    staticReturnPct,
    staticAnnualizedPct,
    assignedReturnPct,
    assignedAnnualizedPct,
    effectiveCostBasis,
    effectiveDiscountPct,
  };
}

export function computePutReturns(input: PutReturnInputs): PutReturns {
  const { contract, currentPrice } = input;
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
    notAssignedReturnPct,
    notAssignedAnnualizedPct,
    effectiveCostBasis,
    effectiveDiscountPct,
    inTheMoney: contract.inTheMoney,
  };
}
