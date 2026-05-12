/**
 * Integration test: render the Capital Plan screen against the actual
 * committed `public/data/options/*.json` files instead of synthetic
 * fixtures. The component tests (CapitalPlanScreen.test.tsx) exercise
 * the screen with controlled fixtures; this test catches the
 * production-bug class where the screen looks fine on synthetic data
 * but is broken against what the ingest actually writes.
 *
 * Bug history (2026-05-11): the screen defaulted to expiration mode
 * "monthly" but the ingest's expiration selector dropped the monthly
 * slot via dedupe when the soonest expiration was itself the next 3rd-
 * Friday. The user saw "no candidates have options chains" even though
 * 74 options JSONs were committed. The component tests passed because
 * they fed in OptionsViews containing the requested mode. This
 * integration test loads the on-disk JSONs verbatim and pins what's
 * actually available, so the same regression class fails loudly.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  OptionsView,
  RankedRow,
  SelectionReason,
} from "@stockrank/ranking";
import { CapitalPlanScreen } from "./CapitalPlanScreen.js";

const here = dirname(fileURLToPath(import.meta.url));
const OPTIONS_DIR = resolve(here, "../../../../public/data/options");

type LoadedFile = { symbol: string; view: OptionsView };

function loadCommittedOptions(): LoadedFile[] {
  const entries = readdirSync(OPTIONS_DIR).filter((f) => f.endsWith(".json"));
  return entries.map((file) => {
    const symbol = file.slice(0, -5);
    const raw = readFileSync(resolve(OPTIONS_DIR, file), "utf8");
    const view = JSON.parse(raw) as OptionsView;
    return { symbol, view };
  });
}

function fakeRow(symbol: string, composite = 70): RankedRow {
  return {
    symbol,
    name: `${symbol} Corp`,
    sector: "Industrials",
    industry: "Test",
    marketCap: 1e10,
    price: 100,
    composite,
    industryRank: 1,
    universeRank: 1,
    pctOffYearHigh: 10,
    pctAboveYearLow: 25,
    categoryScores: {
      valuation: 60, health: 60, quality: 60, shareholderReturn: 60, growth: 60,
      momentum: 60,
    },
    factorDetails: [],
    missingFactors: [],
    fairValue: null,
    negativeEquity: false,
    optionsLiquid: true,
    annualDividend: 0,
    fvTrend: "insufficient_data",
  };
}

function countByReason(files: LoadedFile[]): Record<SelectionReason, number> {
  const counts: Record<SelectionReason, number> = { weekly: 0, monthly: 0, yearly: 0 };
  for (const f of files) {
    for (const exp of f.view.expirations) {
      if (exp.selectionReason === "weekly") counts.weekly += 1;
      else if (exp.selectionReason === "monthly") counts.monthly += 1;
      else if (exp.selectionReason === "yearly") counts.yearly += 1;
    }
  }
  return counts;
}

describe("<CapitalPlanScreen /> — integration against committed options data", () => {
  const files = loadCommittedOptions();

  it("the committed options bundle is non-empty", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("every committed file declares at least one weekly expiration", () => {
    // The weekly slot is the soonest expiration — always populated when
    // the chain has any future date. Regression sentinel: if the
    // ingest ever drops weekly entirely, this catches it.
    for (const { symbol, view } of files) {
      const hasWeekly = view.expirations.some(
        (e) => e.selectionReason === "weekly",
      );
      expect(hasWeekly, `${symbol} has no weekly expiration`).toBe(true);
    }
  });

  it("the bundle contains at least one expiration per mode the UI exposes", () => {
    // Production-bug sentinel. Before the cascade fix, this assertion
    // failed for "monthly" — every committed file had only weekly +
    // yearly because the dedupe-drop rule killed monthly when the
    // soonest expiration was itself a 3rd-Friday. After the cascade
    // fix + re-ingest, all three modes are populated and the Plan
    // screen renders a usable table on any default selection.
    const counts = countByReason(files);
    expect(counts.weekly, "no committed file has a weekly slot").toBeGreaterThan(0);
    expect(counts.monthly, "no committed file has a monthly slot").toBeGreaterThan(0);
    expect(counts.yearly, "no committed file has a yearly slot").toBeGreaterThan(0);
  });

  it("monthly slot lands strictly between weekly and yearly when all three are present", () => {
    // Whatever the chain offers, the monthly slot must sit BETWEEN
    // weekly and yearly. Catches obvious selector breakage (monthly
    // landing past yearly, or monthly == weekly). Doesn't try to
    // assert "monthly within 30-50 DTE" universally because some
    // symbols' chains literally don't list every month — that's a
    // data sparsity issue, not a selector bug.
    const offenders: string[] = [];
    for (const { symbol, view } of files) {
      const weekly = view.expirations.find((e) => e.selectionReason === "weekly");
      const monthly = view.expirations.find((e) => e.selectionReason === "monthly");
      const yearly = view.expirations.find((e) => e.selectionReason === "yearly");
      if (!weekly || !monthly || !yearly) continue;
      if (weekly.expiration >= monthly.expiration) offenders.push(`${symbol}: weekly>=monthly`);
      if (monthly.expiration >= yearly.expiration) offenders.push(`${symbol}: monthly>=yearly`);
    }
    expect(offenders).toEqual([]);
  });

  it("every selected put + covered call in the committed bundle is strictly out-of-the-money", () => {
    // 2026-05-13 live-data audit caught 92 ITM puts under the old
    // "strikes ≤ p25" rule. The fix tightens the put filter to
    // strike < currentPrice and the call floor from >= to > current.
    // Sentinel: no committed options JSON may carry an ITM strike
    // through to the rendered put / covered-call rows.
    const itmPuts: string[] = [];
    const itmCalls: string[] = [];
    for (const { symbol, view } of files) {
      const cp = view.currentPrice;
      for (const exp of view.expirations) {
        for (const p of exp.puts) {
          if (p.contract.strike >= cp) {
            itmPuts.push(
              `${symbol} ${exp.selectionReason} K=${p.contract.strike} S=${cp.toFixed(2)}`,
            );
          }
        }
        for (const c of exp.coveredCalls) {
          if (c.contract.strike <= cp) {
            itmCalls.push(
              `${symbol} ${exp.selectionReason} K=${c.contract.strike} S=${cp.toFixed(2)}`,
            );
          }
        }
      }
    }
    expect(itmPuts, `ITM puts: ${itmPuts.slice(0, 10).join("; ")}`).toEqual([]);
    expect(itmCalls, `ITM calls: ${itmCalls.slice(0, 10).join("; ")}`).toEqual([]);
  });

  it("EIX-class regression: monthly picks the next listed 3rd-week date even when it's not a Friday", () => {
    // The 2026-05-11 bug: Yahoo returned EIX's June expiration as
    // "2026-06-18" — OCC symbol literally "EIX260618", which falls on
    // a UTC Thursday. The strict-Friday rule rejected it and picked
    // July 17 (67 DTE) instead of June 18 (38 DTE). The user expected
    // ~30-50 DTE. Sentinel: when EIX is in the committed bundle and
    // its monthly slot is populated, the slot's DTE must be ≤ 50 days.
    // If EIX drops out of the Ranked bucket later, the test is a no-op
    // — but until then it catches the exact production regression.
    const eix = files.find((f) => f.symbol === "EIX");
    if (!eix) return;
    const monthly = eix.view.expirations.find((e) => e.selectionReason === "monthly");
    if (!monthly) return;
    const dte = monthly.puts[0]?.contract.daysToExpiry
      ?? monthly.coveredCalls[0]?.contract.daysToExpiry;
    expect(dte, `EIX monthly DTE should be ≤ 50 (got ${dte})`).toBeLessThanOrEqual(50);
    expect(dte, `EIX monthly DTE should be positive`).toBeGreaterThan(0);
  });

  it("renders the Plan table for each expiration mode the data populates", async () => {
    // For each mode, pick the symbols whose JSON has a non-empty puts
    // entry for that mode, feed those into the Plan screen, and assert
    // the table renders with rows. This catches the regression where
    // the screen looks fine on synthetic data but ALL committed files
    // are missing the default mode (the 2026-05-11 bug).
    const onSelectTab = vi.fn();
    const onSelectStock = vi.fn();
    const user = userEvent.setup();

    const modes: SelectionReason[] = ["weekly", "monthly", "yearly"];
    for (const mode of modes) {
      const fixture: Record<string, OptionsView> = {};
      const rankedRows: RankedRow[] = [];
      for (const { symbol, view } of files) {
        const exp = view.expirations.find((e) => e.selectionReason === mode);
        if (!exp) continue;
        if (exp.puts.length === 0) continue;
        const put = exp.puts[0]!;
        if (put.contract.bid === null || put.contract.bid <= 0) continue;
        fixture[symbol] = view;
        rankedRows.push(fakeRow(symbol));
      }

      if (rankedRows.length === 0) continue;

      const { unmount } = render(
        <CapitalPlanScreen
          rankedRows={rankedRows}
          onSelectTab={onSelectTab}
          onSelectStock={onSelectStock}
          initialOptions={fixture}
        />,
      );

      // Switch to the mode under test (component defaults to monthly).
      const modeNav = within(
        screen.getByRole("navigation", { name: /expiration mode/i }),
      );
      await user.click(modeNav.getByRole("button", { name: new RegExp(mode, "i") }));

      const table = await screen.findByRole("table", {
        name: /capital allocation plan/i,
      });
      const dataRows = within(table).getAllByRole("row").slice(1);
      expect(dataRows.length, `mode=${mode} produced no rows`).toBeGreaterThan(0);
      unmount();
    }
  });

  it("default capital + default mode + Top N=blank produces at least one allocated contract", async () => {
    // Direct repro of the user's bug report: $70k capital, blank Top N,
    // default mode → "no candidates" empty state. With the cascade fix
    // the default mode (monthly) has populated puts and the table
    // shows at least one row with a non-zero contract count.
    const fixture: Record<string, OptionsView> = {};
    const rankedRows: RankedRow[] = [];
    for (const { symbol, view } of files) {
      const monthly = view.expirations.find((e) => e.selectionReason === "monthly");
      if (!monthly || monthly.puts.length === 0) continue;
      const put = monthly.puts[0]!;
      if (put.contract.bid === null || put.contract.bid <= 0) continue;
      fixture[symbol] = view;
      rankedRows.push(fakeRow(symbol));
    }
    expect(rankedRows.length, "monthly fixture must be non-empty").toBeGreaterThan(0);

    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        rankedRows={rankedRows}
        onSelectTab={vi.fn()}
        onSelectStock={vi.fn()}
        initialOptions={fixture}
      />,
    );
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "70000");

    await waitFor(() => {
      const table = screen.getByRole("table", { name: /capital allocation plan/i });
      const dataRows = within(table).getAllByRole("row").slice(1);
      const totalContracts = dataRows.reduce((sum, row) => {
        const cells = within(row).getAllByRole("cell");
        // Contracts is the 6th column (index 5): #, Symbol, Strike, DTE,
        // Premium / contract, Contracts, ...
        const n = parseInt(cells[5]!.textContent ?? "0", 10);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      expect(totalContracts).toBeGreaterThan(0);
    });
  });
});
