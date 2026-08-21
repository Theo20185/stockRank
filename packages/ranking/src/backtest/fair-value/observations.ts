/**
 * Build FvObservation rows from per-date snapshot universes + forward
 * returns. Pure function — caller sources snapshots (the PIT
 * synthesize path) and forward/SPY returns, exactly as the IC
 * pipeline's observation builder does.
 *
 * Per (snapshotDate, company):
 *   1. fairValueFor(company, universe) → band + flags (the production
 *      engine, including the outlier + divergence rules as shipped).
 *   2. Peer-premium ratio from the same cohort the engine used.
 *   3. deepCyclical flag (pre-declared H4 stratum, 2026-08-20).
 *   4. One row per horizon with a complete forward window.
 *
 * Rows where the engine throws are counted (engineErrorRows), not
 * silently dropped. Rows with no band are kept with belowP25 = null —
 * H1 reports them as a third bucket.
 */

import type { CompanySnapshot } from "@stockrank/core";
import { fairValueFor } from "../../fair-value/index.js";
import { buildFairValueCohort } from "../../fair-value/cohort.js";
import { deriveTtm, median } from "../../fair-value/anchors.js";
import { superGroupOf } from "../../super-groups.js";
import type { FvObservation } from "./types.js";

export type FvObservationsInput = {
  snapshotsByDate: ReadonlyMap<string, CompanySnapshot[]>;
  /** Outer key: snapshotDate. Inner key: `${symbol}|${horizon}`.
   * TOTAL-RETURN basis. */
  forwardReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** SPY forward return per (snapshotDate, horizon-as-string). */
  spyReturnsByDate: ReadonlyMap<string, ReadonlyMap<string, number>>;
  horizons: readonly number[];
  /**
   * PIT industry-membership stress mode: rewrite every company's
   * industry to its super-group key before running the engine, so
   * cohorts form at super-group granularity. Super-group membership
   * is far stickier than sub-industry, so H1 stability under this
   * coarsening bounds the today's-industry-classification exposure.
   */
  coarseCohort?: boolean;
};

export type FvObservationsResult = {
  observations: FvObservation[];
  engineErrorRows: number;
};

export function buildFvObservations(
  input: FvObservationsInput,
): FvObservationsResult {
  const {
    snapshotsByDate,
    forwardReturnsByDate,
    spyReturnsByDate,
    horizons,
    coarseCohort = false,
  } = input;

  const observations: FvObservation[] = [];
  let engineErrorRows = 0;

  for (const [date, rawUniverse] of snapshotsByDate) {
    const spyAtDate = spyReturnsByDate.get(date);
    const fwdAtDate = forwardReturnsByDate.get(date);
    if (!spyAtDate || !fwdAtDate) continue;

    const universe = coarseCohort
      ? rawUniverse.map((c) => ({
          ...c,
          industry: superGroupOf(c.industry) ?? c.industry,
        }))
      : rawUniverse;

    const snapshotYear = parseInt(date.slice(0, 4), 10);
    for (const c of universe) {
      // Which horizons have a complete forward window for this row?
      const horizonReturns: Array<{ horizon: number; excess: number }> = [];
      for (const h of horizons) {
        const fwd = fwdAtDate.get(`${c.symbol}|${h}`);
        const spy = spyAtDate.get(String(h));
        if (fwd === undefined || spy === undefined) continue;
        horizonReturns.push({ horizon: h, excess: fwd - spy });
      }
      if (horizonReturns.length === 0) continue;

      let fvRow: FvObservation["fv"];
      let premiumDirected: number | null = null;
      try {
        const fv = fairValueFor(c, universe);
        const anchorCount = Object.values(fv.anchors).filter(
          (v): v is number => v !== null && v > 0,
        ).length;
        fvRow = {
          p25: fv.range?.p25 ?? null,
          median: fv.range?.median ?? null,
          p75: fv.range?.p75 ?? null,
          belowP25: fv.range ? c.quote.price < fv.range.p25 : null,
          upsideToP25Pct: fv.upsideToP25Pct,
          confidence: fv.confidence,
          peerCohortDivergent: fv.peerCohortDivergent,
          peerSet: fv.peerSet,
          anchorCount,
          anchors: fv.anchors,
          anchorsPre: fv.anchorsBeforeDivergenceFilter,
          ttmTreatment: fv.ttmTreatment,
        };
        // Peer premium from the same cohort construction the engine
        // used (production cohort rules; excludes the subject).
        const cohort = buildFairValueCohort(c, universe);
        const peerPes = cohort.peers
          .map((p) => p.ttm.peRatio)
          .filter((v): v is number => v !== null && v > 0);
        const peerMedianPe = median(peerPes);
        const ownPe = c.ttm.peRatio;
        premiumDirected =
          peerMedianPe !== null && peerMedianPe > 0 && ownPe !== null && ownPe > 0
            ? peerMedianPe / ownPe
            : null;
      } catch {
        engineErrorRows += horizonReturns.length;
        continue;
      }

      const windowEps = c.annual
        .slice(1, 4)
        .map((p) => p.income.epsDiluted)
        .filter((v): v is number => v !== null);
      const ttmEps = deriveTtm(c).eps;
      const deepCyclical =
        windowEps.some((v) => v <= 0) && ttmEps !== null && ttmEps > 0;

      for (const { horizon, excess } of horizonReturns) {
        observations.push({
          symbol: c.symbol,
          snapshotDate: date,
          snapshotYear,
          superGroup: superGroupOf(c.industry),
          horizon,
          excessReturn: excess,
          price: c.quote.price,
          fv: fvRow,
          peerPremiumRatioDirected: premiumDirected,
          peerPremiumRatioSymmetric:
            premiumDirected !== null
              ? Math.max(premiumDirected, 1 / premiumDirected)
              : null,
          deepCyclical,
        });
      }
    }
  }

  return { observations, engineErrorRows };
}

/**
 * Downsample a daily (or denser) close series to weekly closes —
 * last bar of each ISO week. H3's declared convergence resolution.
 * Input must be date-ascending; output preserves order.
 */
export function downsampleWeekly(
  bars: ReadonlyArray<{ date: string; close: number }>,
): Array<{ date: string; close: number }> {
  const out: Array<{ date: string; close: number }> = [];
  let currentWeek: string | null = null;
  for (const bar of bars) {
    const week = isoWeekKey(bar.date);
    if (week === currentWeek && out.length > 0) {
      out[out.length - 1] = bar;
    } else {
      out.push(bar);
      currentWeek = week;
    }
  }
  return out;
}

function isoWeekKey(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  // Shift to Thursday of the same ISO week, then take year + week no.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}
