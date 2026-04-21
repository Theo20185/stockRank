import { useMemo, useState } from "react";
import type { OptionsSummary, Snapshot } from "@stockrank/core";
import {
  bucketRows,
  type BucketKey,
  type CategoryWeights,
  type RankedSnapshot,
} from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { FilterChips } from "../components/FilterChips.js";
import { RankedTable } from "../components/RankedTable.js";

export type ResultsScreenProps = {
  snapshot: Snapshot;
  ranked: RankedSnapshot;
  industry: string | null;
  weights: CategoryWeights;
  optionsSummary?: OptionsSummary | null;
  tab: "composite" | "turnaround";
  onSelectTab: (tab: "composite" | "turnaround") => void;
  onSelectStock: (symbol: string) => void;
  onEditFilters: () => void;
};

const BUCKET_LABELS: Record<BucketKey, string> = {
  ranked: "Candidates",
  watch: "Watch",
  excluded: "Excluded",
};

const BUCKET_EMPTY_MESSAGES: Record<BucketKey, string> = {
  ranked:
    "No actionable buy candidates with the current filters. Stocks land here when all 5 category scores compute, fair value is below conservative tail, and the options chain is liquid.",
  watch:
    "No watchlist names. Stocks land here when they're above the conservative-tail fair value, missing exactly one category score, or carry a structural flag (negative equity, illiquid options).",
  excluded:
    "No excluded names. Stocks land here when they failed the quality floor, are missing two or more category scores, or have no fair value computable.",
};

export function ResultsScreen({
  snapshot,
  ranked,
  industry,
  weights,
  optionsSummary,
  tab,
  onSelectTab,
  onSelectStock,
  onEditFilters,
}: ResultsScreenProps) {
  const [bucket, setBucket] = useState<BucketKey>("ranked");

  // Combine eligible + ineligible — every name in the universe lives
  // in exactly one bucket. Ineligible names will sort to Excluded
  // automatically (5 missing category scores).
  const allRows = useMemo(
    () => [...ranked.rows, ...ranked.ineligibleRows],
    [ranked.rows, ranked.ineligibleRows],
  );

  const visibleRows = useMemo(
    () => (industry ? allRows.filter((r) => r.industry === industry) : allRows),
    [allRows, industry],
  );

  const buckets = useMemo(() => bucketRows(visibleRows), [visibleRows]);

  const activeRows = buckets[bucket];

  return (
    <div className="screen screen--results">
      <AppHeader
        title="📈 StockRank"
        subtitle={`Snapshot ${snapshot.snapshotDate} · ${snapshot.companies.length} companies`}
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

      <nav className="app__subtabs" aria-label="Quality buckets">
        {(Object.keys(BUCKET_LABELS) as BucketKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={bucket === key}
            onClick={() => setBucket(key)}
          >
            {BUCKET_LABELS[key]} ({buckets[key].length})
          </button>
        ))}
      </nav>

      {activeRows.length === 0 ? (
        <p className="screen__bucket-empty" role="status">
          {BUCKET_EMPTY_MESSAGES[bucket]}
        </p>
      ) : (
        <RankedTable
          rows={activeRows}
          selectedSymbol={null}
          onSelect={onSelectStock}
          optionsSummary={optionsSummary ?? null}
        />
      )}
    </div>
  );
}
