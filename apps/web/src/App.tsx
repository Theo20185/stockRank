import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "@stockrank/core";
import {
  rank,
  fairValueFor,
  DEFAULT_WEIGHTS,
  type CategoryWeights,
} from "@stockrank/ranking";
import { loadSnapshot } from "./snapshot/loader.js";
import { useHashRoute } from "./router/useHashRoute.js";
import { ResultsScreen } from "./screens/ResultsScreen.js";
import { FiltersScreen } from "./screens/FiltersScreen.js";
import { StockDetailScreen } from "./screens/StockDetailScreen.js";
import { TurnaroundScreen } from "./screens/TurnaroundScreen.js";

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
  const { route, navigate } = useHashRoute();

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

  if (error) {
    return (
      <main className="app app--message">
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
      <main className="app app--message">
        <h1>StockRank</h1>
        <p role="status">Loading snapshot…</p>
      </main>
    );
  }

  // Route → screen.
  if (route.name === "filters") {
    return (
      <main className="app">
        <FiltersScreen
          industries={industries}
          industry={industry}
          weights={weights}
          onIndustryChange={setIndustry}
          onWeightsChange={setWeights}
          onBack={() => navigate("/")}
        />
      </main>
    );
  }

  if (route.name === "stock") {
    const row = ranked.rows.find((r) => r.symbol === route.symbol) ?? null;
    return (
      <main className="app">
        <StockDetailScreen
          row={row}
          symbol={route.symbol}
          onBack={() => navigate("/")}
        />
      </main>
    );
  }

  if (route.name === "turnaround") {
    return (
      <main className="app">
        <TurnaroundScreen
          ranked={ranked}
          onSelectTab={(tab) =>
            navigate(tab === "composite" ? "/" : "/turnaround")
          }
        />
      </main>
    );
  }

  // Default: results.
  return (
    <main className="app">
      <ResultsScreen
        snapshot={snapshot}
        ranked={ranked}
        industry={industry}
        weights={weights}
        tab="composite"
        onSelectTab={(tab) =>
          navigate(tab === "composite" ? "/" : "/turnaround")
        }
        onSelectStock={(symbol) =>
          navigate(`/stock/${encodeURIComponent(symbol)}`)
        }
        onEditFilters={() => navigate("/filters")}
      />
    </main>
  );
}
