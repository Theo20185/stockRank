import { useEffect, useMemo, useRef, useState } from "react";
import type { OptionsView, RankedRow } from "@stockrank/ranking";
import {
  buildCapitalPlan,
  type CapitalPlan,
  type CapitalPlanCandidate,
} from "@stockrank/ranking";
import { AppHeader } from "../components/AppHeader.js";
import { formatPercent, formatPrice } from "../lib/format.js";
import {
  loadOptionsView,
  type OptionsLoadResult,
} from "../snapshot/options-loader.js";
import {
  loadPlanPrefs,
  savePlanPrefs,
  type PlanPrefs,
} from "../snapshot/plan-prefs-loader.js";

export type PlanTab = "composite" | "portfolio" | "plan";

export type CapitalPlanScreenProps = {
  rankedRows: RankedRow[];
  onSelectTab: (tab: PlanTab) => void;
  onSelectStock: (symbol: string) => void;
  /** Test seam: stub the per-symbol options loader. Defaults to the production loader. */
  loader?: (symbol: string) => Promise<OptionsLoadResult>;
  /** Test seam: pre-supply options data so the screen renders the table synchronously. */
  initialOptions?: Record<string, OptionsView>;
};

type LoadStatus = "loading" | "ready";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07-17" → "2026-07". Robust to ISO timestamps too. */
function yearMonthOf(iso: string): string {
  return iso.slice(0, 7);
}

/** "2026-07" → "Jul 2026". Used for the picker labels and chips. */
function formatYearMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const idx = parseInt(m ?? "0", 10) - 1;
  return `${MONTH_LABELS[idx] ?? m} ${y}`;
}

export function CapitalPlanScreen({
  rankedRows,
  onSelectTab,
  onSelectStock,
  loader = loadOptionsView,
  initialOptions,
}: CapitalPlanScreenProps) {
  // Hydrate from localStorage on first render — defaults are inlined
  // by the loader when no prefs exist yet. Subsequent mutations
  // auto-save via the useEffect below.
  const initialPrefs = useRef<PlanPrefs>(loadPlanPrefs()).current;
  const [capitalInput, setCapitalInput] = useState<string>(initialPrefs.capital);
  const [topNInput, setTopNInput] = useState<string>(initialPrefs.topN);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    initialPrefs.selectedMonth,
  );
  const [hideUnallocated, setHideUnallocated] = useState<boolean>(
    initialPrefs.hideUnallocated,
  );
  const [excludedSymbols, setExcludedSymbols] = useState<ReadonlySet<string>>(
    () => new Set(initialPrefs.excludedSymbols),
  );

  // Auto-save on any pref change. Mirrors the portfolio-loader pattern
  // — device-local, fail-silent on storage errors. savedAt updates so
  // the user can see when the in-memory state last persisted.
  useEffect(() => {
    savePlanPrefs({
      capital: capitalInput,
      topN: topNInput,
      selectedMonth,
      hideUnallocated,
      excludedSymbols: [...excludedSymbols],
      savedAt: new Date().toISOString(),
    });
  }, [capitalInput, topNInput, selectedMonth, hideUnallocated, excludedSymbols]);

  const toggleExclude = (symbol: string): void => {
    setExcludedSymbols((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };
  const [options, setOptions] = useState<Record<string, OptionsView>>(
    initialOptions ?? {},
  );
  const [status, setStatus] = useState<LoadStatus>(
    initialOptions ? "ready" : "loading",
  );
  const [loaded, setLoaded] = useState(initialOptions ? rankedRows.length : 0);

  useEffect(() => {
    if (initialOptions) return;
    let cancelled = false;
    setStatus("loading");
    setOptions({});
    setLoaded(0);
    const symbols = rankedRows.map((r) => r.symbol);
    if (symbols.length === 0) {
      setStatus("ready");
      return;
    }
    Promise.all(
      symbols.map(async (symbol) => {
        try {
          const result = await loader(symbol);
          if (cancelled) return;
          if (result.status === "loaded") {
            setOptions((prev) => ({ ...prev, [symbol]: result.view }));
          }
        } catch {
          // Per-symbol fetch failures are surfaced as "no options for this
          // name" in the plan output. Don't blow up the whole screen.
        } finally {
          if (!cancelled) setLoaded((n) => n + 1);
        }
      }),
    ).then(() => {
      if (!cancelled) setStatus("ready");
    });
    return () => {
      cancelled = true;
    };
  }, [rankedRows, loader, initialOptions]);

  const capital = Number.parseFloat(capitalInput);
  const safeCapital = Number.isFinite(capital) && capital > 0 ? capital : 0;
  const topN = topNInput.trim() === "" ? undefined : Number.parseInt(topNInput, 10);
  const safeTopN = topN !== undefined && Number.isFinite(topN) ? topN : undefined;

  // All distinct expiration months across the loaded options, sorted
  // ascending. Drives the month picker; empty until options load.
  const availableMonths = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const view of Object.values(options)) {
      for (const exp of view.expirations) {
        set.add(yearMonthOf(exp.expiration));
      }
    }
    return [...set].sort();
  }, [options]);

  // Effective month: explicit pick if set + valid, else the soonest
  // available month with candidates. Used for both extractCandidates
  // and the picker's current value.
  const effectiveMonth = useMemo<string>(() => {
    if (selectedMonth && availableMonths.includes(selectedMonth)) {
      return selectedMonth;
    }
    return availableMonths[0] ?? "";
  }, [selectedMonth, availableMonths]);

  const candidates = useMemo(
    () => extractCandidates(rankedRows, options, effectiveMonth),
    [rankedRows, options, effectiveMonth],
  );

  const plan = useMemo<CapitalPlan>(
    () => {
      const input: Parameters<typeof buildCapitalPlan>[0] = {
        capital: safeCapital,
        candidates,
        excludedSymbols,
      };
      if (safeTopN !== undefined) input.topN = safeTopN;
      return buildCapitalPlan(input);
    },
    [safeCapital, candidates, safeTopN, excludedSymbols],
  );

  return (
    <div className="screen screen--plan">
      <AppHeader
        title="StockRank — Capital Plan"
        subtitle="Allocate cash collateral across cash-secured puts on the top Candidates"
      />

      <nav className="app__tabs" aria-label="Sections">
        <button type="button" aria-pressed={false} onClick={() => onSelectTab("composite")}>
          Composite
        </button>
        <button type="button" aria-pressed={false} onClick={() => onSelectTab("portfolio")}>
          Portfolio
        </button>
        <button type="button" aria-pressed={true} onClick={() => onSelectTab("plan")}>
          Plan
        </button>
      </nav>

      <section className="plan__controls" aria-label="Plan inputs">
        <label className="plan__field">
          <span>Capital ($)</span>
          <input
            type="number"
            min="0"
            step="500"
            value={capitalInput}
            onChange={(e) => setCapitalInput(e.target.value)}
            aria-label="Capital available for put collateral"
          />
        </label>
        <label className="plan__field">
          <span>Top N (optional)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={topNInput}
            placeholder={`all ${candidates.length}`}
            onChange={(e) => setTopNInput(e.target.value)}
            aria-label="Maximum number of candidates"
          />
        </label>
        <label className="plan__field">
          <span>Target expiration month</span>
          <select
            aria-label="Target expiration month"
            value={effectiveMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            disabled={availableMonths.length === 0}
          >
            {availableMonths.length === 0 && (
              <option value="">(no options loaded yet)</option>
            )}
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatYearMonth(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="plan__field plan__field--checkbox">
          <input
            type="checkbox"
            checked={hideUnallocated}
            onChange={(e) => setHideUnallocated(e.target.checked)}
          />
          <span>Hide unallocated</span>
        </label>
      </section>

      {status === "loading" && (
        <p className="plan__status" role="status">
          Loading options data… ({loaded}/{rankedRows.length})
        </p>
      )}

      {status === "ready" && (
        <PlanSummary plan={plan} candidatesAvailable={candidates.length} selectedMonth={effectiveMonth} />
      )}

      {status === "ready" && plan.items.length > 0 && (
        <PlanTable
          plan={plan}
          selectedMonth={effectiveMonth}
          hideUnallocated={hideUnallocated}
          excludedSymbols={excludedSymbols}
          onToggleExclude={toggleExclude}
          onSelectStock={onSelectStock}
        />
      )}

      {status === "ready" && candidates.length === 0 && (
        <p className="plan__status" role="status">
          No Ranked candidates have a cash-secured put listed for{" "}
          {effectiveMonth ? formatYearMonth(effectiveMonth) : "any month"}.
          {" "}Re-run <code>npm run ingest</code> to refresh option chains, or pick a
          different month above.
        </p>
      )}
    </div>
  );
}

/**
 * Pick the best expiration for each ranked row given the user's
 * target month:
 *   1. Prefer the expiration whose YYYY-MM equals `targetMonth`.
 *   2. Fall back to the soonest expiration AFTER targetMonth's
 *      first day (i.e., the next available chain in the future).
 *   3. Skip the symbol entirely when neither produces a usable put.
 * The returned candidate carries the actual expirationDate so the
 * PlanTable can render a "fallback to <month>" chip when the
 * actual month differs from the user's pick.
 */
function extractCandidates(
  rows: RankedRow[],
  options: Record<string, OptionsView>,
  targetMonth: string,
): CapitalPlanCandidate[] {
  const out: CapitalPlanCandidate[] = [];
  for (const row of rows) {
    const view = options[row.symbol];
    if (!view) continue;
    const exp = pickExpirationForMonth(view.expirations, targetMonth);
    if (!exp) continue;
    const put = exp.puts[0];
    if (!put || put.contract.bid === null || put.contract.bid <= 0) continue;
    out.push({
      symbol: row.symbol,
      strike: put.contract.strike,
      premiumPerShare: put.contract.bid,
      daysToExpiry: put.contract.daysToExpiry,
      annualizedReturn: put.notAssignedAnnualizedPct,
      composite: row.composite,
      expirationDate: exp.expiration,
    });
  }
  return out;
}

export function pickExpirationForMonth<T extends { expiration: string }>(
  expirations: T[],
  targetMonth: string,
): T | null {
  if (!targetMonth) {
    // No preference — pick the soonest.
    const sorted = [...expirations].sort((a, b) =>
      a.expiration.localeCompare(b.expiration),
    );
    return sorted[0] ?? null;
  }
  // First, exact match on YYYY-MM.
  const exact = expirations.find((e) => yearMonthOf(e.expiration) === targetMonth);
  if (exact) return exact;
  // Otherwise, soonest expiration AFTER the target month's first day.
  const targetStart = `${targetMonth}-01`;
  const after = [...expirations]
    .filter((e) => e.expiration > targetStart)
    .sort((a, b) => a.expiration.localeCompare(b.expiration));
  return after[0] ?? null;
}

function PlanSummary({
  plan,
  candidatesAvailable,
  selectedMonth,
}: {
  plan: CapitalPlan;
  candidatesAvailable: number;
  selectedMonth: string;
}) {
  const usedCount = plan.items.filter((i) => i.contracts > 0).length;
  const annualized = plan.annualizedReturnOnAllocated;
  const annualDollars =
    annualized !== null ? plan.allocated * annualized : null;
  return (
    <section className="plan__summary" aria-label="Plan summary">
      <Stat label="Capital" value={formatDollars(plan.capital)} />
      <Stat
        label="Total invested capital"
        value={formatDollars(plan.allocated)}
        sub={
          plan.capital > 0
            ? `${formatPercent((plan.allocated / plan.capital) * 100)} of capital`
            : undefined
        }
      />
      <Stat label="Remaining cash" value={formatDollars(plan.remaining)} />
      <Stat label="Total premium" value={formatDollars(plan.totalPremium)} />
      <Stat
        label="Annualized return on collateral"
        value={annualized !== null ? formatPercent(annualized * 100) : "—"}
        sub={
          annualDollars !== null
            ? `≈ ${formatDollars(annualDollars)}/yr if rolled`
            : undefined
        }
      />
      <Stat
        label="Names allocated"
        value={`${usedCount} / ${candidatesAvailable}`}
        sub={selectedMonth ? `${formatYearMonth(selectedMonth)} expiration` : ""}
      />
    </section>
  );
}

function PlanTable({
  plan,
  selectedMonth,
  hideUnallocated,
  excludedSymbols,
  onToggleExclude,
  onSelectStock,
}: {
  plan: CapitalPlan;
  selectedMonth: string;
  hideUnallocated: boolean;
  excludedSymbols: ReadonlySet<string>;
  onToggleExclude: (symbol: string) => void;
  onSelectStock: (symbol: string) => void;
}) {
  // Tag each item with its position in the unfiltered plan so the
  // ordinal column reflects composite rank, not visible-row index.
  // Hiding zero-contract rows then leaves gaps in the numbering
  // (e.g. 1, 3, 7) rather than renumbering survivors.
  const ordered = plan.items.map((item, idx) => ({ item, ordinal: idx + 1 }));
  // Excluded rows stay visible even under hide-unallocated so the user
  // can re-include them. Hide-unallocated only drops names that got 0
  // contracts because of budget constraints, not user-driven skips.
  const visible = hideUnallocated
    ? ordered.filter(
        ({ item }) =>
          item.contracts > 0 || excludedSymbols.has(item.symbol),
      )
    : ordered;
  return (
    <table className="plan-table" aria-label="Capital allocation plan">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Symbol</th>
          <th scope="col">Strike</th>
          <th scope="col">DTE</th>
          <th scope="col">Premium / contract</th>
          <th scope="col">Contracts</th>
          <th scope="col">Collateral</th>
          <th scope="col">Premium</th>
          <th scope="col">Annualized</th>
          <th scope="col" aria-label="Include / Exclude"></th>
        </tr>
      </thead>
      <tbody>
        {visible.map(({ item, ordinal }) => {
          const isExcluded = excludedSymbols.has(item.symbol);
          const rowClass = [
            item.contracts === 0 ? "plan-table__row--zero" : null,
            isExcluded ? "plan-table__row--excluded" : null,
          ]
            .filter(Boolean)
            .join(" ") || undefined;
          return (
            <tr key={item.symbol} className={rowClass}>
              <td>{ordinal}</td>
              <td>
                <button
                  type="button"
                  className="plan-table__symbol"
                  onClick={() => onSelectStock(item.symbol)}
                >
                  {item.symbol}
                </button>
                {selectedMonth &&
                  yearMonthOf(item.expirationDate) !== selectedMonth && (
                    <span
                      className="plan-table__fallback-chip"
                      role="status"
                      title={`No chain expires in ${formatYearMonth(selectedMonth)} — using ${formatYearMonth(yearMonthOf(item.expirationDate))} instead.`}
                    >
                      {formatYearMonth(yearMonthOf(item.expirationDate))}
                    </span>
                  )}
              </td>
              <td>{formatPrice(item.strike)}</td>
              <td>{item.daysToExpiry}d</td>
              <td>{formatDollars(item.premiumPerShare * 100)}</td>
              <td>{item.contracts}</td>
              <td>{formatDollars(item.totalCollateral)}</td>
              <td>{formatDollars(item.totalPremium)}</td>
              <td>{formatPercent(item.annualizedReturn * 100)}</td>
              <td>
                <button
                  type="button"
                  className="plan-table__exclude"
                  aria-label={
                    isExcluded
                      ? `Include ${item.symbol}`
                      : `Exclude ${item.symbol}`
                  }
                  onClick={() => onToggleExclude(item.symbol)}
                >
                  {isExcluded ? "Include" : "Exclude"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="plan__stat">
      <div className="plan__stat-label">{label}</div>
      <div className="plan__stat-value">{value}</div>
      {sub && <div className="plan__stat-sub">{sub}</div>}
    </div>
  );
}

function formatDollars(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-US", {
    maximumFractionDigits: abs < 100 ? 2 : 0,
    minimumFractionDigits: 0,
  })}`;
}
