import { useState } from "react";
import type { Portfolio, Position } from "@stockrank/core";
import { isStockPosition } from "@stockrank/core";
import type {
  CashEvaluation,
  OptionEvaluation,
  PortfolioEvaluation,
  SellSignal,
  StockEvaluation,
} from "@stockrank/ranking";
import { MILESTONE_LABELS, SELL_SIGNAL_LABELS } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { AddPositionForm } from "../components/AddPositionForm.js";

export type PortfolioScreenProps = {
  portfolio: Portfolio;
  evaluation: PortfolioEvaluation;
  onSelectStock: (symbol: string) => void;
  onSelectTab: (tab: "composite" | "turnaround" | "portfolio") => void;
  /** Persist the new portfolio (form add / row delete). */
  onPortfolioChange: (next: Portfolio) => void;
};

export function PortfolioScreen({
  portfolio,
  evaluation,
  onSelectStock,
  onSelectTab,
  onPortfolioChange,
}: PortfolioScreenProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const stockEvals = evaluation.positions.filter(
    (e): e is StockEvaluation => e.kind === "stock",
  );
  const optionEvals = evaluation.positions.filter(
    (e): e is OptionEvaluation => e.kind === "option",
  );
  const cashEvals = evaluation.positions.filter(
    (e): e is CashEvaluation => e.kind === "cash",
  );
  const stockPositions = portfolio.positions.filter(isStockPosition);

  const handleAdd = (position: Position) => {
    onPortfolioChange({
      updatedAt: new Date().toISOString(),
      positions: [...portfolio.positions, position],
    });
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Remove this position from your portfolio?")) return;
    onPortfolioChange({
      updatedAt: new Date().toISOString(),
      positions: portfolio.positions.filter((p) => p.id !== id),
    });
  };

  return (
    <div className="screen screen--portfolio">
      <AppHeader
        title="StockRank — Portfolio"
        subtitle={`${evaluation.summary.totalPositions} positions · last edited ${evaluation.portfolioUpdatedAt.slice(0, 10)} · stored locally in your browser`}
      />

      <nav className="app__tabs" aria-label="Sections">
        <button type="button" aria-pressed={false} onClick={() => onSelectTab("composite")}>
          Composite
        </button>
        <button type="button" aria-pressed={false} onClick={() => onSelectTab("turnaround")}>
          Turnaround
        </button>
        <button type="button" aria-pressed={true} onClick={() => onSelectTab("portfolio")}>
          Portfolio ({evaluation.summary.totalPositions})
        </button>
      </nav>

      <section className="portfolio__summary" aria-label="Portfolio summary">
        <SummaryStat
          label="Total market value"
          value={fmtDollars(evaluation.summary.totalMarketValue)}
        />
        <SummaryStat
          label="Stock unrealized P&L"
          value={fmtDollars(evaluation.summary.aggregateStockPnlDollars)}
          tone={evaluation.summary.aggregateStockPnlDollars >= 0 ? "positive" : "negative"}
        />
        <SummaryStat
          label="Cash interest accrued"
          value={fmtDollars(evaluation.summary.aggregateAccruedInterest, 2)}
        />
        <SummaryStat
          label="In Avoid bucket"
          value={String(evaluation.summary.positionsInAvoid)}
          tone={evaluation.summary.positionsInAvoid > 0 ? "warn" : undefined}
        />
        <SummaryStat
          label="With sell signals"
          value={String(evaluation.summary.positionsWithSellSignal)}
          tone={evaluation.summary.positionsWithSellSignal > 0 ? "warn" : undefined}
        />
      </section>

      <div className="portfolio__toolbar">
        {!showAddForm && (
          <button
            type="button"
            className="portfolio__add-button"
            onClick={() => setShowAddForm(true)}
          >
            + Add position
          </button>
        )}
      </div>

      {showAddForm && (
        <AddPositionForm
          stockPositions={stockPositions}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {evaluation.summary.totalPositions === 0 && !showAddForm && (
        <p className="screen__empty" role="status">
          No positions yet. Click <strong>+ Add position</strong> above to enter
          your first holding. Holdings are stored in your browser's localStorage
          and never leave this device.
        </p>
      )}

      {stockEvals.length > 0 && (
        <StockSection
          evals={stockEvals}
          onSelectStock={onSelectStock}
          onDelete={handleDelete}
        />
      )}
      {optionEvals.length > 0 && (
        <OptionSection
          evals={optionEvals}
          onSelectStock={onSelectStock}
          onDelete={handleDelete}
        />
      )}
      {cashEvals.length > 0 && <CashSection evals={cashEvals} onDelete={handleDelete} />}
    </div>
  );
}

/* ─── Summary stat ────────────────────────────────────────────── */

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "positive" | "negative";
}) {
  const cls = tone ? `portfolio__stat portfolio__stat--${tone}` : "portfolio__stat";
  return (
    <div className={cls}>
      <span className="portfolio__stat-label">{label}</span>
      <span className="portfolio__stat-value">{value}</span>
    </div>
  );
}

/* ─── Stock section ───────────────────────────────────────────── */

function StockSection({
  evals,
  onSelectStock,
  onDelete,
}: {
  evals: StockEvaluation[];
  onSelectStock: (symbol: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="portfolio__section" aria-label="Stock positions">
      <h2 className="portfolio__section-title">Stocks ({evals.length})</h2>
      <table className="portfolio__table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Entry date</th>
            <th className="num">Shares</th>
            <th className="num">Cost basis</th>
            <th className="num">Current price</th>
            <th className="num">Market value</th>
            <th className="num">Unrealized P&L</th>
            <th>Bucket</th>
            <th>Sell signals</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {evals.map((e) => {
            const pnlClass =
              e.unrealizedPnlDollars === null
                ? ""
                : e.unrealizedPnlDollars >= 0
                  ? "portfolio__pnl portfolio__pnl--positive"
                  : "portfolio__pnl portfolio__pnl--negative";
            return (
              <tr key={e.position.id}>
                <td>
                  <button
                    type="button"
                    className="portfolio__symbol-button"
                    onClick={() => onSelectStock(e.position.symbol)}
                  >
                    {e.position.symbol}
                  </button>
                </td>
                <td>{e.position.entryDate}</td>
                <td className="num">{e.position.shares}</td>
                <td className="num">{fmtDollars(e.position.costBasis, 2)}</td>
                <td className="num">
                  {e.currentPrice === null ? "—" : fmtDollars(e.currentPrice, 2)}
                </td>
                <td className="num">
                  {e.marketValue === null ? "—" : fmtDollars(e.marketValue, 2)}
                </td>
                <td className={`num ${pnlClass}`}>
                  {e.unrealizedPnlDollars === null
                    ? "—"
                    : `${fmtDollars(e.unrealizedPnlDollars, 0)} (${e.unrealizedPnlPct?.toFixed(1)}%)`}
                </td>
                <td>{e.currentBucket ?? "—"}</td>
                <td>
                  <SellSignalsCell signals={e.sellSignals} />
                </td>
                <td>
                  <DeleteButton onDelete={() => onDelete(e.position.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function SellSignalsCell({ signals }: { signals: SellSignal[] }) {
  if (signals.length === 0) return <span className="portfolio__signals-none">—</span>;
  return (
    <ul className="portfolio__signals">
      {signals.map((sig) => (
        <li
          key={sig}
          className={
            sig === "in-avoid-bucket" || sig === "price-at-or-above-fv-p75"
              ? "portfolio__signal portfolio__signal--high"
              : "portfolio__signal"
          }
          title={SELL_SIGNAL_LABELS[sig]}
        >
          {sig}
        </li>
      ))}
    </ul>
  );
}

/* ─── Option section ──────────────────────────────────────────── */

function OptionSection({
  evals,
  onSelectStock,
  onDelete,
}: {
  evals: OptionEvaluation[];
  onSelectStock: (symbol: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="portfolio__section" aria-label="Option positions">
      <h2 className="portfolio__section-title">Options ({evals.length})</h2>
      <ul className="portfolio__option-list">
        {evals.map((e) => (
          <OptionCard
            key={e.position.id}
            evaluation={e}
            onSelectStock={onSelectStock}
            onDelete={() => onDelete(e.position.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function OptionCard({
  evaluation,
  onSelectStock,
  onDelete,
}: {
  evaluation: OptionEvaluation;
  onSelectStock: (symbol: string) => void;
  onDelete: () => void;
}) {
  const { position: o, daysToExpiration, isExpired, paired, pairedStock } = evaluation;
  const direction = o.contracts > 0 ? "Long" : "Short";
  const cls = `portfolio__option-card portfolio__option-card--${o.contracts > 0 ? "long" : "short"}${isExpired ? " portfolio__option-card--expired" : ""}`;
  return (
    <li className={cls}>
      <header className="portfolio__option-head">
        <div>
          <button
            type="button"
            className="portfolio__symbol-button"
            onClick={() => onSelectStock(o.symbol)}
          >
            {o.symbol}
          </button>
          <span className="portfolio__option-spec">
            {" "}{direction} {Math.abs(o.contracts)} {o.optionType.toUpperCase()}{" "}
            ${o.strike.toFixed(2)} exp {o.expiration}
            {paired && pairedStock && (
              <span className="portfolio__paired-badge">
                {" "}· paired with {pairedStock.shares} sh
              </span>
            )}
          </span>
        </div>
        <DeleteButton onDelete={onDelete} />
      </header>
      <dl className="portfolio__option-grid">
        <div>
          <dt>Cash at entry</dt>
          <dd className={evaluation.cashAtEntry >= 0 ? "portfolio__pnl--positive" : "portfolio__pnl--negative"}>
            {fmtDollars(evaluation.cashAtEntry, 0)}
          </dd>
        </div>
        <div>
          <dt>{isExpired ? "Expired" : "Days to expiry"}</dt>
          <dd>{isExpired ? `${Math.abs(daysToExpiration)}d ago` : `${daysToExpiration}d`}</dd>
        </div>
        <div>
          <dt>Underlying</dt>
          <dd>{evaluation.underlyingPrice === null ? "—" : fmtDollars(evaluation.underlyingPrice, 2)}</dd>
        </div>
        <div>
          <dt>Intrinsic value</dt>
          <dd>{evaluation.intrinsicDollars === null ? "—" : fmtDollars(evaluation.intrinsicDollars, 0)}</dd>
        </div>
        {evaluation.annualizedPremiumYield !== null && (
          <div>
            <dt>Annualized premium yield</dt>
            <dd className="portfolio__pnl--positive">
              {evaluation.annualizedPremiumYield.toFixed(1)}%
            </dd>
          </div>
        )}
      </dl>
      {evaluation.milestones.length > 0 && (
        <div className="portfolio__milestones">
          <h4>P&L scenarios at expiry</h4>
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th className="num">Stock price</th>
                <th className="num">Option leg</th>
                {paired && <th className="num">Combined (with stock)</th>}
              </tr>
            </thead>
            <tbody>
              {evaluation.milestones.map((m) => (
                <tr key={m.scenario}>
                  <td>{MILESTONE_LABELS[m.scenario]}</td>
                  <td className="num">
                    {m.hypotheticalPrice === null ? "—" : fmtDollars(m.hypotheticalPrice, 2)}
                  </td>
                  <td className={`num ${m.optionPnl >= 0 ? "portfolio__pnl--positive" : "portfolio__pnl--negative"}`}>
                    {fmtDollars(m.optionPnl, 0)}
                  </td>
                  {paired && (
                    <td className={`num ${(m.combinedPnl ?? 0) >= 0 ? "portfolio__pnl--positive" : "portfolio__pnl--negative"}`}>
                      {m.combinedPnl === null ? "—" : fmtDollars(m.combinedPnl, 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {o.notes && <p className="portfolio__notes">{o.notes}</p>}
    </li>
  );
}

/* ─── Cash section ────────────────────────────────────────────── */

function CashSection({
  evals,
  onDelete,
}: {
  evals: CashEvaluation[];
  onDelete: (id: string) => void;
}) {
  return (
    <section className="portfolio__section" aria-label="Cash positions">
      <h2 className="portfolio__section-title">Cash ({evals.length})</h2>
      <table className="portfolio__table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>As of</th>
            <th className="num">Amount</th>
            <th className="num">Yield</th>
            <th className="num">Days held</th>
            <th className="num">Accrued interest</th>
            <th className="num">Current value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {evals.map((e) => (
            <tr key={e.position.id}>
              <td>{e.position.symbol}</td>
              <td>{e.position.entryDate}</td>
              <td className="num">{fmtDollars(e.position.amount, 2)}</td>
              <td className="num">{e.position.yieldPct.toFixed(2)}%</td>
              <td className="num">{e.daysHeld}</td>
              <td className="num portfolio__pnl--positive">
                {fmtDollars(e.accruedInterest, 2)}
              </td>
              <td className="num">{fmtDollars(e.currentValue, 2)}</td>
              <td>
                <DeleteButton onDelete={() => onDelete(e.position.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ─── Shared atoms ────────────────────────────────────────────── */

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      type="button"
      className="portfolio__delete-button"
      onClick={onDelete}
      aria-label="Delete position"
      title="Delete this position"
    >
      ×
    </button>
  );
}

function fmtDollars(value: number, fractionDigits = 0): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
