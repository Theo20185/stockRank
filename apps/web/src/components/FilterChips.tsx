import type { CategoryWeights } from "@stockrank/ranking";

export type FilterChipsProps = {
  industry: string | null;
  weights: CategoryWeights;
  onEditFilters: () => void;
};

function weightSummary(w: CategoryWeights): string {
  // Compact "V35 H25 Q15 SR15 G10" — meant to glance, not parse precisely.
  const pct = (n: number) => Math.round(n * 100);
  return `V${pct(w.valuation)} H${pct(w.health)} Q${pct(w.quality)} SR${pct(w.shareholderReturn)} G${pct(w.growth)}`;
}

export function FilterChips({ industry, weights, onEditFilters }: FilterChipsProps) {
  return (
    <div className="filter-chips" role="group" aria-label="Active filters">
      <button
        type="button"
        className="filter-chip"
        onClick={onEditFilters}
      >
        <span className="filter-chip__label">Industry</span>
        <span className="filter-chip__value">{industry ?? "All"}</span>
        <span className="filter-chip__chev" aria-hidden>›</span>
      </button>
      <button
        type="button"
        className="filter-chip filter-chip--mono"
        onClick={onEditFilters}
      >
        <span className="filter-chip__label">Weights</span>
        <span className="filter-chip__value">{weightSummary(weights)}</span>
        <span className="filter-chip__chev" aria-hidden>›</span>
      </button>
    </div>
  );
}
