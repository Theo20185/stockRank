import { useEffect, useMemo, useState } from "react";
import type {
  FvTrendArtifact,
  OptionsSummary,
  Portfolio,
  Snapshot,
} from "@stockrank/core";
import { EMPTY_PORTFOLIO } from "@stockrank/core";
import {
  rank,
  fairValueFor,
  evaluatePortfolio,
  bucketRationaleFor,
  DEFAULT_WEIGHTS,
  type CategoryWeights,
} from "@stockrank/ranking";
import { loadSnapshot } from "./snapshot/loader.js";
import { loadOptionsSummary } from "./snapshot/options-summary-loader.js";
import { loadFvTrend } from "./snapshot/fv-trend-loader.js";
import { loadPortfolio } from "./snapshot/portfolio-loader.js";
import { useSpaxxRate } from "./lib/spaxx-rate.js";
import { useHashRoute } from "./router/useHashRoute.js";
import { ResultsScreen } from "./screens/ResultsScreen.js";
import { FiltersScreen } from "./screens/FiltersScreen.js";
import { StockDetailScreen } from "./screens/StockDetailScreen.js";
import { TurnaroundScreen } from "./screens/TurnaroundScreen.js";
import { PortfolioScreen } from "./screens/PortfolioScreen.js";

export type AppProps = {
  /** Provided in tests; real app fetches via loadSnapshot at mount. */
  initialSnapshot?: Snapshot;
  /** Provided in tests to short-circuit the summary fetch. */
  initialOptionsSummary?: OptionsSummary | null;
  /** Provided in tests to short-circuit the FV-trend fetch. */
  initialFvTrend?: FvTrendArtifact | null;
  /** Provided in tests to short-circuit the portfolio fetch. */
  initialPortfolio?: Portfolio;
};

export function App({ initialSnapshot, initialOptionsSummary, initialFvTrend, initialPortfolio }: AppProps = {}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(
    initialSnapshot ?? null,
  );
  const [optionsSummary, setOptionsSummary] = useState<OptionsSummary | null>(
    initialOptionsSummary ?? null,
  );
  const [fvTrend, setFvTrend] = useState<FvTrendArtifact | null>(
    initialFvTrend ?? null,
  );
  const [portfolio, setPortfolio] = useState<Portfolio>(
    initialPortfolio ?? EMPTY_PORTFOLIO,
  );
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<CategoryWeights>(DEFAULT_WEIGHTS);
  const [industry, setIndustry] = useState<string | null>(null);
  const [spaxxRate, setSpaxxRate] = useSpaxxRate();
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

  useEffect(() => {
    if (initialOptionsSummary !== undefined) return;
    let cancelled = false;
    loadOptionsSummary().then((s) => {
      if (!cancelled) setOptionsSummary(s);
    });
    return () => {
      cancelled = true;
    };
  }, [initialOptionsSummary]);

  useEffect(() => {
    if (initialFvTrend !== undefined) return;
    let cancelled = false;
    loadFvTrend().then((t) => {
      if (!cancelled) setFvTrend(t);
    });
    return () => {
      cancelled = true;
    };
  }, [initialFvTrend]);

  useEffect(() => {
    if (initialPortfolio !== undefined) return;
    setPortfolio(loadPortfolio());
  }, [initialPortfolio]);

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
      // optionsLiquid defaults to true from rank(); the summary, if loaded,
      // overrides it. A symbol with no entry in summary.symbols is treated
      // as liquid-unknown (kept true) so that pre-options snapshots don't
      // accidentally empty the Ranked bucket.
      if (optionsSummary && optionsSummary.symbols[row.symbol] !== undefined) {
        const best = optionsSummary.symbols[row.symbol]!;
        row.optionsLiquid = best.bestCallAnnualized !== null && best.bestPutAnnualized !== null;
      }
      // fvTrend defaults to "insufficient_data" from rank(); the loaded
      // artifact, if available, overrides it. "declining" demotes the
      // row to Watch via the bucket classifier.
      if (fvTrend && fvTrend.symbols[row.symbol]) {
        row.fvTrend = fvTrend.symbols[row.symbol]!.trend;
      }
    }
    // Stamp fair value on ineligible rows too — they still have
    // fundamentals, just failed the quality floor; users may want to
    // see what the model would project even on Excluded names.
    for (const row of result.ineligibleRows) {
      const company = snapshot.companies.find((c) => c.symbol === row.symbol);
      if (company) row.fairValue = fairValueFor(company, snapshot.companies);
    }
    for (const row of result.turnaroundWatchlist) {
      const company = snapshot.companies.find((c) => c.symbol === row.symbol);
      if (company) row.fairValue = fairValueFor(company, snapshot.companies);
    }
    return result;
  }, [snapshot, weights, optionsSummary, fvTrend]);

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
    // The row may live in either bucket — search both rows (eligible)
    // and ineligibleRows (failed §4 floor) so detail pages render for
    // every name in the universe.
    const row =
      ranked.rows.find((r) => r.symbol === route.symbol) ??
      ranked.ineligibleRows.find((r) => r.symbol === route.symbol) ??
      null;
    const trendSamples = fvTrend?.symbols[route.symbol]?.quarterly;
    const rationale = row ? bucketRationaleFor(row, ranked) : null;
    return (
      <main className="app">
        <StockDetailScreen
          row={row}
          symbol={route.symbol}
          spaxxRate={spaxxRate}
          onSpaxxRateChange={setSpaxxRate}
          onBack={() => navigate("/")}
          fvTrendSamples={trendSamples}
          rationale={rationale}
        />
      </main>
    );
  }

  if (route.name === "turnaround") {
    return (
      <main className="app">
        <TurnaroundScreen
          ranked={ranked}
          onSelectTab={(tab) => {
            if (tab === "composite") navigate("/");
            else if (tab === "turnaround") navigate("/turnaround");
            else navigate("/portfolio");
          }}
        />
      </main>
    );
  }

  if (route.name === "portfolio") {
    const evaluation = evaluatePortfolio(portfolio, ranked);
    return (
      <main className="app">
        <PortfolioScreen
          evaluation={evaluation}
          onSelectStock={(symbol) =>
            navigate(`/stock/${encodeURIComponent(symbol)}`)
          }
          onSelectTab={(tab) => {
            if (tab === "composite") navigate("/");
            else if (tab === "turnaround") navigate("/turnaround");
            else navigate("/portfolio");
          }}
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
        optionsSummary={optionsSummary}
        tab="composite"
        onSelectTab={(tab) => {
          if (tab === "composite") navigate("/");
          else if (tab === "turnaround") navigate("/turnaround");
          else navigate("/portfolio");
        }}
        onSelectStock={(symbol) =>
          navigate(`/stock/${encodeURIComponent(symbol)}`)
        }
        onEditFilters={() => navigate("/filters")}
      />
    </main>
  );
}
