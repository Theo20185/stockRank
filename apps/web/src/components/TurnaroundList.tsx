import type { TurnaroundRow } from "@stockrank/ranking";
import { formatPercent, formatPrice, turnaroundReasonLabel } from "../lib/format.js";
import { FairValueBar } from "./FairValueBar.js";

export type TurnaroundListProps = {
  rows: TurnaroundRow[];
};

export function TurnaroundList({ rows }: TurnaroundListProps) {
  if (rows.length === 0) {
    return (
      <p className="turnaround turnaround--empty" role="status">
        No names currently meet the turnaround criteria (long-term quality + TTM trough + ≥40% drawdown).
      </p>
    );
  }
  return (
    <table className="turnaround" aria-label="Turnaround watchlist">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Name</th>
          <th>Industry</th>
          <th className="num">Price</th>
          <th className="num">Off 52w High</th>
          <th>Reasons</th>
          <th>Fair value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.symbol}>
            <td className="turnaround__symbol">{row.symbol}</td>
            <td>{row.name}</td>
            <td>{row.industry}</td>
            <td className="num">{formatPrice(row.price)}</td>
            <td className="num">{formatPercent(row.pctOffYearHigh)}</td>
            <td>{row.reasons.map(turnaroundReasonLabel).join(" · ")}</td>
            <td>
              <FairValueBar fairValue={row.fairValue} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
