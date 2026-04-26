import type { FvTrendSample } from "@stockrank/core";
import type { BucketRationale, CategoryKey, RankedRow } from "@stockrank/ranking";
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
import { FvTrendSparkline } from "./FvTrendSparkline.js";

const BUCKET_DISPLAY_LABEL: Record<BucketRationale["bucket"], string> = {
  ranked: "Candidate",
  watch: "Watch",
  avoid: "Avoid",
};

export type DrillDownPanelProps = {
  row: RankedRow | null;
  /** Mobile only: show a close button that calls this when tapped. */
  onClose?: () => void;
  /** Quarterly historical FV samples for this row's symbol. Sourced
   * from the loaded fv-trend.json artifact. When undefined or empty,
   * the sparkline isn't rendered. */
  fvTrendSamples?: FvTrendSample[];
  /** Bucket rationale (headline + strengths + weaknesses) for this
   * row. When provided, rendered as a "Why this bucket?" callout
   * at the top of the panel. */
  rationale?: BucketRationale | null;
};

const CATEGORY_ORDER: CategoryKey[] = [
  "valuation",
  "health",
  "quality",
  "shareholderReturn",
  "growth",
];

export function DrillDownPanel({ row, onClose, fvTrendSamples, rationale }: DrillDownPanelProps) {
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
            {" "}· {formatPercent(row.pctAboveYearLow, 1)} above 52-week low
            {" "}· {formatMarketCap(row.marketCap)}
          </span>
        </p>
      </header>

      {rationale && (
        <section
          className={`drill-down__rationale drill-down__rationale--${rationale.bucket}`}
          aria-label="Why this bucket"
        >
          <header className="drill-down__rationale-header">
            <span className={`drill-down__bucket-badge drill-down__bucket-badge--${rationale.bucket}`}>
              {BUCKET_DISPLAY_LABEL[rationale.bucket]}
            </span>
            <p className="drill-down__rationale-headline">{rationale.headline}</p>
          </header>
          {(rationale.strengths.length > 0 || rationale.weaknesses.length > 0) && (
            <div className="drill-down__rationale-grid">
              <div className="drill-down__rationale-col">
                <h4>Strengths</h4>
                {rationale.strengths.length === 0 ? (
                  <p className="drill-down__rationale-empty">
                    Nothing stands out — categories scoring near the median.
                  </p>
                ) : (
                  <ul>
                    {rationale.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="drill-down__rationale-col">
                <h4>Weaknesses</h4>
                {rationale.weaknesses.length === 0 ? (
                  <p className="drill-down__rationale-empty">
                    No flagged weaknesses — categories scoring near the median or above.
                  </p>
                ) : (
                  <ul>
                    {rationale.weaknesses.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="drill-down__fair-value">
        <h3>Fair value</h3>
        <FairValueBar fairValue={row.fairValue} />
        {fvTrendSamples && fvTrendSamples.length >= 2 && (
          <FvTrendSparkline samples={fvTrendSamples} />
        )}
        {row.fairValue?.confidence && (
          <p className="drill-down__confidence">
            Confidence: <strong>{row.fairValue.confidence}</strong> ({row.fairValue.peerSet} peers, {row.fairValue.peerCount})
          </p>
        )}
        {row.fairValue?.anchors &&
          (() => {
            const fired = Object.values(row.fairValue.anchors).filter(
              (v) => v !== null && v !== undefined,
            ).length;
            if (fired >= 6) return null;
            return (
              <p className="drill-down__neg-equity">
                <strong>Limited-anchor estimate</strong> — only {fired} of 9
                valuation anchors fired. The fair-value range above is
                computed on a narrow set of metrics (typically PE-only for
                names where EV/EBITDA and P/FCF aren't meaningful, like
                asset managers, insurers, utilities). Treat the precision
                with skepticism.
              </p>
            );
          })()}
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
        {row.fairValue?.ebitdaTreatment === "normalized" && (
          <p className="drill-down__neg-equity">
            <strong>TTM EBITDA normalized</strong> — the most recent
            annual EBITDA exceeded 1.5× the prior-3-year mean. The
            peer-median EV/EBITDA anchor used the normalized prior mean
            instead, so a one-time gain doesn't inflate the implied
            enterprise value.
          </p>
        )}
        {row.fvTrend === "declining" && (
          <p className="drill-down__neg-equity">
            <strong>FV declining</strong> — the projected fair value
            has been trending down over the past ~2 years (linear-
            regression slope below −5%/yr). Per the back-test miss
            analysis, ~96% of names that miss the projected p25 tail
            also see their FV decline together. Demoted to Watch until
            the trend reverses.
          </p>
        )}
      </section>

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
            {row.factorDetails
              .filter((f) => f.category !== "momentum")
              .map((f) => (
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

      {(() => {
        const visibleMissing = row.missingFactors.filter(
          (k) => k !== "momentum12_1",
        );
        if (visibleMissing.length === 0) return null;
        return (
          <p className="drill-down__missing">
            Missing: {visibleMissing.map(factorLabel).join(", ")}
          </p>
        );
      })()}
    </aside>
  );
}
