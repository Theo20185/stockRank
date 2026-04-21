import type { CompanySnapshot } from "@stockrank/core";
import { percentRank } from "./percentile.js";
import { FACTORS } from "./factors.js";
import type { FactorDef } from "./factors.js";
import { buildFloorContext, checkQualityFloor } from "./floor.js";
import { evaluateTurnaround } from "./turnaround.js";
import { buildCohortResolver, groupByIndustry } from "./cohort.js";
import { normalizeWeights } from "./weights.js";
import type {
  CategoryKey,
  CategoryScores,
  FactorContribution,
  FactorKey,
  RankedRow,
  RankedSnapshot,
  RankInput,
  TurnaroundRow,
} from "./types.js";

/**
 * Main ranking entry point. Pure function — no clock, no I/O, no state.
 * `(snapshot, weights) → rankedSnapshot` per PLAN.md §3.2.
 */
export function rank(input: RankInput): RankedSnapshot {
  const weights = normalizeWeights(input.weights ?? {});
  const universe = input.companies;
  const floorContext = buildFloorContext(universe);

  // 1. Partition: eligible names go to the main composite, failures go to
  //    the turnaround check.
  const eligible: CompanySnapshot[] = [];
  const ineligible: CompanySnapshot[] = [];
  for (const c of universe) {
    const floor = checkQualityFloor(c, floorContext);
    (floor.passed ? eligible : ineligible).push(c);
  }

  // 2. Percentiles are computed within each eligible company's cohort
  //    (industry group, with sector/universe fallback for small groups).
  const cohortResolver = buildCohortResolver(eligible);

  // 3. Per-company factor contributions.
  const rowsRaw: Array<{
    company: CompanySnapshot;
    factors: FactorContribution[];
    categoryScores: CategoryScores;
    composite: number;
  }> = [];

  for (const company of eligible) {
    const cohort = cohortResolver(company);
    const factors = computeFactorContributions(company, cohort);
    const categoryScores = computeCategoryScores(factors);
    const composite = computeComposite(categoryScores, weights);
    rowsRaw.push({ company, factors, categoryScores, composite });
  }

  // 4. Within-industry rank (always uses the narrow industry group).
  const industryGroups = groupByIndustry(eligible);
  const industryRanks = new Map<string, number>();
  for (const [, group] of industryGroups) {
    const sorted = [...group]
      .map((c) => {
        const r = rowsRaw.find((x) => x.company.symbol === c.symbol)!;
        return { symbol: c.symbol, composite: r.composite, quality: r.categoryScores.quality, shr: r.categoryScores.shareholderReturn, mcap: c.marketCap };
      })
      .sort(tieBreakDescending);
    sorted.forEach((row, idx) => industryRanks.set(row.symbol, idx + 1));
  }

  // 5. Universe rank.
  const universeSorted = [...rowsRaw]
    .map((r) => ({
      symbol: r.company.symbol,
      composite: r.composite,
      quality: r.categoryScores.quality,
      shr: r.categoryScores.shareholderReturn,
      mcap: r.company.marketCap,
    }))
    .sort(tieBreakDescending);
  const universeRanks = new Map<string, number>();
  universeSorted.forEach((row, idx) => universeRanks.set(row.symbol, idx + 1));

  // 6. Assemble rows.
  const rows: RankedRow[] = rowsRaw
    .map((r) => assembleRow(r, industryRanks, universeRanks))
    .sort((a, b) => a.universeRank - b.universeRank);

  // 7. Turnaround watchlist from ineligible set.
  const turnaroundWatchlist: TurnaroundRow[] = [];
  for (const c of ineligible) {
    const t = evaluateTurnaround(c);
    if (t) turnaroundWatchlist.push(t);
  }
  turnaroundWatchlist.sort((a, b) => b.pctOffYearHigh - a.pctOffYearHigh);

  return {
    snapshotDate: input.snapshotDate,
    weights,
    universeSize: eligible.length,
    excludedCount: ineligible.length,
    rows,
    turnaroundWatchlist,
  };
}

type SortableRow = {
  symbol: string;
  composite: number;
  quality: number | null;
  shr: number | null;
  mcap: number;
};

function tieBreakDescending(a: SortableRow, b: SortableRow): number {
  if (b.composite !== a.composite) return b.composite - a.composite;
  const aq = a.quality ?? -Infinity;
  const bq = b.quality ?? -Infinity;
  if (bq !== aq) return bq - aq;
  const ashr = a.shr ?? -Infinity;
  const bshr = b.shr ?? -Infinity;
  if (bshr !== ashr) return bshr - ashr;
  if (b.mcap !== a.mcap) return b.mcap - a.mcap;
  return a.symbol.localeCompare(b.symbol);
}

function winsorize(values: number[]): number[] {
  if (values.length < 3) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lowIdx = Math.floor(sorted.length * 0.05);
  const highIdx = Math.ceil(sorted.length * 0.95) - 1;
  const low = sorted[lowIdx]!;
  const high = sorted[Math.max(lowIdx, highIdx)]!;
  return values.map((v) => (v < low ? low : v > high ? high : v));
}

function computeFactorContributions(
  company: CompanySnapshot,
  cohort: CompanySnapshot[],
): FactorContribution[] {
  const contributions: FactorContribution[] = [];
  for (const factor of FACTORS) {
    const own = factor.extract(company);
    if (own === null) {
      contributions.push({
        key: factor.key,
        category: factor.category,
        rawValue: null,
        percentile: null,
      });
      continue;
    }
    const peerValues = cohort
      .map((c) => factor.extract(c))
      .filter((v): v is number => v !== null);

    if (peerValues.length < 2) {
      contributions.push({
        key: factor.key,
        category: factor.category,
        rawValue: own,
        percentile: 50,
      });
      continue;
    }

    const clipped = winsorize(peerValues);
    const pct = percentRank(own, clipped);
    const directed = factor.direction === "lower" ? 100 - pct : pct;
    contributions.push({
      key: factor.key,
      category: factor.category,
      rawValue: own,
      percentile: directed,
    });
  }
  return contributions;
}

function computeCategoryScores(
  factors: FactorContribution[],
): CategoryScores {
  const categories: CategoryKey[] = [
    "valuation",
    "health",
    "quality",
    "shareholderReturn",
    "growth",
  ];
  const scores: CategoryScores = {
    valuation: null,
    health: null,
    quality: null,
    shareholderReturn: null,
    growth: null,
  };

  for (const cat of categories) {
    const inCat = factors.filter(
      (f) => f.category === cat && f.percentile !== null,
    );
    if (inCat.length === 0) {
      scores[cat] = null;
      continue;
    }
    const sum = inCat.reduce((acc, f) => acc + (f.percentile ?? 0), 0);
    scores[cat] = sum / inCat.length;
  }

  return scores;
}

function computeComposite(
  scores: CategoryScores,
  weights: Record<CategoryKey, number>,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const cat of Object.keys(weights) as CategoryKey[]) {
    const s = scores[cat];
    if (s === null) continue;
    numerator += s * weights[cat];
    denominator += weights[cat];
  }
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function assembleRow(
  raw: {
    company: CompanySnapshot;
    factors: FactorContribution[];
    categoryScores: CategoryScores;
    composite: number;
  },
  industryRanks: Map<string, number>,
  universeRanks: Map<string, number>,
): RankedRow {
  const missing: FactorKey[] = raw.factors
    .filter((f) => f.percentile === null)
    .map((f) => f.key);

  const equity = raw.company.annual[0]?.balance.totalEquity ?? null;
  const negativeEquity = equity !== null && equity < 0;

  return {
    symbol: raw.company.symbol,
    name: raw.company.name,
    sector: raw.company.sector,
    industry: raw.company.industry,
    marketCap: raw.company.marketCap,
    price: raw.company.quote.price,
    composite: raw.composite,
    industryRank: industryRanks.get(raw.company.symbol) ?? 0,
    universeRank: universeRanks.get(raw.company.symbol) ?? 0,
    pctOffYearHigh: raw.company.pctOffYearHigh,
    categoryScores: raw.categoryScores,
    factorDetails: raw.factors,
    missingFactors: missing,
    fairValue: null,
    negativeEquity,
    // Default true; the web layer flips this to false when the loaded
    // options-summary doesn't have both call and put data for the symbol.
    optionsLiquid: true,
  };
}
