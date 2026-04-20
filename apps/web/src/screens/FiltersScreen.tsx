import type { CategoryWeights } from "@stockrank/ranking";
import { DEFAULT_WEIGHTS } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { IndustryFilter } from "../components/IndustryFilter.js";
import { WeightSliders } from "../components/WeightSliders.js";

export type FiltersScreenProps = {
  industries: string[];
  industry: string | null;
  weights: CategoryWeights;
  onIndustryChange: (next: string | null) => void;
  onWeightsChange: (next: CategoryWeights) => void;
  onBack: () => void;
};

export function FiltersScreen({
  industries,
  industry,
  weights,
  onIndustryChange,
  onWeightsChange,
  onBack,
}: FiltersScreenProps) {
  return (
    <div className="screen screen--filters">
      <AppHeader
        title="Filters &amp; Weights"
        onBack={onBack}
        right={
          <button
            type="button"
            className="screen__primary"
            onClick={onBack}
          >
            Done
          </button>
        }
      />

      <div className="screen__sections">
        <IndustryFilter
          industries={industries}
          selected={industry}
          onChange={onIndustryChange}
        />
        <WeightSliders
          weights={weights}
          onChange={onWeightsChange}
          onReset={() => onWeightsChange(DEFAULT_WEIGHTS)}
        />
      </div>
    </div>
  );
}
