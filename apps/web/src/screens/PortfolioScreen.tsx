import type {
  PortfolioEvaluation,
  PositionEvaluation,
  SellSignal,
} from "@stockrank/ranking";
import { SELL_SIGNAL_LABELS } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";

export type PortfolioScreenProps = {
  evaluation: PortfolioEvaluation;
  onSelectStock: (symbol: string) => void;
  onSelectTab: (tab: "composite" | "turnaround" | "portfolio") => void;
};

export function PortfolioScreen({
  evaluation,
  onSelectStock,
  onSelectTab,
}: PortfolioScreenProps) {
  return (
    <div className="screen screen--portfolio">
      <AppHeader
        title="StockRank — Portfolio"
        subtitle={`${evaluation.summary.totalPositions} positions · last edited ${evaluation.portfolioUpdatedAt.slice(0, 10)}`}
      />

      <nav className="app__tabs" aria-label="Sections">
        <button
          type="button"
          aria-pressed={false}
          onClick={() => onSelectTab("composite")}
        >
          Composite
        </button>
        <button
          type="button"
          aria-pressed={false}
          onClick={() => onSelectTab("turnaround")}
        >
          Turnaround
        </button>
        <button
          type="button"
          aria-pressed={true}
          onClick={() => onSelectTab("portfolio")}
        >
          Portfolio ({evaluation.summary.totalPositions})
        </button>
      </nav>

      {evaluation.summary.totalPositions === 0 ? (
        <p className="screen__empty" role="status">
          No positions in your portfolio. Edit{" "}
          <code>public/data/portfolio.json</code> to add holdings.
          Each entry needs <code>symbol</code>, <code>entryDate</code>,{" "}
          <code>entryPrice</code>, and <code>sharesOwned</code>.
        </p>
      ) : (
        <>
          <section className="portfolio__summary" aria-label="Portfolio summary">
            <SummaryStat
              label="In universe"
              value={`${evaluation.summary.positionsInSnapshot} / ${evaluation.summary.totalPositions}`}
            />
            <SummaryStat
              label="In Avoid bucket"
              value={String(evaluation.summary.positionsInAvoid)}
              warn={evaluation.summary.positionsInAvoid > 0}
            />
            <SummaryStat
              label="With sell signals"
              value={String(evaluation.summary.positionsWithSellSignal)}
              warn={evaluation.summary.positionsWithSellSignal > 0}
            />
            <SummaryStat
              label="Aggregate P&L"
              value={fmtDollars(evaluation.summary.aggregatePnlDollars)}
            />
          </section>
          <table className="portfolio__table" aria-label="Positions">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Entry date</th>
                <th>Entry price</th>
                <th>Shares</th>
                <th>Current price</th>
                <th>P&L</th>
                <th>Bucket</th>
                <th>Sell signals</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.positions.map((p) => (
                <PositionRow
                  key={`${p.position.symbol}-${p.position.entryDate}`}
                  evaluation={p}
                  onSelect={() => onSelectStock(p.position.symbol)}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SummaryStat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={
        warn ? "portfolio__stat portfolio__stat--warn" : "portfolio__stat"
      }
    >
      <span className="portfolio__stat-label">{label}</span>
      <span className="portfolio__stat-value">{value}</span>
    </div>
  );
}

function PositionRow({
  evaluation,
  onSelect,
}: {
  evaluation: PositionEvaluation;
  onSelect: () => void;
}) {
  const { position, currentPrice, pnlDollars, pnlPct, currentBucket, sellSignals } = evaluation;
  const pnlClass =
    pnlDollars === null
      ? ""
      : pnlDollars >= 0
        ? "portfolio__pnl portfolio__pnl--positive"
        : "portfolio__pnl portfolio__pnl--negative";
  return (
    <tr>
      <td>
        <button
          type="button"
          className="portfolio__symbol-button"
          onClick={onSelect}
        >
          {position.symbol}
        </button>
      </td>
      <td>{position.entryDate}</td>
      <td>{fmtDollars(position.entryPrice, 2)}</td>
      <td>{position.sharesOwned}</td>
      <td>{currentPrice === null ? "—" : fmtDollars(currentPrice, 2)}</td>
      <td className={pnlClass}>
        {pnlDollars === null
          ? "—"
          : `${fmtDollars(pnlDollars)} (${pnlPct?.toFixed(1)}%)`}
      </td>
      <td>{currentBucket ?? "—"}</td>
      <td>
        {sellSignals.length === 0 ? (
          <span className="portfolio__signals-none">—</span>
        ) : (
          <ul className="portfolio__signals">
            {sellSignals.map((sig) => (
              <li
                key={sig}
                className={
                  sig === "in-avoid-bucket" || sig === "price-at-or-above-fv-p75"
                    ? "portfolio__signal portfolio__signal--high"
                    : "portfolio__signal"
                }
                title={SELL_SIGNAL_LABELS[sig as SellSignal]}
              >
                {sig}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
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
