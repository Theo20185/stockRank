import type { FairValue } from "@stockrank/ranking";
import { formatPrice, formatPercent } from "../lib/format.js";

export type FairValueBarProps = {
  fairValue: FairValue | null;
};

export function FairValueBar({ fairValue }: FairValueBarProps) {
  if (!fairValue || !fairValue.range) {
    return <span className="fair-value fair-value--empty">—</span>;
  }
  const { range, current, upsideToMedianPct, confidence } = fairValue;
  const aboveRange = current > range.p75;
  const belowRange = current < range.p25;
  const tone = belowRange ? "below" : aboveRange ? "above" : "in-range";

  return (
    <div className={`fair-value fair-value--${tone}`} role="group" aria-label="Fair value range">
      <span className="fair-value__low">{formatPrice(range.p25)}</span>
      <span className="fair-value__mid" data-confidence={confidence}>
        {formatPrice(range.median)}
      </span>
      <span className="fair-value__high">{formatPrice(range.p75)}</span>
      <span className="fair-value__upside">
        {upsideToMedianPct !== null && upsideToMedianPct >= 0 ? "+" : ""}
        {formatPercent(upsideToMedianPct)}
      </span>
    </div>
  );
}
