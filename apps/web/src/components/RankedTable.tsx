import { useMemo, useState } from "react";
import type { RankedRow } from "@stockrank/ranking";
import {
  formatMarketCap,
  formatPercent,
  formatPrice,
  formatScore,
} from "../lib/format.js";
import { FairValueBar } from "./FairValueBar.js";

export type SortKey =
  | "universeRank"
  | "industryRank"
  | "composite"
  | "pctOffYearHigh"
  | "marketCap";

export type RankedTableProps = {
  rows: RankedRow[];
  selectedSymbol: string | null;
  onSelect: (symbol: string) => void;
};

const SORT_HEADERS: Array<{ key: SortKey; label: string; defaultDesc: boolean }> = [
  { key: "universeRank", label: "Rank", defaultDesc: false },
  { key: "industryRank", label: "Industry #", defaultDesc: false },
  { key: "composite", label: "Composite", defaultDesc: true },
  { key: "pctOffYearHigh", label: "Off 52w High", defaultDesc: true },
  { key: "marketCap", label: "Market Cap", defaultDesc: true },
];

export function RankedTable({ rows, selectedSymbol, onSelect }: RankedTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("universeRank");
  const [sortDesc, setSortDesc] = useState(false);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDesc ? -cmp : cmp;
    });
    return out;
  }, [rows, sortKey, sortDesc]);

  return (
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
                {h.label}
              </button>
            </th>
          ))}
          <th>Symbol</th>
          <th>Name</th>
          <th>Industry</th>
          <th>Price</th>
          <th>Fair value</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
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
            <td>{row.universeRank}</td>
            <td>{row.industryRank}</td>
            <td>{formatScore(row.composite)}</td>
            <td>{formatPercent(row.pctOffYearHigh)}</td>
            <td>{formatMarketCap(row.marketCap)}</td>
            <td className="ranked-table__symbol">{row.symbol}</td>
            <td>{row.name}</td>
            <td>{row.industry}</td>
            <td>{formatPrice(row.price)}</td>
            <td>
              <FairValueBar fairValue={row.fairValue} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
