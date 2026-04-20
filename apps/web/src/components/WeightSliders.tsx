import type { CategoryKey, CategoryWeights } from "@stockrank/ranking";

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  valuation: "Valuation",
  health: "Health",
  quality: "Quality",
  shareholderReturn: "Shareholder Return",
  growth: "Growth",
};

const CATEGORY_ORDER: CategoryKey[] = [
  "valuation",
  "health",
  "quality",
  "shareholderReturn",
  "growth",
];

export type WeightSlidersProps = {
  weights: CategoryWeights;
  onChange: (next: CategoryWeights) => void;
  onReset: () => void;
};

export function WeightSliders({ weights, onChange, onReset }: WeightSlidersProps) {
  return (
    <section aria-label="Category weights" className="weight-sliders">
      <header className="weight-sliders__header">
        <h2>Category weights</h2>
        <button type="button" onClick={onReset}>Reset to defaults</button>
      </header>
      {CATEGORY_ORDER.map((cat) => {
        const value = Math.round(weights[cat] * 100);
        return (
          <label key={cat} className="weight-slider">
            <span className="weight-slider__label">{CATEGORY_LABELS[cat]}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={value}
              aria-label={`${CATEGORY_LABELS[cat]} weight`}
              onChange={(e) => {
                const pct = Number.parseInt(e.target.value, 10);
                onChange({ ...weights, [cat]: pct / 100 });
              }}
            />
            <span className="weight-slider__value" aria-live="polite">
              {value}%
            </span>
          </label>
        );
      })}
    </section>
  );
}
