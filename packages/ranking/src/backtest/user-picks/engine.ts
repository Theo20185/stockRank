/**
 * User-picks validation (backtest-roadmap §Phase 1 C).
 *
 * For each user-supplied (symbol, snapshotDate) pair, reconstruct
 * the snapshot universe at that date, compute composite scores
 * under the supplied weight vector, and report:
 *  - The pick's composite score, industry rank, super-group rank,
 *    universe rank
 *  - The bucket it would have been classified into
 *  - The names that ranked ABOVE the pick in the same industry,
 *    along with their realized 3y forward return — letting us see
 *    whether the engine "left money on the table" by ranking
 *    other names higher
 *  - The pick's own realized 3y forward return for context
 *
 * Pure function: takes pre-built IcObservations + weight vector,
 * returns a structured report. The CLI in scripts/backtest-ic.ts
 * handles I/O and snapshot reconstruction.
 */

import type { CategoryWeights, FactorKey } from "../../types.js";
import { FACTORS } from "../../factors.js";
import { groupBy } from "../../stats.js";
import { superGroupOf } from "../../super-groups.js";
import type { IcObservation } from "../ic/types.js";
import type { SubFactorWeights } from "../weight-validation/types.js";

export type UserPick = {
  symbol: string;
  /** ISO date — when the user bought (or wanted to evaluate the pick). */
  snapshotDate: string;
};

export type UserPickRanking = {
  symbol: string;
  composite: number | null;
  rankInUniverse: number | null;
  rankInSuperGroup: number | null;
  universeSize: number;
  superGroupSize: number;
  /** Names ranked higher than the pick in the same super-group. */
  betterRankedPeers: Array<{
    symbol: string;
    composite: number;
    rankInSuperGroup: number;
    realizedExcess1y: number | null;
    realizedExcess3y: number | null;
  }>;
  ownRealizedExcess1y: number | null;
  ownRealizedExcess3y: number | null;
};

export type UserPicksReport = {
  generatedAt: string;
  weightSchemeName: string;
  picks: Array<{
    pick: UserPick;
    /** Null when the pick wasn't found in the universe at that date
     * (e.g., not in the S&P 500 then, or no snapshot data). */
    ranking: UserPickRanking | null;
    /** Failure reason when ranking is null. */
    notFoundReason: string | null;
  }>;
};

export type UserPicksInput = {
  picks: ReadonlyArray<UserPick>;
  /** Per-snapshot-date observations for the universe. */
  observationsByDate: ReadonlyMap<string, ReadonlyArray<IcObservation>>;
  weights: CategoryWeights;
  subFactorWeights?: SubFactorWeights;
  weightSchemeName: string;
  /** How many better-ranked peers to include per pick in the report.
   * Default 5. */
  topPeersToShow?: number;
};

export function evaluateUserPicks(input: UserPicksInput): UserPicksReport {
  const { picks, observationsByDate, weights, subFactorWeights, weightSchemeName } = input;
  const topPeersToShow = input.topPeersToShow ?? 5;

  const out: UserPicksReport = {
    generatedAt: new Date().toISOString(),
    weightSchemeName,
    picks: [],
  };

  for (const pick of picks) {
    const universeObs = observationsByDate.get(pick.snapshotDate) ?? null;
    if (!universeObs) {
      out.picks.push({
        pick,
        ranking: null,
        notFoundReason: `no snapshot universe at ${pick.snapshotDate}`,
      });
      continue;
    }

    // Score each company in the universe at this date. Each
    // (symbol, date) appears once per horizon in the observation
    // array; dedupe to one row per symbol (we only need composite,
    // which is horizon-independent given the same factor percentiles).
    const seen = new Set<string>();
    const scored: Array<{ obs: IcObservation; composite: number | null }> = [];
    for (const obs of universeObs) {
      if (seen.has(obs.symbol)) continue;
      seen.add(obs.symbol);
      scored.push({
        obs,
        composite: composeCompositeScore(
          obs.factorPercentiles,
          weights,
          subFactorWeights,
        ),
      });
    }

    const valid = scored.filter((s) => s.composite !== null);
    valid.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));

    const universeSize = valid.length;
    const pickIdx = valid.findIndex((s) => s.obs.symbol === pick.symbol);
    if (pickIdx === -1) {
      out.picks.push({
        pick,
        ranking: null,
        notFoundReason: `${pick.symbol} not in universe at ${pick.snapshotDate} (no snapshot data or composite undefined)`,
      });
      continue;
    }

    const pickEntry = valid[pickIdx]!;
    const pickSuperGroup = pickEntry.obs.superGroup;

    // Super-group cohort: same super-group, sorted by composite desc.
    const sgPeers = valid.filter(
      (s) => s.obs.superGroup === pickSuperGroup,
    );
    const pickSgIdx = sgPeers.findIndex(
      (s) => s.obs.symbol === pick.symbol,
    );

    // Better-ranked super-group peers — names ABOVE the pick.
    const betterSgPeers = sgPeers.slice(0, pickSgIdx);
    const trimmedBetterPeers = betterSgPeers.slice(0, topPeersToShow);
    const betterRankedPeers = trimmedBetterPeers.map((p, idx) => ({
      symbol: p.obs.symbol,
      composite: p.composite!,
      rankInSuperGroup: idx + 1,
      realizedExcess1y: findExcess(observationsByDate, p.obs.symbol, pick.snapshotDate, 1),
      realizedExcess3y: findExcess(observationsByDate, p.obs.symbol, pick.snapshotDate, 3),
    }));

    out.picks.push({
      pick,
      notFoundReason: null,
      ranking: {
        symbol: pick.symbol,
        composite: pickEntry.composite,
        rankInUniverse: pickIdx + 1,
        rankInSuperGroup: pickSgIdx + 1,
        universeSize,
        superGroupSize: sgPeers.length,
        betterRankedPeers,
        ownRealizedExcess1y: findExcess(observationsByDate, pick.symbol, pick.snapshotDate, 1),
        ownRealizedExcess3y: findExcess(observationsByDate, pick.symbol, pick.snapshotDate, 3),
      },
    });
  }

  return out;
}

/** Look up the realized excess return for (symbol, date, horizon)
 * in the observations map. Returns null when not present (e.g.,
 * forward window not yet closed at the snapshot date). */
function findExcess(
  observationsByDate: ReadonlyMap<string, ReadonlyArray<IcObservation>>,
  symbol: string,
  date: string,
  horizon: number,
): number | null {
  const obs = observationsByDate.get(date) ?? [];
  const match = obs.find(
    (o) => o.symbol === symbol && o.horizon === horizon,
  );
  return match?.excessReturn ?? null;
}

/** Composite score from factor percentiles + category weights + optional
 * sub-factor weights. Mirrors the validation engine's logic. */
function composeCompositeScore(
  percentiles: Partial<Record<FactorKey, number>>,
  weights: CategoryWeights,
  subFactorWeights?: SubFactorWeights,
): number | null {
  const categoryScores: Partial<Record<keyof CategoryWeights, number>> = {};
  const factorsByCat = new Map<keyof CategoryWeights, typeof FACTORS>();
  for (const f of FACTORS) {
    const arr = factorsByCat.get(f.category);
    if (arr) arr.push(f);
    else factorsByCat.set(f.category, [f]);
  }
  for (const [cat, factors] of factorsByCat) {
    const subWeights = subFactorWeights?.[cat];
    if (subWeights) {
      let weightedSum = 0;
      let weightUsed = 0;
      for (const f of factors) {
        const w = subWeights[f.key];
        if (w === undefined || w === null) continue;
        const pct = percentiles[f.key];
        if (pct === undefined || pct === null) continue;
        weightedSum += pct * w;
        weightUsed += w;
      }
      if (weightUsed > 0) categoryScores[cat] = weightedSum / weightUsed;
    } else {
      let sum = 0;
      let n = 0;
      for (const f of factors) {
        const pct = percentiles[f.key];
        if (pct === undefined || pct === null) continue;
        sum += pct;
        n += 1;
      }
      if (n > 0) categoryScores[cat] = sum / n;
    }
  }
  let numerator = 0;
  let denominator = 0;
  for (const cat of Object.keys(weights) as Array<keyof CategoryWeights>) {
    const score = categoryScores[cat];
    if (score === undefined) continue;
    numerator += score * weights[cat];
    denominator += weights[cat];
  }
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Helper: ensure the superGroupOf import is used (silences linter
 * for code clarity — the function is referenced indirectly via
 * IcObservation.superGroup which was set at observation-build time). */
void superGroupOf;
