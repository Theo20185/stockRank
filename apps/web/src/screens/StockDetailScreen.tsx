import type { FvTrendSample } from "@stockrank/core";
import type { RankedRow } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { DrillDownPanel } from "../components/DrillDownPanel.js";
import { OptionsPanel } from "../components/OptionsPanel.js";

export type StockDetailScreenProps = {
  row: RankedRow | null;
  symbol: string;
  spaxxRate?: number;
  onSpaxxRateChange?: (rate: number) => void;
  onBack: () => void;
  /** Quarterly historical FV samples for this symbol (from
   * fv-trend.json). Optional — when absent the sparkline isn't
   * rendered, no error. */
  fvTrendSamples?: FvTrendSample[];
};

export function StockDetailScreen({
  row,
  symbol,
  spaxxRate,
  onSpaxxRateChange,
  onBack,
  fvTrendSamples,
}: StockDetailScreenProps) {
  return (
    <div className="screen screen--stock">
      {/* DrillDownPanel below already renders the symbol + company name as
          its own header — keep just the back button here. */}
      <AppHeader onBack={onBack} />
      {row ? (
        <>
          <DrillDownPanel row={row} fvTrendSamples={fvTrendSamples} />
          <OptionsPanel
            symbol={row.symbol}
            row={row}
            spaxxRate={spaxxRate}
            onSpaxxRateChange={onSpaxxRateChange}
          />
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
