import type { CategoryKey, RankedRow } from "@stockrank/ranking";
import {
  formatPercent,
  formatRatio,
  formatScore,
} from "../lib/format.js";
import { FairValueBar } from "./FairValueBar.js";

export type DrillDownPanelProps = {
  row: RankedRow | null;
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  valuation: "Valuation",
  health: "Health",
  quality: "Quality",
  shareholderReturn: "Shareholder Return",
  growth: "Growth",
};

const CATEGORY_ORDER: CategoryKey[] = [
  "valuation",
  "health",
  "quality",
  "shareholderReturn",
  "growth",
];

export function DrillDownPanel({ row }: DrillDownPanelProps) {
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
        <h2>
          {row.symbol} <span className="drill-down__name">{row.name}</span>
        </h2>
        <p className="drill-down__sub">
          {row.industry} · {row.sector} · #{row.industryRank} in industry · #{row.universeRank} overall
        </p>
      </header>

      <section className="drill-down__category-scores">
        <h3>Category scores</h3>
        <ul>
          {CATEGORY_ORDER.map((cat) => (
            <li key={cat}>
              <span className="drill-down__cat-label">{CATEGORY_LABELS[cat]}</span>
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
      </section>

      <section className="drill-down__fair-value">
        <h3>Fair value</h3>
        <FairValueBar fairValue={row.fairValue} />
        {row.fairValue?.confidence && (
          <p className="drill-down__confidence">
            Confidence: <strong>{row.fairValue.confidence}</strong> ({row.fairValue.peerSet} peers, {row.fairValue.peerCount})
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
              <th>Raw</th>
              <th>Percentile</th>
            </tr>
          </thead>
          <tbody>
            {row.factorDetails.map((f) => (
              <tr key={f.key}>
                <td>{f.key}</td>
                <td>{CATEGORY_LABELS[f.category]}</td>
                <td>{formatRatio(f.rawValue)}</td>
                <td>{formatPercent(f.percentile, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {row.missingFactors.length > 0 && (
        <p className="drill-down__missing">
          Missing factors: {row.missingFactors.join(", ")}
        </p>
      )}
    </aside>
  );
}
