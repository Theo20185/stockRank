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

/** Days between two ISO yyyy-mm-dd dates. */
function daysBetween(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00.000Z`).getTime();
  const e = new Date(`${end}T00:00:00.000Z`).getTime();
  return Math.round((e - s) / (24 * 3600 * 1000));
}

/** Returns true when this fact's period covers a single fiscal
 * quarter (~3 months), false for YTD-cumulative variants (~6/9
 * months).
 *
 * Per LULU 2026-04 investigation: EDGAR returns BOTH standalone-Q
 * (start ≈ end-3mo) AND YTD (start ≈ start-of-fiscal-year) for
 * income/cashflow concepts in 10-Q filings. They share `end`, `fp`,
 * `fy`, and `filed`. The only disambiguator is `start`. Without
 * filtering, our trailing-4-quarter sums add YTD figures as if they
 * were standalone, inflating TTM by 2-3×.
 *
 * Threshold: 60-100 days. Standard fiscal quarters land at 84-98
 * days (13 weeks); 4-4-5 fiscal calendars can stretch to 91-98.
 * YTD-Q2 starts at ~180, YTD-Q3 at ~270, both well above the
 * upper bound. */
export function isStandaloneQuarterFact(f: EdgarFact): boolean {
  if (!f.start) return false;
  const days = daysBetween(f.start, f.end);
  return days >= 60 && days <= 100;
}

/**
 * Quarterly extraction for FLOW concepts (income statement, cash
 * flow): keeps only standalone-quarter facts so trailing-4 sums are
 * arithmetically valid. Use `quarterlyMap` for balance-sheet
 * concepts (point-in-time, no YTD/standalone duality).
 */
export function standaloneQuarterlyMap(
  facts: EdgarFactsByConcept,
  concepts: readonly string[],
  preferredUnit?: string,
): Map<string, EdgarFact> {
  const hit = firstAvailable(facts, concepts, preferredUnit);
  if (!hit) return new Map();
  return dedupeByPeriod(
    hit.facts,
    (f) => isQuarterly(f) && isStandaloneQuarterFact(f),
  );
}

/**
 * Recover the standalone-quarter value for every (fy, end-date) pair
 * present in the input, using both standalone-quarter facts (when
 * available) and YTD-cumulative facts (when only those exist).
 *
 * EDGAR concepts vary in reporting pattern across filers:
 *   - Income statement (NetIncome, Revenue, EPS, OpInc): generally
 *     reported standalone for every quarter
 *   - Cash flow + D&A: many filers (AAPL among them) report ONLY
 *     YTD-cumulative — so Q2/Q3 standalone has to be derived as
 *     successive YTD differences
 *
 * Algorithm per fiscal year (sort end-dates ascending):
 *   - For each end date, prefer the standalone fact (60-100 day
 *     period) when present.
 *   - Otherwise take the YTD fact (longest duration, latest filed)
 *     and compute standalone = YTD − running_sum_so_far.
 *   - Update running_sum after each quarter.
 *
 * Returns a Map keyed by end-date. Q4 is NOT injected here — caller
 * uses `deriveQ4FromAnnual` for that (annual fact lives in a
 * separate map).
 */
export function extractStandaloneQuarters(
  allFacts: EdgarFact[],
): Map<string, EdgarFact> {
  // Group by fiscal year, restricting to quarterly facts with a
  // computable period duration.
  type ByEnd = { end: string; facts: EdgarFact[] };
  const byFy = new Map<number, ByEnd[]>();
  const fyEndIndex = new Map<string, ByEnd>();
  for (const f of allFacts) {
    if (f.fy === null || !f.fp || !f.fp.startsWith("Q") || !f.start) continue;
    const key = `${f.fy}|${f.end}`;
    let entry = fyEndIndex.get(key);
    if (!entry) {
      entry = { end: f.end, facts: [] };
      fyEndIndex.set(key, entry);
      const arr = byFy.get(f.fy) ?? [];
      arr.push(entry);
      byFy.set(f.fy, arr);
    }
    entry.facts.push(f);
  }

  const out = new Map<string, EdgarFact>();
  for (const [, ends] of byFy) {
    ends.sort((a, b) => a.end.localeCompare(b.end));
    let runningSum = 0;
    for (const { end, facts } of ends) {
      // Standalone first (latest filed).
      const standalone = facts
        .filter((f) => isStandaloneQuarterFact(f))
        .sort((a, b) => b.filed.localeCompare(a.filed))[0];
      if (standalone) {
        out.set(end, standalone);
        runningSum += standalone.val;
        continue;
      }
      // No standalone — derive from YTD. Pick the longest-duration
      // YTD fact (most cumulative), latest filed.
      const ytd = facts
        .slice()
        .sort((a, b) => {
          const aDays = daysBetween(a.start!, a.end);
          const bDays = daysBetween(b.start!, b.end);
          if (aDays !== bDays) return bDays - aDays;
          return b.filed.localeCompare(a.filed);
        })[0];
      if (!ytd) continue;
      const derivedVal = ytd.val - runningSum;
      out.set(end, {
        ...ytd,
        val: derivedVal,
        form: ytd.form === "10-Q" ? "10-Q (derived)" : `${ytd.form} (derived)`,
      });
      runningSum = ytd.val;
    }
  }
  return out;
}

/**
 * Companies file a 10-K (annual) for Q4, not a 10-Q — so EDGAR has
 * no standalone-Q4 fact for income/cashflow concepts. Derive it as
 * `(FY annual) − (sum of standalone Q1+Q2+Q3 within the same fy)`
 * and inject the synthetic Q4 entry at the FY end date.
 *
 * Returns a NEW map (does not mutate `quarterly`). Symbols missing
 * any of Q1/Q2/Q3 in a given fy, or missing the FY annual fact,
 * just don't get a Q4 — same passthrough as before.
 *
 * Mirror this pipeline for every flow concept (revenue, netIncome,
 * EPS, OpInc, D&A, OCF, capex, divs, buybacks). Without it, TTM at
 * dates between Q4 and the next Q1 would only see 3 standalone
 * quarters and bail out.
 */
export function deriveQ4FromAnnual(
  quarterly: Map<string, EdgarFact>,
  annual: Map<string, EdgarFact>,
): Map<string, EdgarFact> {
  const out = new Map(quarterly);
  // Group quarterly standalone facts by fiscal year for fast lookup.
  const byFy = new Map<number, EdgarFact[]>();
  for (const f of quarterly.values()) {
    if (f.fy === null) continue;
    const arr = byFy.get(f.fy) ?? [];
    arr.push(f);
    byFy.set(f.fy, arr);
  }
  for (const annualFact of annual.values()) {
    if (annualFact.fy === null) continue;
    const qs = byFy.get(annualFact.fy) ?? [];
    if (qs.length !== 3) continue;
    const fps = new Set(qs.map((q) => q.fp));
    if (!fps.has("Q1") || !fps.has("Q2") || !fps.has("Q3")) continue;
    const ytdQ3 = qs.reduce((s, q) => s + q.val, 0);
    out.set(annualFact.end, {
      end: annualFact.end,
      val: annualFact.val - ytdQ3,
      fy: annualFact.fy,
      fp: "Q4",
      form: "DERIVED",
      filed: annualFact.filed,
    });
  }
  return out;
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
