import type { CategoryKey, RankedRow } from "@stockrank/ranking";
import {
  categoryLabel,
  factorLabel,
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatRatio,
  formatScore,
} from "../lib/format.js";
import { FairValueBar } from "./FairValueBar.js";

export type DrillDownPanelProps = {
  row: RankedRow | null;
  /** Mobile only: show a close button that calls this when tapped. */
  onClose?: () => void;
};

const CATEGORY_ORDER: CategoryKey[] = [
  "valuation",
  "health",
  "quality",
  "shareholderReturn",
  "growth",
];

export function DrillDownPanel({ row, onClose }: DrillDownPanelProps) {
  if (!row) {
    return (
      <aside className="drill-down drill-down--empty" aria-label="Stock detail">
        <p>Select a row to see factor contributions.</p>
      </aside>
    );
  }

  return (
    <aside className="drill-down" aria-label={`Detail for ${row.symbol}`}>
      <header className="drill-down__header">
        <div className="drill-down__title">
          <h2>
            {row.symbol} <span className="drill-down__name">{row.name}</span>
          </h2>
          {onClose && (
            <button
              type="button"
              className="drill-down__close"
              aria-label="Close detail"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
        <p className="drill-down__sub">
          {row.industry} · #{row.industryRank} in industry · #{row.universeRank} overall
        </p>
        <p className="drill-down__price">
          <strong>{formatPrice(row.price)}</strong>
          <span className="drill-down__price-context">
            {" "}· {formatPercent(row.pctOffYearHigh, 1)} off 52-week high
            {" "}· {formatMarketCap(row.marketCap)}
          </span>
        </p>
      </header>

      <section className="drill-down__category-scores">
        <h3>Category scores</h3>
        <ul>
          {CATEGORY_ORDER.map((cat) => (
            <li key={cat}>
              <span className="drill-down__cat-label">{categoryLabel(cat)}</span>
              <span className="drill-down__cat-score">
                {formatScore(row.categoryScores[cat])}
              </span>
            </li>
          ))}
          <li className="drill-down__composite">
            <span className="drill-down__cat-label">Composite</span>
            <span className="drill-down__cat-score">{formatScore(row.composite)}</span>
          </li>
        </ul>
        {row.negativeEquity && (
          <p className="drill-down__neg-equity">
            <strong>Negative shareholders' equity</strong> — sustained
            buybacks have driven book equity below zero. ROIC and P/B
            null out as a structural artifact, not a data gap.
          </p>
        )}
      </section>

      <section className="drill-down__fair-value">
        <h3>Fair value</h3>
        <FairValueBar fairValue={row.fairValue} />
        {row.fairValue?.confidence && (
          <p className="drill-down__confidence">
            Confidence: <strong>{row.fairValue.confidence}</strong> ({row.fairValue.peerSet} peers, {row.fairValue.peerCount})
          </p>
        )}
        {row.fairValue?.peerCohortDivergent && (
          <p className="drill-down__neg-equity">
            <strong>Peer cohort deemed unreliable</strong> — peer-median
            multiples diverge from this stock's own historical multiple
            by more than 3×. The fair-value range above reflects only
            the company's own valuation history; peer-derived anchors
            were dropped.
          </p>
        )}
        {row.fairValue?.ttmTreatment === "normalized" && (
          <p className="drill-down__neg-equity">
            <strong>TTM EPS normalized</strong> — the most recent annual
            EPS looked like a one-time spike (vs prior-3-year mean and
            forward consensus). The peer-median P/E anchor used the
            normalized prior mean instead.
          </p>
        )}
      </section>

      <section className="drill-down__factors">
        <h3>Factor contributions</h3>
        <table>
          <thead>
            <tr>
              <th>Factor</th>
              <th>Category</th>
              <th className="num">Raw</th>
              <th className="num">Pctile</th>
            </tr>
          </thead>
          <tbody>
            {row.factorDetails.map((f) => (
              <tr key={f.key}>
                <td>{factorLabel(f.key)}</td>
                <td>{categoryLabel(f.category)}</td>
                <td className="num">{formatRatio(f.rawValue)}</td>
                <td className="num">{formatPercent(f.percentile, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {row.missingFactors.length > 0 && (
        <p className="drill-down__missing">
          Missing: {row.missingFactors.map(factorLabel).join(", ")}
        </p>
      )}
    </aside>
  );
}
