import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@stockrank/core";
import {
  rank,
  fairValueFor,
  DEFAULT_WEIGHTS,
  type CategoryWeights,
  type RankedRow,
} from "@stockrank/ranking";
import { loadSnapshot } from "./snapshot/loader.js";
import { WeightSliders } from "./components/WeightSliders.js";
import { IndustryFilter } from "./components/IndustryFilter.js";
import { RankedTable } from "./components/RankedTable.js";
import { DrillDownPanel } from "./components/DrillDownPanel.js";
import { TurnaroundList } from "./components/TurnaroundList.js";

type Tab = "composite" | "turnaround";

export type AppProps = {
  /** Provided in tests; real app fetches via loadSnapshot at mount. */
  initialSnapshot?: Snapshot;
};

export function App({ initialSnapshot }: AppProps = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(
    initialSnapshot ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<CategoryWeights>(DEFAULT_WEIGHTS);
  const [industry, setIndustry] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("composite");

  useEffect(() => {
    if (initialSnapshot) return;
    let cancelled = false;
    loadSnapshot()
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialSnapshot]);

  const ranked = useMemo(() => {
    if (!snapshot) return null;
    const result = rank({
      companies: snapshot.companies,
      snapshotDate: snapshot.snapshotDate,
      weights,
    });
    for (const row of result.rows) {
      const company = snapshot.companies.find((c) => c.symbol === row.symbol);
      if (company) row.fairValue = fairValueFor(company, snapshot.companies);
    }
    for (const row of result.turnaroundWatchlist) {
      const company = snapshot.companies.find((c) => c.symbol === row.symbol);
      if (company) row.fairValue = fairValueFor(company, snapshot.companies);
    }
    return result;
  }, [snapshot, weights]);

  const industries = useMemo(() => {
    if (!ranked) return [] as string[];
    const set = new Set<string>();
    for (const r of ranked.rows) set.add(r.industry);
    return [...set].sort();
  }, [ranked]);

  const visibleRows = useMemo<RankedRow[]>(() => {
    if (!ranked) return [];
    if (!industry) return ranked.rows;
    return ranked.rows.filter((r) => r.industry === industry);
  }, [ranked, industry]);

  const selectedRow = useMemo(() => {
    if (!ranked || !selected) return null;
    return ranked.rows.find((r) => r.symbol === selected) ?? null;
  }, [ranked, selected]);

  if (error) {
    return (
      <main>
        <h1>StockRank</h1>
        <p role="alert">Failed to load snapshot: {error}</p>
        <p>
          Run <code>npm run ingest</code> to produce
          <code> public/data/snapshot-latest.json</code>, then reload.
        </p>
      </main>
    );
  }

  if (!snapshot || !ranked) {
    return (
      <main>
        <h1>StockRank</h1>
        <p role="status">Loading snapshot…</p>
      </main>
    );
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>StockRank</h1>
        <p className="app__sub">
          Snapshot {snapshot.snapshotDate} · {snapshot.companies.length} companies
          · {ranked.rows.length} eligible · {ranked.turnaroundWatchlist.length} on
          turnaround watchlist
        </p>
      </header>

      <nav className="app__tabs" aria-label="Sections">
        <button
          type="button"
          aria-pressed={tab === "composite"}
          onClick={() => setTab("composite")}
        >
          Composite ({ranked.rows.length})
        </button>
        <button
          type="button"
          aria-pressed={tab === "turnaround"}
          onClick={() => setTab("turnaround")}
        >
          Turnaround ({ranked.turnaroundWatchlist.length})
        </button>
      </nav>

      {tab === "composite" ? (
        <div className="app__composite-layout">
          <aside className="app__sidebar">
            <WeightSliders
              weights={weights}
              onChange={setWeights}
              onReset={() => setWeights(DEFAULT_WEIGHTS)}
            />
            <IndustryFilter
              industries={industries}
              selected={industry}
              onChange={setIndustry}
            />
          </aside>

          <section className="app__table-area">
            <RankedTable
              rows={visibleRows}
              selectedSymbol={selected}
              onSelect={setSelected}
            />
          </section>

          <DrillDownPanel row={selectedRow} />
        </div>
      ) : (
        <TurnaroundList rows={ranked.turnaroundWatchlist} />
      )}
    </main>
  );
}
