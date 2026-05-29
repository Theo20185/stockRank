import { useEffect, useState } from "react";
import type {
  ExpirationView,
  OptionsView,
  ProjectedEndCase,
  RankedRow,
} from "@stockrank/ranking";
import { formatExpiration, selectionReasonLabel } from "../lib/format.js";
import {
  loadOptionsView,
  type OptionsLoadResult,
} from "../snapshot/options-loader.js";
import { TradeComparisonTable } from "./TradeComparisonTable.js";

export type OptionsPanelProps = {
  symbol: string;
  /**
   * The ranked row for this symbol — supplies fair value, dividend rate
   * and current price to the trade-comparison module. When omitted, the
   * panel renders a not-fetched state.
   */
  row?: RankedRow | null;
  /** SPAXX yield as a decimal (e.g. 0.033). When omitted, the
   * trade-comparison module uses its built-in default. */
  spaxxRate?: number;
  /** Persisted setter from useSpaxxRate; when supplied, the panel
   * renders an inline editor in its header. */
  onSpaxxRateChange?: (rate: number) => void;
  /** Test seam — defaults to the production loader. */
  loader?: (symbol: string) => Promise<OptionsLoadResult>;
};

type State =
  | { status: "loading" }
  | { status: "loaded"; view: OptionsView }
  | { status: "not-fetched" }
  | { status: "error"; message: string };

export function OptionsPanel({
  symbol,
  row,
  spaxxRate,
  onSpaxxRateChange,
  loader = loadOptionsView,
}: OptionsPanelProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  // Default to the conservative tail (p25). Anything more optimistic is
  // an opt-in click — keeps the projected P&L honest.
  const [scenario, setScenario] = useState<ProjectedEndCase>("p25");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loader(symbol)
      .then((result) => {
        if (cancelled) return;
        setState(
          result.status === "loaded"
            ? { status: "loaded", view: result.view }
            : { status: "not-fetched" },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol, loader]);

  const showControls = state.status === "loaded" && row && row.fairValue?.range;

  return (
    <section className="options-panel" aria-label={`Options for ${symbol}`}>
      <header className="options-panel__header">
        <h3>Options</h3>
        {showControls && (
          <div className="options-panel__controls">
            {onSpaxxRateChange && (
              <SpaxxRateInput rate={spaxxRate ?? 0} onChange={onSpaxxRateChange} />
            )}
            <ScenarioToggle scenario={scenario} onChange={setScenario} />
          </div>
        )}
      </header>
      <OptionsBody
        state={state}
        symbol={symbol}
        row={row ?? null}
        scenario={scenario}
        spaxxRate={spaxxRate}
      />
    </section>
  );
}

function SpaxxRateInput({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="options-panel__spaxx" title="Fidelity SPAXX yield used for cash-leg P&L">
      SPAXX
      <input
        type="number"
        step="0.05"
        min="0"
        max="20"
        value={(rate * 100).toFixed(2)}
        onChange={(e) => {
          const pct = Number.parseFloat(e.target.value);
          if (Number.isFinite(pct)) onChange(pct / 100);
        }}
      />
      %
    </label>
  );
}

function ScenarioToggle({
  scenario,
  onChange,
}: {
  scenario: ProjectedEndCase;
  onChange: (s: ProjectedEndCase) => void;
}) {
  const opts: Array<{ key: ProjectedEndCase; label: string }> = [
    { key: "p25", label: "Conservative" },
    { key: "median", label: "Median" },
    { key: "flat", label: "Flat" },
  ];
  return (
    <nav className="options-panel__scenario" aria-label="Projected end-price scenario">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={scenario === o.key}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </nav>
  );
}

function OptionsBody({
  state,
  symbol,
  row,
  scenario,
  spaxxRate,
}: {
  state: State;
  symbol: string;
  row: RankedRow | null;
  scenario: ProjectedEndCase;
  spaxxRate?: number;
}) {
  if (state.status === "loading") {
    return (
      <p className="options-panel__status" role="status">
        Loading options…
      </p>
    );
  }
  if (state.status === "not-fetched") {
    return (
      <p className="options-panel__status" role="status">
        {symbol} isn't in the Ranked bucket on the latest snapshot, so the
        nightly ingest skipped its options chain. Stocks land here when
        they're at or above fair value, missing one of {"{quality, P/B, ROIC}"},
        or sitting in Watch / Excluded for any other reason.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="options-panel__error" role="alert">
        Failed to load options: {state.message}
      </p>
    );
  }
  const view = state.view;
  if (view.expirations.length === 0) {
    return (
      <p className="options-panel__status" role="status">
        No options listed for {symbol}.
      </p>
    );
  }
  if (!row?.fairValue?.range) {
    return (
      <p className="options-panel__status" role="status">
        No fair-value range for {symbol} — trade comparison unavailable.
      </p>
    );
  }
  return (
    <>
      {view.expirations.map((exp) => (
        <ExpirationSection
          key={exp.expiration}
          expiration={exp}
          currentPrice={view.currentPrice}
          row={row}
          scenario={scenario}
          spaxxRate={spaxxRate}
          symbol={symbol}
        />
      ))}
    </>
  );
}

type ExpirationSectionProps = {
  expiration: ExpirationView;
  currentPrice: number;
  row: RankedRow;
  scenario: ProjectedEndCase;
  spaxxRate?: number;
  symbol: string;
};

/**
 * Forward projection of FV anchors + price at the expiration date.
 * Inline-styled compact summary above the trade comparison table.
 * Confidence chip color-codes R²: high (≥0.5) / medium (≥0.25) /
 * weak (<0.25). A second chip surfaces when the ±50% soft cap clipped
 * the raw regression — informational, not a blocker.
 */
function ProjectionRow({ projection }: { projection: NonNullable<ExpirationView["projection"]> }) {
  const fmt = (v: number) => `$${v.toFixed(2)}`;
  const slope = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%/yr`;
  return (
    <p className="options-exp__projection" role="status" aria-label="Projected at expiry">
      <strong>At expiry ({projection.daysAhead}d):</strong>{" "}
      Price {fmt(projection.price)} (
      <span
        className={`options-exp__chip options-exp__chip--${projection.priceConfidence}`}
        title={`Price R² = ${projection.priceRSquared.toFixed(2)}`}
      >
        {projection.priceConfidence}
      </span>
      , {slope(projection.priceSlopePctPerYear)}
      {projection.priceCapped && (
        <span className="options-exp__chip options-exp__chip--capped" title="Projection capped at ±50% of last observed value">
          capped
        </span>
      )}
      ) · FV {fmt(projection.fvP25)}–{fmt(projection.fvP75)} (
      <span
        className={`options-exp__chip options-exp__chip--${projection.fvConfidence}`}
        title={`FV R² = ${projection.fvRSquared.toFixed(2)}`}
      >
        {projection.fvConfidence}
      </span>
      , {slope(projection.fvSlopePctPerYear)}
      {projection.fvCapped && (
        <span className="options-exp__chip options-exp__chip--capped" title="Projection capped at ±50% of last observed value">
          capped
        </span>
      )}
      )
    </p>
  );
}

function ExpirationSection({
  expiration,
  currentPrice,
  row,
  scenario,
  spaxxRate,
  symbol,
}: ExpirationSectionProps) {
  const fvRange = row.fairValue!.range!;
  return (
    <section className="options-exp">
      <h4 className="options-exp__title">
        <span>{formatExpiration(expiration.expiration)}</span>
        <span className="options-exp__reason">
          {selectionReasonLabel(expiration.selectionReason)}
        </span>
      </h4>

      {expiration.projection && (
        <ProjectionRow projection={expiration.projection} />
      )}

      {expiration.putsSuppressedReason === "above-conservative-tail" && (
        <p className="options-panel__suppressed">
          Stock is at or above its conservative-tail fair value. Selling a
          put at the fair-value anchor isn't a value entry for this profile.
        </p>
      )}

      <TradeComparisonTable
        expiration={expiration}
        symbol={symbol}
        currentPrice={currentPrice}
        annualDividend={row.annualDividend}
        fairValue={fvRange}
        scenario={scenario}
        spaxxRate={spaxxRate}
      />
    </section>
  );
}
