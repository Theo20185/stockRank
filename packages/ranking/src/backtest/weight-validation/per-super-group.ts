/**
 * Per-super-group weight-validation engine (Phase 3 — step 2 of the
 * `ranking.md` §11.5 preset adoption process).
 *
 * For each candidate preset:
 *   1. Filter observations to the preset's target super-group.
 *   2. Run the standard weight-validation against [default, preset]
 *      on that filtered universe — top-decile selection is within
 *      the super-group, NOT the full universe.
 *   3. Apply the §3.11.1 adoption rule per super-group.
 *
 * Adoption rule (per roadmap §Phase 3 E): a per-super-group preset
 * is adopted only if it passes the §3.11.1 rule (≥ 1%/yr × 3y excess
 * vs default, CI not crossing zero) in at least 2 of N PIT regimes.
 * This module returns the per-regime verdicts; the caller stacks
 * them across regimes and applies the 2-of-N rule.
 */

import { runWeightValidation, type WeightValidationOptions } from "./engine.js";
import type { CategoryWeights } from "../../types.js";
import type { SuperGroupKey } from "../../super-groups.js";
import type { IcObservation } from "../ic/types.js";
import type {
  AdoptionVerdict,
  SubFactorWeights,
  WeightValidationReport,
} from "./types.js";

export type PerSuperGroupPreset = {
  /** Stable name for the report. */
  name: string;
  /** Optional human description. */
  description?: string;
  /** Source label — typically "ic-derived". */
  source?: string;
  /** Which super-group this preset applies to. */
  targetSuperGroup: SuperGroupKey;
  /** Category weights for the preset. */
  weights: CategoryWeights;
  /** Optional within-category sub-factor weights. */
  subFactorWeights?: SubFactorWeights;
};

export type PerSuperGroupResult = {
  preset: PerSuperGroupPreset;
  /** Number of observations in the super-group cohort. */
  cohortSize: number;
  /** The default-vs-preset validation report on the filtered cohort. */
  report: WeightValidationReport;
  /** Adoption verdict from the report (preset vs default in this regime). */
  verdict: AdoptionVerdict | null;
};

export type PerSuperGroupValidationReport = {
  generatedAt: string;
  testPeriodStart: string;
  results: PerSuperGroupResult[];
};

/**
 * Run per-super-group validation for each preset against its target
 * super-group's universe. Returns a structured report; caller applies
 * the cross-regime adoption rule.
 */
export function runPerSuperGroupValidation(
  observations: IcObservation[],
  presets: ReadonlyArray<PerSuperGroupPreset>,
  options: WeightValidationOptions,
  defaultWeights: CategoryWeights,
): PerSuperGroupValidationReport {
  const results: PerSuperGroupResult[] = [];
  for (const preset of presets) {
    const cohortObs = observations.filter(
      (o) => o.superGroup === preset.targetSuperGroup,
    );
    const report = runWeightValidation(
      cohortObs,
      [
        {
          name: "default",
          description: `Default value-deep applied to ${preset.targetSuperGroup} cohort`,
          source: "default",
          weights: { ...defaultWeights },
        },
        {
          name: preset.name,
          ...(preset.description ? { description: preset.description } : {}),
          source: preset.source ?? "ic-derived",
          weights: preset.weights,
          ...(preset.subFactorWeights
            ? { subFactorWeights: preset.subFactorWeights }
            : {}),
        },
      ],
      options,
    );
    const verdict = report.verdicts.find((v) => v.candidateName === preset.name) ?? null;
    results.push({
      preset,
      cohortSize: cohortObs.length,
      report,
      verdict,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    testPeriodStart: options.testPeriodStart,
    results,
  };
}
