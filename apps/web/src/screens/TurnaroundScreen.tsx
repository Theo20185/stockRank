import type { RankedSnapshot } from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { TurnaroundList } from "../components/TurnaroundList.js";

export type TurnaroundScreenProps = {
  ranked: RankedSnapshot;
  onSelectTab: (tab: "composite" | "turnaround" | "portfolio") => void;
};

export function TurnaroundScreen({ ranked, onSelectTab }: TurnaroundScreenProps) {
  return (
    <div className="screen screen--turnaround">
      <AppHeader
        title="Turnaround watchlist"
        subtitle="Long-term quality + TTM trough + ≥40% drawdown"
      />
      <nav className="app__tabs" aria-label="Sections">
        <button
          type="button"
          aria-pressed={false}
          onClick={() => onSelectTab("composite")}
        >
          Composite ({ranked.rows.length})
        </button>
        <button
          type="button"
          aria-pressed={true}
          onClick={() => onSelectTab("turnaround")}
        >
          Turnaround ({ranked.turnaroundWatchlist.length})
        </button>
        <button
          type="button"
          aria-pressed={false}
          onClick={() => onSelectTab("portfolio")}
        >
          Portfolio
        </button>
      </nav>

      <TurnaroundList rows={ranked.turnaroundWatchlist} />
    </div>
  );
}
