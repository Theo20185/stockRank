import { useMemo, useRef, useState } from "react";
import type { FvTrendSample } from "@stockrank/core";
import { formatPrice } from "../lib/format.js";

export type FvAnchorKey = "p25" | "median" | "p75";

const ANCHOR_LABELS: Record<FvAnchorKey, string> = {
  p25: "Conservative",
  median: "Median",
  p75: "Optimistic",
};

const ANCHOR_FIELDS: Record<FvAnchorKey, "fvP25" | "fvMedian" | "fvP75"> = {
  p25: "fvP25",
  median: "fvMedian",
  p75: "fvP75",
};

const W = 320;
const H = 90;
const PAD_X = 4;
const PAD_Y = 8;

export type FvTrendSparklineProps = {
  samples: FvTrendSample[];
  /** Initial anchor — the page-wide convention is conservative (p25). */
  initialAnchor?: FvAnchorKey;
};

export function FvTrendSparkline({
  samples,
  initialAnchor = "p25",
}: FvTrendSparklineProps) {
  const [anchor, setAnchor] = useState<FvAnchorKey>(initialAnchor);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const usable = useMemo(
    () => samples.filter((s) => Number.isFinite(s.price)),
    [samples],
  );

  const scale = useMemo(() => {
    if (usable.length < 2) return null;
    const fvField = ANCHOR_FIELDS[anchor];
    const values: number[] = [];
    for (const s of usable) {
      values.push(s.price);
      const fv = s[fvField];
      if (fv !== null) values.push(fv);
    }
    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const padY = (maxY - minY) * 0.1 || 1;
    return { minY: minY - padY, maxY: maxY + padY };
  }, [usable, anchor]);

  if (usable.length < 2 || !scale) {
    return null;
  }

  const xFor = (i: number) =>
    PAD_X + (i / (usable.length - 1)) * (W - 2 * PAD_X);
  const yFor = (v: number) =>
    H - PAD_Y - ((v - scale.minY) / (scale.maxY - scale.minY)) * (H - 2 * PAD_Y);

  const pricePath = usable
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(s.price).toFixed(1)}`)
    .join(" ");

  const fvField = ANCHOR_FIELDS[anchor];
  const fvSegments: string[] = [];
  let started = false;
  for (let i = 0; i < usable.length; i += 1) {
    const v = usable[i]![fvField];
    if (v === null) {
      started = false;
      continue;
    }
    fvSegments.push(`${started ? "L" : "M"} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`);
    started = true;
  }
  const fvPath = fvSegments.join(" ");

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>): void {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const xRaw = ((e.clientX - rect.left) / rect.width) * W;
    // Snap to nearest sample index.
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < usable.length; i += 1) {
      const d = Math.abs(xFor(i) - xRaw);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  const hovered = hoverIdx !== null ? usable[hoverIdx] ?? null : null;

  return (
    <div className="fv-sparkline">
      <div className="fv-sparkline__header">
        <div className="fv-sparkline__title">FV trend (2y, quarterly)</div>
        <nav className="fv-sparkline__anchor-toggle" aria-label="FV anchor">
          {(Object.keys(ANCHOR_LABELS) as FvAnchorKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={anchor === key}
              onClick={() => setAnchor(key)}
            >
              {ANCHOR_LABELS[key]}
            </button>
          ))}
        </nav>
      </div>
      <svg
        ref={svgRef}
        className="fv-sparkline__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`FV trend sparkline; price line and ${ANCHOR_LABELS[anchor].toLowerCase()} fair-value line over the past 2 years`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <path
          className="fv-sparkline__fv-line"
          d={fvPath}
          fill="none"
        />
        <path
          className="fv-sparkline__price-line"
          d={pricePath}
          fill="none"
        />
        {hoverIdx !== null && (
          <line
            className="fv-sparkline__cursor"
            x1={xFor(hoverIdx)}
            x2={xFor(hoverIdx)}
            y1={PAD_Y}
            y2={H - PAD_Y}
          />
        )}
      </svg>
      <div className="fv-sparkline__legend">
        <span className="fv-sparkline__legend-item fv-sparkline__legend-item--price">
          Price
        </span>
        <span className="fv-sparkline__legend-item fv-sparkline__legend-item--fv">
          FV {ANCHOR_LABELS[anchor]}
        </span>
      </div>
      {hovered && (
        <div className="fv-sparkline__tooltip" role="status">
          <div className="fv-sparkline__tooltip-date">{hovered.date}</div>
          <div>price {formatPrice(hovered.price)}</div>
          <div>p25 {hovered.fvP25 !== null ? formatPrice(hovered.fvP25) : "—"}</div>
          <div>median {hovered.fvMedian !== null ? formatPrice(hovered.fvMedian) : "—"}</div>
          <div>p75 {hovered.fvP75 !== null ? formatPrice(hovered.fvP75) : "—"}</div>
        </div>
      )}
    </div>
  );
}
