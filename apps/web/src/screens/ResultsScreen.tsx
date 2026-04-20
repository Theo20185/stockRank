import { useMemo, useState } from "react";
import type { Snapshot } from "@stockrank/core";
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
  tab: "composite" | "turnaround";
  onSelectTab: (tab: "composite" | "turnaround") => void;
  onSelectStock: (symbol: string) => void;
  onEditFilters: () => void;
};

const BUCKET_LABELS: Record<BucketKey, string> = {
  ranked: "Ranked",
  watch: "Watch",
  excluded: "Excluded",
};

const BUCKET_EMPTY_MESSAGES: Record<BucketKey, string> = {
  ranked:
    "No actionable buy candidates with the current filters. Quality and fair-value data must be complete and the stock must trade below fair value.",
  watch:
    "No watchlist names. Stocks land here when they're above fair value or missing one of {quality score, P/B, ROIC}.",
  excluded:
    "No excluded names. Stocks land here when they're missing two or more of {quality score, P/B, ROIC}, or have no fair value.",
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
  const [bucket, setBucket] = useState<BucketKey>("ranked");

  const visibleRows = useMemo(
    () => (industry ? ranked.rows.filter((r) => r.industry === industry) : ranked.rows),
    [ranked.rows, industry],
  );

  const buckets = useMemo(() => bucketRows(visibleRows), [visibleRows]);

  const activeRows = buckets[bucket];

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
        />
      )}
    </div>
  );
}
