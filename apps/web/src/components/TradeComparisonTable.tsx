import {
  computeTradeComparison,
  SPAXX_RATE,
  type ProjectedEndCase,
  type TradeLeg,
} from "@stockrank/ranking";
import type { ExpirationView } from "@stockrank/ranking";
import { formatPercent, formatPrice } from "../lib/format.js";

export type TradeComparisonTableProps = {
  expiration: ExpirationView;
  symbol: string;
  currentPrice: number;
  annualDividend: number;
  fairValue: { p25: number; median: number; p75: number };
  scenario: ProjectedEndCase;
};

const SCENARIO_LABEL: Record<ProjectedEndCase, string> = {
  median: "Median FV",
  p25: "Conservative (p25)",
  flat: "Flat",
};

function formatPnl(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  const sign = value >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function formatRoi(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatPercent(value * 100, 1)}`;
}

type Row = {
  label: string;
  meta?: string;
  leg: TradeLeg | null;
};

export function TradeComparisonTable({
  expiration,
  symbol,
  currentPrice,
  annualDividend,
  fairValue,
  scenario,
}: TradeComparisonTableProps) {
  const callPick = expiration.coveredCalls[0] ?? null;
  const putPick = expiration.puts[0] ?? null;

  const result = computeTradeComparison({
    symbol,
    expiration: expiration.expiration,
    daysToExpiry: callPick?.contract.daysToExpiry
      ?? putPick?.contract.daysToExpiry
      ?? 0,
    currentPrice,
    annualDividendPerShare: annualDividend,
    fairValue,
    scenario,
    call: callPick && callPick.contract.bid !== null
      ? { strike: callPick.contract.strike, bid: callPick.contract.bid }
      : null,
    put: putPick && putPick.contract.bid !== null
      ? { strike: putPick.contract.strike, bid: putPick.contract.bid }
      : null,
  });

  const rows: Row[] = [
    { label: "Buy outright", leg: result.trades.buyOutright },
    {
      label: "Covered call",
      meta: callPick ? `K=${formatPrice(callPick.contract.strike)}` : undefined,
      leg: result.trades.coveredCall,
    },
    {
      label: "Cash-secured put",
      meta: putPick ? `K=${formatPrice(putPick.contract.strike)}` : undefined,
      leg: result.trades.cashSecuredPut,
    },
    { label: "Hold cash (SPAXX)", leg: result.trades.holdCashSpaxx },
  ];

  // Find the winner by annualized ROI for highlighting.
  let winnerIdx = -1;
  let bestRoi = -Infinity;
  rows.forEach((r, i) => {
    if (r.leg && r.leg.roiAnnualized > bestRoi) {
      bestRoi = r.leg.roiAnnualized;
      winnerIdx = i;
    }
  });

  const baselineRoi = result.trades.holdCashSpaxx.roiAnnualized;

  return (
    <div className="trade-table">
      <div className="trade-table__caption">
        <span>
          Projected at {SCENARIO_LABEL[scenario]} ={" "}
          <strong>{formatPrice(result.projectedEndPrice)}</strong>
        </span>
        <span className="trade-table__caption-meta">
          SPAXX: {formatPercent(result.spaxxRate * 100, 2)}/yr ·{" "}
          {result.daysToExpiry}d to expiry
        </span>
      </div>
      <table className="options-table" aria-label="Trade comparison">
        <thead>
          <tr>
            <th>Trade</th>
            <th className="num">Capital</th>
            <th className="num">Stock</th>
            <th className="num">Div</th>
            <th className="num">Premium</th>
            <th className="num">SPAXX</th>
            <th className="num">Total</th>
            <th className="num">ROI (annl)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (!row.leg) {
              return (
                <tr key={row.label} className="trade-table__row trade-table__row--empty">
                  <td>
                    {row.label}
                    {row.meta && <span className="trade-table__meta">{row.meta}</span>}
                  </td>
                  <td colSpan={7} className="num">no strike available</td>
                </tr>
              );
            }
            const beatsBaseline = row.leg.roiAnnualized > baselineRoi;
            const indicator = i === 3 ? "" : beatsBaseline ? " ↑" : " ↓";
            return (
              <tr
                key={row.label}
                className={
                  i === winnerIdx
                    ? "trade-table__row trade-table__row--winner"
                    : "trade-table__row"
                }
              >
                <td>
                  {row.label}
                  {row.meta && <span className="trade-table__meta">{row.meta}</span>}
                  {row.leg.assigned !== undefined && (
                    <span className="trade-table__assigned">
                      {row.leg.assigned ? "assigned" : "expires worthless"}
                    </span>
                  )}
                </td>
                <td className="num">{formatPrice(row.leg.initialCapital)}</td>
                <td className="num">{formatPnl(row.leg.stockPnl)}</td>
                <td className="num">{formatPnl(row.leg.dividendPnl)}</td>
                <td className="num">{formatPnl(row.leg.premiumPnl)}</td>
                <td className="num">{formatPnl(row.leg.spaxxPnl)}</td>
                <td className="num"><strong>{formatPnl(row.leg.totalPnl)}</strong></td>
                <td className="num">
                  <strong>{formatRoi(row.leg.roiAnnualized)}</strong>
                  <span className="trade-table__indicator">{indicator}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { SPAXX_RATE };
