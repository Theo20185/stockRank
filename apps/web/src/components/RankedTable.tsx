import { useMemo, useState } from "react";
import type { OptionsSummary } from "@stockrank/core";
import type { RankedRow } from "@stockrank/ranking";
import {
  formatPercent,
  formatPrice,
  formatScore,
} from "../lib/format.js";
import { FairValueBar } from "./FairValueBar.js";

export type SortKey =
  | "universeRank"
  | "industryRank"
  | "composite"
  | "upside"
  | "bestCall"
  | "bestPut";

export type RankedTableProps = {
  rows: RankedRow[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
  /** Per-symbol best annualized covered-call / put returns. Optional —
   * when null, the Best Call / Best Put columns render "—". */
  optionsSummary?: OptionsSummary | null;
};

const SORT_HEADERS: Array<{
  key: SortKey;
  label: string;
  shortLabel: string;
  defaultDesc: boolean;
}> = [
  { key: "universeRank", label: "Rank", shortLabel: "#", defaultDesc: false },
  { key: "industryRank", label: "Ind. #", shortLabel: "Ind.", defaultDesc: false },
  { key: "composite", label: "Composite", shortLabel: "Score", defaultDesc: true },
  { key: "upside", label: "Upside", shortLabel: "Upside", defaultDesc: true },
  { key: "bestCall", label: "Best Call %", shortLabel: "Call", defaultDesc: true },
  { key: "bestPut", label: "Best Put %", shortLabel: "Put", defaultDesc: true },
];

function upsideOf(row: RankedRow): number {
  // Sentinel: rows with no fair value sort to the bottom either direction
  // (for desc, -Infinity puts them last; for asc, also last via the same).
  const v = row.fairValue?.upsideToMedianPct;
  return v === null || v === undefined ? -Infinity : v;
}

function bestCallOf(symbol: string, summary: OptionsSummary | null): number | null {
  return summary?.symbols[symbol]?.bestCallAnnualized ?? null;
}

function bestPutOf(symbol: string, summary: OptionsSummary | null): number | null {
  return summary?.symbols[symbol]?.bestPutAnnualized ?? null;
}

/** Sort sentinel: missing options data sorts to the bottom in desc, top in asc. */
function sortValOrSentinel(v: number | null): number {
  return v === null ? -Infinity : v;
}

/** Render an annualized fraction (0.18 → "+18%"); "—" when null. */
function formatBestReturn(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const pct = value * 100;
  return `${pct >= 0 ? "+" : ""}${formatPercent(pct, 0)}`;
}

export function RankedTable({
  rows,
  selectedSymbol,
  onSelect,
  optionsSummary = null,
}: RankedTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("universeRank");
  const [sortDesc, setSortDesc] = useState(false);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av =
        sortKey === "upside"
          ? upsideOf(a)
          : sortKey === "bestCall"
            ? sortValOrSentinel(bestCallOf(a.symbol, optionsSummary))
            : sortKey === "bestPut"
              ? sortValOrSentinel(bestPutOf(a.symbol, optionsSummary))
              : a[sortKey];
      const bv =
        sortKey === "upside"
          ? upsideOf(b)
          : sortKey === "bestCall"
            ? sortValOrSentinel(bestCallOf(b.symbol, optionsSummary))
            : sortKey === "bestPut"
              ? sortValOrSentinel(bestPutOf(b.symbol, optionsSummary))
              : b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return out;
  }, [rows, sortKey, sortDesc, optionsSummary]);

  return (
    <div className="ranked-table-wrap">
      <table className="ranked-table" aria-label="Ranked stocks">
        <thead>
          <tr>
            {SORT_HEADERS.map((h) => (
              <th
                key={h.key}
                role="columnheader"
                aria-sort={
                  sortKey !== h.key
                    ? "none"
                    : sortDesc
                      ? "descending"
                      : "ascending"
                }
                className="num"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (sortKey === h.key) {
                      setSortDesc((d) => !d);
                    } else {
                      setSortKey(h.key);
                      setSortDesc(h.defaultDesc);
                    }
                  }}
                >
                  <span className="th-long">{h.label}</span>
                  <span className="th-short">{h.shortLabel}</span>
                  {sortKey === h.key && (
                    <span className="th-arrow" aria-hidden>
                      {sortDesc ? "▾" : "▴"}
                    </span>
                  )}
                </button>
              </th>
            ))}
            <th>Symbol · Price</th>
            <th className="hide-mobile">Name</th>
            <th className="hide-mobile">Industry</th>
            <th className="hide-mobile">Fair value</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const upside = row.fairValue?.upsideToMedianPct;
            return (
              <tr
                key={row.symbol}
                className={row.symbol === selectedSymbol ? "is-selected" : undefined}
                onClick={() => onSelect(row.symbol)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(row.symbol);
                  }
                }}
              >
                <td className="num">{row.universeRank}</td>
                <td className="num">{row.industryRank}</td>
                <td className="num">{formatScore(row.composite)}</td>
                <td className="num">
                  {upside === null || upside === undefined
                    ? "—"
                    : `${upside >= 0 ? "+" : ""}${formatPercent(upside, 0)}`}
                </td>
                <td className="num">{formatBestReturn(bestCallOf(row.symbol, optionsSummary))}</td>
                <td className="num">{formatBestReturn(bestPutOf(row.symbol, optionsSummary))}</td>
                <td className="ranked-table__symbol">
                  <span className="ranked-table__sym">{row.symbol}</span>
                  {row.negativeEquity && (
                    <span
                      className="ranked-table__chip"
                      title="Negative shareholders' equity from buybacks — ROIC and P/B are structurally null"
                    >
                      neg-eq
                    </span>
                  )}
                  <span className="ranked-table__price">{formatPrice(row.price)}</span>
                </td>
                <td className="hide-mobile">{row.name}</td>
                <td className="hide-mobile">{row.industry}</td>
                <td className="hide-mobile">
                  <FairValueBar fairValue={row.fairValue} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
