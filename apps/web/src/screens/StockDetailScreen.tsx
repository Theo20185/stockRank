import type { RankedRow } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { DrillDownPanel } from "../components/DrillDownPanel.js";
import { OptionsPanel } from "../components/OptionsPanel.js";

export type StockDetailScreenProps = {
  row: RankedRow | null;
  symbol: string;
  onBack: () => void;
};

export function StockDetailScreen({ row, symbol, onBack }: StockDetailScreenProps) {
  return (
    <div className="screen screen--stock">
      <AppHeader
        title={row ? row.symbol : symbol}
        subtitle={row?.name}
        onBack={onBack}
      />
      {row ? (
        <>
          <DrillDownPanel row={row} />
          <OptionsPanel symbol={row.symbol} />
        </>
      ) : (
        <p className="screen__not-found" role="status">
          {symbol} isn't in the current ranked snapshot. It may have been
          excluded by the quality floor (check the turnaround watchlist) or
          dropped from the universe.
        </p>
      )}
    </div>
  );
}
