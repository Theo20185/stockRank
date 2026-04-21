import { useEffect, useState } from "react";
import type {
  CashSecuredPut,
  CoveredCall,
  ExpirationView,
  OptionsView,
} from "@stockrank/ranking";
import {
  formatDte,
  formatExpiration,
  formatPercent,
  formatPrice,
  selectionReasonLabel,
} from "../lib/format.js";
import {
  loadOptionsView,
  type OptionsLoadResult,
} from "../snapshot/options-loader.js";

export type OptionsPanelProps = {
  symbol: string;
  /** Test seam — defaults to the production loader. */
  loader?: (symbol: string) => Promise<OptionsLoadResult>;
};

type State =
  | { status: "loading" }
  | { status: "loaded"; view: OptionsView }
  | { status: "not-fetched" }
  | { status: "error"; message: string };

export function OptionsPanel({ symbol, loader = loadOptionsView }: OptionsPanelProps) {
  const [state, setState] = useState<State>({ status: "loading" });

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

  return (
    <section className="options-panel" aria-label={`Options for ${symbol}`}>
      <header className="options-panel__header">
        <h3>Options</h3>
      </header>
      <OptionsBody state={state} symbol={symbol} />
    </section>
  );
}

function OptionsBody({ state, symbol }: { state: State; symbol: string }) {
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
  return (
    <>
      {view.expirations.map((exp) => (
        <ExpirationSection
          key={exp.expiration}
          expiration={exp}
          currentPrice={view.currentPrice}
        />
      ))}
    </>
  );
}

type ExpirationSectionProps = {
  expiration: ExpirationView;
  currentPrice: number;
};

function ExpirationSection({ expiration, currentPrice }: ExpirationSectionProps) {
  return (
    <section className="options-exp">
      <h4 className="options-exp__title">
        {formatExpiration(expiration.expiration)}
        <span className="options-exp__reason">
          {selectionReasonLabel(expiration.selectionReason)}
        </span>
      </h4>

      <div className="options-exp__group">
        <h5>If you own this stock today</h5>
        {expiration.coveredCalls.length === 0 ? (
          <p className="options-panel__status">
            No covered-call strikes available at fair-value anchors.
          </p>
        ) : (
          <CoveredCallTable calls={expiration.coveredCalls} currentPrice={currentPrice} />
        )}
      </div>

      <div className="options-exp__group">
        <h5>If you want to own this stock</h5>
        {expiration.putsSuppressedReason === "below-fair-value" ? (
          <p className="options-panel__suppressed">
            Stock already trading below fair value. Consider buying outright;
            put premium will not meaningfully exceed expected appreciation.
          </p>
        ) : expiration.puts.length === 0 ? (
          <p className="options-panel__status">
            No put strikes available at fair-value anchors.
          </p>
        ) : (
          <PutTable puts={expiration.puts} currentPrice={currentPrice} />
        )}
      </div>
    </section>
  );
}

const CALL_LABELS: Record<CoveredCall["label"], string> = {
  conservative: "Conservative",
  aggressive: "Aggressive",
  stretch: "Stretch",
};

const PUT_LABELS: Record<CashSecuredPut["label"], string> = {
  stretch: "Stretch",
  aggressive: "Aggressive",
  "deep-value": "Deep value",
};

function ChipRow({ chips }: { chips: string[] }) {
  if (chips.length === 0) return null;
  return (
    <span className="options-chips">
      {chips.map((c) => (
        <span key={c} className="options-chip">
          {c}
        </span>
      ))}
    </span>
  );
}

function CoveredCallTable({
  calls,
}: {
  calls: CoveredCall[];
  currentPrice: number;
}) {
  return (
    <table className="options-table" aria-label="Covered calls">
      <thead>
        <tr>
          <th className="num">Strike</th>
          <th className="num">Bid</th>
          <th className="num">DTE</th>
          <th className="num">Static % (annl)</th>
          <th className="num">If assigned % (annl)</th>
          <th className="num">Effective cost</th>
          <th>Label</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => {
          const chips: string[] = [];
          if (call.snapWarning) {
            const off = Math.abs(call.contract.strike - call.anchorPrice) / call.anchorPrice;
            chips.push(`${(off * 100).toFixed(0)}% off target`);
          }
          if (call.shortDated) chips.push("short-dated");
          return (
            <tr key={call.contract.contractSymbol}>
              <td className="num">{formatPrice(call.contract.strike)}</td>
              <td className="num">{formatPrice(call.contract.bid)}</td>
              <td className="num">{formatDte(call.contract.daysToExpiry)}</td>
              <td className="num">
                {formatPercent(call.staticReturnPct * 100, 1)}
                <span className="options-table__sub">
                  ({formatPercent(call.staticAnnualizedPct * 100, 1)})
                </span>
              </td>
              <td className="num">
                {formatPercent(call.assignedReturnPct * 100, 1)}
                <span className="options-table__sub">
                  ({formatPercent(call.assignedAnnualizedPct * 100, 1)})
                </span>
              </td>
              <td className="num">
                {formatPrice(call.effectiveCostBasis)}
                <span className="options-table__sub">
                  ({formatPercent(call.effectiveDiscountPct * 100, 1)})
                </span>
              </td>
              <td>
                {CALL_LABELS[call.label]}
                <ChipRow chips={chips} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PutTable({
  puts,
}: {
  puts: CashSecuredPut[];
  currentPrice: number;
}) {
  return (
    <table className="options-table" aria-label="Cash-secured puts">
      <thead>
        <tr>
          <th className="num">Strike</th>
          <th className="num">Bid</th>
          <th className="num">DTE</th>
          <th className="num">Premium % collateral (annl)</th>
          <th className="num">Effective cost (discount)</th>
          <th>Label</th>
        </tr>
      </thead>
      <tbody>
        {puts.map((put) => {
          const chips: string[] = [];
          if (put.snapWarning) {
            const off = Math.abs(put.contract.strike - put.anchorPrice) / put.anchorPrice;
            chips.push(`${(off * 100).toFixed(0)}% off target`);
          }
          if (put.shortDated) chips.push("short-dated");
          if (put.inTheMoney) chips.push("ITM");
          return (
            <tr key={put.contract.contractSymbol}>
              <td className="num">{formatPrice(put.contract.strike)}</td>
              <td className="num">{formatPrice(put.contract.bid)}</td>
              <td className="num">{formatDte(put.contract.daysToExpiry)}</td>
              <td className="num">
                {formatPercent(put.notAssignedReturnPct * 100, 1)}
                <span className="options-table__sub">
                  ({formatPercent(put.notAssignedAnnualizedPct * 100, 1)})
                </span>
              </td>
              <td className="num">
                {formatPrice(put.effectiveCostBasis)}
                <span className="options-table__sub">
                  ({formatPercent(put.effectiveDiscountPct * 100, 1)})
                </span>
              </td>
              <td>
                {PUT_LABELS[put.label]}
                <ChipRow chips={chips} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
