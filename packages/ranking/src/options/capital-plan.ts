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
  /**
   * Collateral-weighted annualized return across allocated items
   * (decimal, e.g. 0.18 = 18%). The headline yield on the capital
   * the plan actually deploys; the "if I follow this plan, this is
   * what I earn per year per dollar tied up in collateral" number.
   *
   * Formula: Σ(item.totalCollateral × item.annualizedReturn) / allocated.
   * Each leg's annualized return already accounts for its own DTE, so
   * collateral-weighting them produces the correct cross-DTE blend.
   *
   * Null when allocated == 0 (no contracts to weight).
   */
  annualizedReturnOnAllocated: number | null;
  items: CapitalPlanItem[];
};

export type CapitalPlanInput = {
  capital: number;
  candidates: CapitalPlanCandidate[];
  /**
   * Optional cap on candidates considered. When provided, only the
   * first `topN` candidates (after caller-supplied sort) participate
   * in allocation. When undefined or > candidates.length, all are used.
   * topN is applied AFTER `excludedSymbols` — i.e., it caps the
   * survivors, not the raw input.
   */
  topN?: number;
  /**
   * Symbols the user wants skipped entirely. Each excluded symbol
   * still appears in `items` with `contracts: 0` so the UI can render
   * it (faded) and offer to un-exclude. They consume no budget and do
   * not count toward `topN`.
   */
  excludedSymbols?: ReadonlySet<string>;
};

const SHARES_PER_CONTRACT = 100;

export function buildCapitalPlan(input: CapitalPlanInput): CapitalPlan {
  const capital = Number.isFinite(input.capital) && input.capital > 0 ? input.capital : 0;
  const excluded = input.excludedSymbols ?? new Set<string>();

  // topN <= 0 explicitly excludes every candidate — return an empty plan.
  if (input.topN !== undefined && input.topN <= 0) {
    return {
      capital,
      allocated: 0,
      remaining: capital,
      totalPremium: 0,
      annualizedReturnOnAllocated: null,
      items: [],
    };
  }

  // Survivors = caller-supplied order minus the excluded set. topN
  // applies to this filtered list so excluded names don't take slots.
  const survivors = input.candidates.filter((c) => !excluded.has(c.symbol));
  const cap = input.topN !== undefined
    ? Math.min(input.topN, survivors.length)
    : survivors.length;
  const considered = survivors.slice(0, cap);
  const consideredSymbols = new Set(considered.map((c) => c.symbol));

  // Items emitted by the engine = considered survivors + every excluded
  // candidate (so the UI can render the "Include" toggle). Names that
  // are over-topN and NOT excluded are dropped — they wouldn't be
  // actionable and they'd just clutter the table.
  const visibleCandidates = input.candidates.filter(
    (c) => consideredSymbols.has(c.symbol) || excluded.has(c.symbol),
  );

  if (capital === 0 || considered.length === 0) {
    return {
      capital,
      allocated: 0,
      remaining: capital,
      totalPremium: 0,
      annualizedReturnOnAllocated: null,
      items: visibleCandidates.map((c) => zeroItem(c)),
    };
  }

  const budgetPerName = capital / considered.length;
  const items: CapitalPlanItem[] = visibleCandidates.map((c) => {
    if (!consideredSymbols.has(c.symbol)) return zeroItem(c);
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
  // best-in-class" thesis. Excluded / over-topN items stay at zero.
  let progress = true;
  while (progress) {
    progress = false;
    for (const item of items) {
      if (!consideredSymbols.has(item.symbol)) continue;
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
  const weightedAnnualized = sumOf(
    items,
    (i) => i.totalCollateral * i.annualizedReturn,
  );
  const annualizedReturnOnAllocated =
    allocated > 0 ? weightedAnnualized / allocated : null;
  return {
    capital,
    allocated,
    remaining,
    totalPremium,
    annualizedReturnOnAllocated,
    items,
  };
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
