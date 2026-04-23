/**
 * Types for the EDGAR XBRL companyfacts response.
 * Reference: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
 *
 * Each us-gaap concept has a `units` map keyed by unit (e.g. "USD",
 * "USD/shares", "shares"). Each unit holds an array of facts ordered
 * by `end` date ascending.
 */

export type EdgarFact = {
  /** ISO yyyy-mm-dd of the period end. */
  end: string;
  /** ISO yyyy-mm-dd of the period start (only for flow concepts). */
  start?: string;
  /** Raw value as filed (no unit conversion). */
  val: number;
  /** Fiscal year, may be null on rare entries. */
  fy: number | null;
  /** Fiscal period: "FY" | "Q1" | "Q2" | "Q3" | "Q4" — null on rare entries. */
  fp: string | null;
  /** SEC form (e.g. "10-K", "10-Q", "10-K/A"). */
  form: string;
  /** ISO yyyy-mm-dd the fact was filed (drives latest-restatement dedupe). */
  filed: string;
  frame?: string;
  accn?: string;
};

export type EdgarConceptUnits = Record<string, EdgarFact[]>;

export type EdgarConcept = {
  label?: string;
  description?: string;
  units: EdgarConceptUnits;
};

export type EdgarFactsByConcept = Record<string, EdgarConcept>;

export type EdgarCompanyFacts = {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: EdgarFactsByConcept;
    dei?: EdgarFactsByConcept;
  };
};
