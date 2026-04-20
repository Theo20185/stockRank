import type { Snapshot } from "@stockrank/core";
import type { CategoryWeights, RankedSnapshot } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { FilterChips } from "../components/FilterChips.js";
import { RankedTable } from "../components/RankedTable.js";

export type ResultsScreenProps = {
  snapshot: Snapshot;
  ranked: RankedSnapshot;
  industry: string | null;
  weights: CategoryWeights;
  tab: "composite" | "turnaround";
  onSelectTab: (tab: "composite" | "turnaround") => void;
  onSelectStock: (symbol: string) => void;
  onEditFilters: () => void;
};

export function ResultsScreen({
  snapshot,
  ranked,
  industry,
  weights,
  tab,
  onSelectTab,
  onSelectStock,
  onEditFilters,
}: ResultsScreenProps) {
  const visibleRows = industry
    ? ranked.rows.filter((r) => r.industry === industry)
    : ranked.rows;

  return (
    <div className="screen screen--results">
      <AppHeader
        title="StockRank"
        subtitle={`Snapshot ${snapshot.snapshotDate} · ${snapshot.companies.length} companies · ${ranked.rows.length} eligible`}
      />

      <nav className="app__tabs" aria-label="Sections">
        <button
          type="button"
          aria-pressed={tab === "composite"}
          onClick={() => onSelectTab("composite")}
        >
          Composite ({ranked.rows.length})
        </button>
        <button
          type="button"
          aria-pressed={tab === "turnaround"}
          onClick={() => onSelectTab("turnaround")}
        >
          Turnaround ({ranked.turnaroundWatchlist.length})
        </button>
      </nav>

      <FilterChips
        industry={industry}
        weights={weights}
        onEditFilters={onEditFilters}
      />

      <RankedTable
        rows={visibleRows}
        selectedSymbol={null}
        onSelect={onSelectStock}
      />
    </div>
  );
}
