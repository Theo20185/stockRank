import type { EdgarFact, EdgarFactsByConcept } from "./types.js";

/** Fact predicates. `fp` can be null on rare entries. */
const isFY = (f: EdgarFact): boolean => f.fp === "FY";
const isQuarterly = (f: EdgarFact): boolean =>
  f.fp !== null && f.fp.startsWith("Q");

/** Pull the unit-array for a concept. If `preferredUnit` is given and
 * present we use it; otherwise we take the first declared unit. EDGAR
 * concepts are typically single-unit (USD or USD/shares). */
export function unitFacts(
  facts: EdgarFactsByConcept,
  concept: string,
  preferredUnit?: string,
): EdgarFact[] {
  const c = facts[concept];
  if (!c) return [];
  if (preferredUnit && c.units[preferredUnit]) return c.units[preferredUnit]!;
  const first = Object.values(c.units)[0];
  return first ?? [];
}

/** Walk a list of concept names and return the first one with any
 * facts. Used for fallback chains where a filer may use one of
 * several legal concept tags (e.g. revenue concept changed in 2018
 * with ASC-606). */
export function firstAvailable(
  facts: EdgarFactsByConcept,
  concepts: readonly string[],
  preferredUnit?: string,
): { concept: string; facts: EdgarFact[] } | null {
  for (const c of concepts) {
    const f = unitFacts(facts, c, preferredUnit);
    if (f.length > 0) return { concept: c, facts: f };
  }
  return null;
}

/**
 * Dedupe by period-end date, keeping the latest filed fact for each
 * (end, fp) pair. Restatements (10-K/A) and re-filings can produce
 * multiple facts for the same fiscal period; the most recently filed
 * one is the authoritative restated value.
 */
export function dedupeByPeriod(
  facts: EdgarFact[],
  predicate: (f: EdgarFact) => boolean,
): Map<string, EdgarFact> {
  const byEnd = new Map<string, EdgarFact>();
  for (const f of facts) {
    if (!predicate(f)) continue;
    const existing = byEnd.get(f.end);
    if (!existing || f.filed > existing.filed) byEnd.set(f.end, f);
  }
  return byEnd;
}

/** Dedupe → annual (fp === "FY"), keyed by period-end date. */
export function annualMap(
  facts: EdgarFactsByConcept,
  concepts: readonly string[],
  preferredUnit?: string,
): Map<string, EdgarFact> {
  const hit = firstAvailable(facts, concepts, preferredUnit);
  if (!hit) return new Map();
  return dedupeByPeriod(hit.facts, isFY);
}

/** Dedupe → quarterly (fp matches Q[1-4]), keyed by period-end date.
 * Quarterly facts here are pure-quarter values, NOT trailing — the
 * caller computes TTM by summing 4 trailing quarters. */
export function quarterlyMap(
  facts: EdgarFactsByConcept,
  concepts: readonly string[],
  preferredUnit?: string,
): Map<string, EdgarFact> {
  const hit = firstAvailable(facts, concepts, preferredUnit);
  if (!hit) return new Map();
  return dedupeByPeriod(hit.facts, isQuarterly);
}

/** Balance-sheet concepts are point-in-time snapshots. Yahoo records
 * the FY snapshot at fiscal-year-end; EDGAR also reports Q1/Q2/Q3
 * balances. For balance reads we accept any period-end (FY or Q*)
 * since each is just a single point reading. */
export function balanceMap(
  facts: EdgarFactsByConcept,
  concepts: readonly string[],
  preferredUnit?: string,
): Map<string, EdgarFact> {
  const hit = firstAvailable(facts, concepts, preferredUnit);
  if (!hit) return new Map();
  return dedupeByPeriod(hit.facts, (f) => isFY(f) || isQuarterly(f));
}

// ---------------------------------------------------------------
// Concept fallback chains. Order matters — first available wins.
// Validated against AAPL 2026-04-22.
// ---------------------------------------------------------------

export const REVENUE_CONCEPTS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
] as const;

export const COST_OF_REVENUE_CONCEPTS = [
  "CostOfRevenue",
  "CostOfGoodsAndServicesSold",
] as const;

export const DA_CONCEPTS = [
  "DepreciationDepletionAndAmortization",
  "DepreciationAndAmortization",
  "Depreciation",
] as const;

export const DIVIDENDS_CONCEPTS = [
  "PaymentsOfDividends",
  "PaymentsOfDividendsCommonStock",
] as const;

export const SHORT_TERM_DEBT_CONCEPTS = [
  "CommercialPaper",
  "ShortTermBorrowings",
] as const;

export const NET_INCOME_CONCEPTS = ["NetIncomeLoss"] as const;
export const EPS_CONCEPTS = ["EarningsPerShareDiluted"] as const;
export const SHARES_CONCEPTS = [
  "WeightedAverageNumberOfDilutedSharesOutstanding",
] as const;
export const OPERATING_INCOME_CONCEPTS = ["OperatingIncomeLoss"] as const;
export const INTEREST_EXPENSE_CONCEPTS = [
  "InterestExpense",
  "InterestExpenseDebt",
] as const;
export const GROSS_PROFIT_CONCEPTS = ["GrossProfit"] as const;
export const CASH_CONCEPTS = [
  "CashAndCashEquivalentsAtCarryingValue",
  "Cash",
] as const;
export const CURRENT_ASSETS_CONCEPTS = ["AssetsCurrent"] as const;
export const CURRENT_LIABILITIES_CONCEPTS = ["LiabilitiesCurrent"] as const;
export const STOCKHOLDERS_EQUITY_CONCEPTS = ["StockholdersEquity"] as const;
export const LONG_TERM_DEBT_CONCEPTS = ["LongTermDebt"] as const;
export const LONG_TERM_DEBT_NONCURRENT_CONCEPTS = [
  "LongTermDebtNoncurrent",
] as const;
export const LONG_TERM_DEBT_CURRENT_CONCEPTS = [
  "LongTermDebtCurrent",
] as const;
export const OPERATING_CASH_FLOW_CONCEPTS = [
  "NetCashProvidedByUsedInOperatingActivities",
] as const;
export const CAPEX_CONCEPTS = [
  "PaymentsToAcquirePropertyPlantAndEquipment",
] as const;
export const BUYBACKS_CONCEPTS = [
  "PaymentsForRepurchaseOfCommonStock",
] as const;
