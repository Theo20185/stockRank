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
  avoid: "Avoid",
  excluded: "Excluded",
};

const BUCKET_EMPTY_MESSAGES: Record<BucketKey, string> = {
  ranked:
    "No actionable buy candidates with the current filters. Stocks land here when they pass the §4 quality floor, have a fair value range, and trade below the conservative tail (p25).",
  watch:
    "No watchlist names. Stocks land here when they have a fair value range but trade at or above the conservative tail, OR carry a tracked structural flag like negative equity.",
  avoid:
    "No names in the Avoid bucket — the bottom decile of composite scores is empty for the current filters. Phase 4A long/short evidence found the bottom decile underperformed SPY by ~25 pp at 3y in COVID-era PIT data; this view surfaces those names so you can spot positions you might want to exit (or names to skip even if they look superficially cheap).",
  excluded:
    "No excluded names. Stocks land here when they failed the quality floor or have no fair value computable.",
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
        title="StockRank"
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
