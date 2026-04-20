import type { CompanySnapshot } from "@stockrank/core";

const MIN_COHORT_SIZE = 8;

export type CohortResolver = (company: CompanySnapshot) => CompanySnapshot[];

/**
 * Builds a cohort resolver with the ranking.md §3.2 fallback rule: use the
 * company's industry group when it has ≥ MIN_COHORT_SIZE peers; otherwise
 * widen to sector; otherwise widen to the full universe.
 *
 * The returned cohort always includes the company itself (callers decide
 * whether to exclude it).
 */
export function buildCohortResolver(
  universe: CompanySnapshot[],
): CohortResolver {
  const byIndustry = new Map<string, CompanySnapshot[]>();
  const bySector = new Map<string, CompanySnapshot[]>();
  for (const c of universe) {
    const iArr = byIndustry.get(c.industry) ?? [];
    iArr.push(c);
    byIndustry.set(c.industry, iArr);
    const sArr = bySector.get(c.sector) ?? [];
    sArr.push(c);
    bySector.set(c.sector, sArr);
  }

  return (company: CompanySnapshot): CompanySnapshot[] => {
    const industryPeers = byIndustry.get(company.industry) ?? [];
    if (industryPeers.length >= MIN_COHORT_SIZE) return industryPeers;
    const sectorPeers = bySector.get(company.sector) ?? [];
    if (sectorPeers.length >= MIN_COHORT_SIZE) return sectorPeers;
    return universe;
  };
}

/**
 * Groups companies by their industry group — used for computing
 * within-industry rank (ranking.md §2 question 1 and §8.5).
 *
 * Unlike cohort resolution, industry grouping does NOT widen to sector —
 * "industry rank" is always "rank within my industry group", even if the
 * group is small.
 */
export function groupByIndustry(
  companies: CompanySnapshot[],
): Map<string, CompanySnapshot[]> {
  const groups = new Map<string, CompanySnapshot[]>();
  for (const c of companies) {
    const arr = groups.get(c.industry) ?? [];
    arr.push(c);
    groups.set(c.industry, arr);
  }
  return groups;
}
