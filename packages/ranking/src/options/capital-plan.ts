/**
 * Cash-secured-put capital allocator.
 *
 * Given a pool of capital and a list of CSP candidates (typically the
 * top-ranked stocks in the Ranked bucket), figure out how many contracts
 * to sell on each so the user can plan a coordinated wheel-style entry.
 *
 * Each contract carries `strike × 100` of collateral. The allocator
 * aims for equal-weight by capital — `capital / N` per name — then
 * floors to whole contracts. After the first pass it walks the
 * candidates again in rank order and tops up with leftover capital, so
 * higher-ranked names absorb the remainder.
 *
 * The result intentionally is not perfectly balanced: a $300-strike
 * candidate costs $30k per contract, so when the equal-weight target is
 * $20k that name allocates 0 contracts. The user accepts this — the
 * goal is "reasonable diversified allocation across the top picks", not
 * "exact even split".
 */

export type CapitalPlanCandidate = {
  symbol: string;
  /** Strike of the CSP being sold. */
  strike: number;
  /** Bid received per share (× 100 = premium per contract). */
  premiumPerShare: number;
  /** Days to expiry — informational, surfaced in the UI. */
  daysToExpiry: number;
  /** Annualized return on collateral (decimal, e.g. 0.18 for 18%). */
  annualizedReturn: number;
  /** Composite score (decimal, 0-100). Display only — caller pre-sorts. */
  composite: number;
};

export type CapitalPlanItem = {
  symbol: string;
  strike: number;
  premiumPerShare: number;
  daysToExpiry: number;
  annualizedReturn: number;
  composite: number;
  /** Whole contracts to sell. May be 0 when collateral exceeds the budget slice. */
  contracts: number;
  /** strike × 100 — collateral per single contract, regardless of contracts > 0. */
  collateralPerContract: number;
  /** contracts × collateralPerContract. */
  totalCollateral: number;
  /** contracts × premiumPerShare × 100. */
  totalPremium: number;
};

export type CapitalPlan = {
  capital: number;
  /** Sum of totalCollateral across items. */
  allocated: number;
  /** capital - allocated. Always ≥ 0. */
  remaining: number;
  /** Sum of totalPremium across items. */
  totalPremium: number;
  items: CapitalPlanItem[];
};

export type CapitalPlanInput = {
  capital: number;
  candidates: CapitalPlanCandidate[];
  /**
   * Optional cap on candidates considered. When provided, only the
   * first `topN` candidates (after caller-supplied sort) participate
   * in allocation. When undefined or > candidates.length, all are used.
   */
  topN?: number;
};

const SHARES_PER_CONTRACT = 100;

export function buildCapitalPlan(input: CapitalPlanInput): CapitalPlan {
  const capital = Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;

  // topN <= 0 explicitly excludes every candidate — return an empty plan.
  if (input.topN !== undefined && input.topN <= 0) {
    return { capital, allocated: 0, remaining: capital, totalPremium: 0, items: [] };
  }

  const cap = input.topN !== undefined
    ? Math.min(input.topN, input.candidates.length)
    : input.candidates.length;
  const considered = input.candidates.slice(0, cap);

  if (capital === 0 || considered.length === 0) {
    return {
      capital,
      allocated: 0,
      remaining: capital,
      totalPremium: 0,
      items: considered.map((c) => zeroItem(c)),
    };
  }

  const budgetPerName = capital / considered.length;
  const items: CapitalPlanItem[] = considered.map((c) => {
    const collateralPerContract = c.strike * SHARES_PER_CONTRACT;
    const contracts = collateralPerContract > 0
      ? Math.floor(budgetPerName / collateralPerContract)
      : 0;
    return finalize(c, contracts);
  });

  let remaining = capital - sumOf(items, (i) => i.totalCollateral);

  // Pass 2: top up in rank order. Walk repeatedly until no candidate's
  // per-contract collateral fits in remaining. Higher-ranked names get
  // the extra contracts first, which matches the "concentrated in
  // best-in-class" thesis.
  let progress = true;
  while (progress) {
    progress = false;
    for (const item of items) {
      if (item.collateralPerContract > 0 && item.collateralPerContract <= remaining) {
        item.contracts += 1;
        item.totalCollateral = item.contracts * item.collateralPerContract;
        item.totalPremium = item.contracts * item.premiumPerShare * SHARES_PER_CONTRACT;
        remaining -= item.collateralPerContract;
        progress = true;
      }
    }
  }

  const allocated = capital - remaining;
  const totalPremium = sumOf(items, (i) => i.totalPremium);
  return { capital, allocated, remaining, totalPremium, items };
}

function zeroItem(c: CapitalPlanCandidate): CapitalPlanItem {
  return {
    symbol: c.symbol,
    strike: c.strike,
    premiumPerShare: c.premiumPerShare,
    daysToExpiry: c.daysToExpiry,
    annualizedReturn: c.annualizedReturn,
    composite: c.composite,
    contracts: 0,
    collateralPerContract: c.strike * SHARES_PER_CONTRACT,
    totalCollateral: 0,
    totalPremium: 0,
  };
}

function finalize(c: CapitalPlanCandidate, contracts: number): CapitalPlanItem {
  const collateralPerContract = c.strike * SHARES_PER_CONTRACT;
  return {
    symbol: c.symbol,
    strike: c.strike,
    premiumPerShare: c.premiumPerShare,
    daysToExpiry: c.daysToExpiry,
    annualizedReturn: c.annualizedReturn,
    composite: c.composite,
    contracts,
    collateralPerContract,
    totalCollateral: contracts * collateralPerContract,
    totalPremium: contracts * c.premiumPerShare * SHARES_PER_CONTRACT,
  };
}

function sumOf<T>(arr: T[], pick: (t: T) => number): number {
  let total = 0;
  for (const x of arr) total += pick(x);
  return total;
}
