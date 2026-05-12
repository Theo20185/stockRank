import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OptionsView, RankedRow } from "@stockrank/ranking";
import { CapitalPlanScreen } from "./CapitalPlanScreen.js";
import { PLAN_PREFS_STORAGE_KEY } from "../snapshot/plan-prefs-loader.js";

beforeEach(() => {
  // Reset persisted plan prefs so localStorage from a prior test
  // doesn't leak into the defaults of the next render.
  try {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PLAN_PREFS_STORAGE_KEY);
    }
  } catch {
    // ignore — jsdom localStorage failures shouldn't fail the suite
  }
});

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

function fakeOptionsView(
  symbol: string,
  options: {
    weeklyStrike?: number;
    weeklyBid?: number;
    monthlyStrike?: number;
    monthlyBid?: number;
    yearlyStrike?: number;
    yearlyBid?: number;
  } = {},
): OptionsView {
  const expirations: OptionsView["expirations"] = [];
  if (options.weeklyStrike !== undefined) {
    expirations.push(
      makeExpiration("2026-05-15", "weekly", options.weeklyStrike, options.weeklyBid ?? 1),
    );
  }
  if (options.monthlyStrike !== undefined) {
    expirations.push(
      makeExpiration("2026-06-19", "monthly", options.monthlyStrike, options.monthlyBid ?? 2),
    );
  }
  if (options.yearlyStrike !== undefined) {
    expirations.push(
      makeExpiration("2027-01-15", "yearly", options.yearlyStrike, options.yearlyBid ?? 8),
    );
  }
  return {
    symbol,
    fetchedAt: "2026-05-11T00:00:00.000Z",
    currentPrice: 95,
    expirations,
  };
}

function makeExpiration(
  expiration: string,
  selectionReason: "weekly" | "monthly" | "yearly",
  strike: number,
  bid: number,
): OptionsView["expirations"][number] {
  return {
    expiration,
    selectionReason,
    coveredCalls: [],
    puts: [
      {
        label: "deep-value",
        anchor: "p25",
        anchorPrice: strike,
        contract: {
          contractSymbol: `${expiration}P${strike}`,
          expiration,
          daysToExpiry: 30,
          strike,
          bid,
          ask: bid + 0.1,
          lastPrice: bid,
          volume: 10,
          openInterest: 100,
          impliedVolatility: 0.3,
          inTheMoney: false,
        },
        snapWarning: false,
        shortDated: false,
        notAssignedReturnPct: 0.05,
        notAssignedAnnualizedPct: 0.6,
        effectiveCostBasis: strike - bid,
        effectiveDiscountPct: 0.05,
        inTheMoney: false,
      },
    ],
  };
}

describe("<CapitalPlanScreen />", () => {
  const baseProps = {
    onSelectTab: vi.fn(),
    onSelectStock: vi.fn(),
  };

  it("renders the form and tabs immediately", () => {
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[]}
        initialOptions={{}}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: /capital plan/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/capital available/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/maximum number of candidates/i)).toBeInTheDocument();
    const modes = within(screen.getByRole("navigation", { name: /expiration mode/i }));
    expect(modes.getByRole("button", { name: /weekly/i })).toBeInTheDocument();
    expect(modes.getByRole("button", { name: /monthly/i })).toBeInTheDocument();
    expect(modes.getByRole("button", { name: /yearly/i })).toBeInTheDocument();
  });

  it("shows a loading indicator while per-symbol options are being fetched", async () => {
    const pending = new Promise(() => {}); // never resolves
    const loader = vi.fn(() => pending) as unknown as (
      symbol: string,
    ) => Promise<never>;
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA")]}
        loader={loader}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/loading options data/i);
  });

  it("renders the allocation table for the current expiration mode", async () => {
    // capital $30k, 3 names: AAA $50 strike, BBB $100 strike, CCC $25 strike
    // (monthly expiration on each). Equal budget $10k → 2 / 1 / 4 contracts.
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA", 80), fakeRow("BBB", 75), fakeRow("CCC", 70)]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50, monthlyBid: 1 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 100, monthlyBid: 2 }),
          CCC: fakeOptionsView("CCC", { monthlyStrike: 25, monthlyBid: 0.5 }),
        }}
      />,
    );
    // Plan auto-builds from initial capital $10k. Re-enter to $30k.
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "30000");

    const table = await screen.findByRole("table", { name: /capital allocation plan/i });
    const rows = within(table).getAllByRole("row");
    // 1 header + 3 data rows
    expect(rows).toHaveLength(4);
    const dataRows = rows.slice(1);
    expect(within(dataRows[0]!).getByText("AAA")).toBeInTheDocument();
    expect(within(dataRows[0]!).getByText("2")).toBeInTheDocument();   // contracts
    expect(within(dataRows[1]!).getByText("BBB")).toBeInTheDocument();
    expect(within(dataRows[1]!).getByText("1")).toBeInTheDocument();
    expect(within(dataRows[2]!).getByText("CCC")).toBeInTheDocument();
    expect(within(dataRows[2]!).getByText("4")).toBeInTheDocument();
  });

  it("switches candidates when the expiration mode changes", async () => {
    // AAA has weekly + yearly; BBB has monthly only.
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { weeklyStrike: 50, yearlyStrike: 60 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 40 }),
        }}
      />,
    );
    // Default mode "monthly" → only BBB shows.
    const table1 = await screen.findByRole("table", { name: /capital allocation plan/i });
    expect(within(table1).queryByText("AAA")).toBeNull();
    expect(within(table1).getByText("BBB")).toBeInTheDocument();

    // Switch to weekly → only AAA.
    await user.click(
      within(screen.getByRole("navigation", { name: /expiration mode/i }))
        .getByRole("button", { name: /weekly/i }),
    );
    const table2 = screen.getByRole("table", { name: /capital allocation plan/i });
    expect(within(table2).getByText("AAA")).toBeInTheDocument();
    expect(within(table2).queryByText("BBB")).toBeNull();
  });

  it("caps allocation to topN when supplied", async () => {
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB"), fakeRow("CCC")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 40 }),
          CCC: fakeOptionsView("CCC", { monthlyStrike: 25 }),
        }}
      />,
    );
    // Set Top N = 2 → only AAA + BBB participate. CCC must not appear.
    const topN = screen.getByLabelText(/maximum number of candidates/i);
    await user.clear(topN);
    await user.type(topN, "2");

    const table = await screen.findByRole("table", { name: /capital allocation plan/i });
    expect(within(table).getByText("AAA")).toBeInTheDocument();
    expect(within(table).getByText("BBB")).toBeInTheDocument();
    expect(within(table).queryByText("CCC")).toBeNull();
  });

  it("shows an empty-state message when no candidates match the mode", async () => {
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50 }),
        }}
      />,
    );
    // Default is monthly so AAA matches; switch to yearly to drop it.
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole("navigation", { name: /expiration mode/i }))
        .getByRole("button", { name: /yearly/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /no Ranked candidates have a yearly expiration/i,
      ),
    );
  });

  it("shows total invested capital and the annualized return on collateral", async () => {
    // Two names, $20k capital, both $50 strikes (4 contracts @ $5k each
    // gets allocated in equal chunks). The summary panel must surface:
    //   - Total invested capital  → $20,000
    //   - Annualized return       → 15% (weighted average of 20% and 10%)
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50, monthlyBid: 1 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 50, monthlyBid: 1 }),
        }}
      />,
    );
    // The fakeOptionsView preset annualized return is 0.6 for both legs,
    // so the weighted average is also 0.6 = 60%.
    const user = userEvent.setup();
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "20000");

    const summary = screen.getByRole("region", { name: /plan summary/i });
    // "Allocated" already serves as total-invested-capital; the new
    // stat is the headline annualized return on that capital.
    const stat = within(summary).getByText(/annualized return on collateral/i);
    const value = stat.parentElement!.querySelector(".plan__stat-value")!;
    expect(value.textContent).toMatch(/60\.0%/);
  });

  it("hides unallocated (zero-contract) rows when the toggle is on", async () => {
    // Capital $5k with three names: AAA $20 strike ($2k/contract — fits),
    // BBB $100 strike ($10k/contract — doesn't fit, zero contracts),
    // CCC $30 strike ($3k/contract — fits).
    // Equal budget $1666 → AAA 0, BBB 0, CCC 0. Then top-up fills AAA
    // (1@$2k → $3k left), CCC (1@$3k → $0 left). Final: AAA=1, BBB=0, CCC=1.
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB"), fakeRow("CCC")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 20 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 100 }),
          CCC: fakeOptionsView("CCC", { monthlyStrike: 30 }),
        }}
      />,
    );
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "5000");

    // Default state: all three rows visible (one with 0 contracts).
    let table = await screen.findByRole("table", { name: /capital allocation plan/i });
    expect(within(table).getByText("AAA")).toBeInTheDocument();
    expect(within(table).getByText("BBB")).toBeInTheDocument();
    expect(within(table).getByText("CCC")).toBeInTheDocument();

    // Toggle hide-unallocated on — BBB (the zero-contract row) disappears.
    const toggle = screen.getByLabelText(/hide unallocated/i);
    await user.click(toggle);
    table = screen.getByRole("table", { name: /capital allocation plan/i });
    expect(within(table).getByText("AAA")).toBeInTheDocument();
    expect(within(table).queryByText("BBB")).toBeNull();
    expect(within(table).getByText("CCC")).toBeInTheDocument();

    // Toggle back off — BBB reappears.
    await user.click(toggle);
    table = screen.getByRole("table", { name: /capital allocation plan/i });
    expect(within(table).getByText("BBB")).toBeInTheDocument();
  });

  it("preserves original ordinal numbers when zero-contract rows are hidden", async () => {
    // Same fixture as the hide test: AAA=#1, BBB=#2 (hidden), CCC=#3.
    // When BBB drops out, CCC must still display "3", not get renumbered
    // to "2". The ordinal anchors a stable visual reference to the
    // composite ranking; renumbering would imply CCC moved up.
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB"), fakeRow("CCC")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 20 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 100 }),
          CCC: fakeOptionsView("CCC", { monthlyStrike: 30 }),
        }}
      />,
    );
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "5000");

    await user.click(screen.getByLabelText(/hide unallocated/i));
    const table = screen.getByRole("table", { name: /capital allocation plan/i });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    // Ordinal is the first cell; ticker is the second.
    const ordinals = rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent);
    const tickers = rows.map((r) => within(r).getAllByRole("cell")[1]!.textContent);
    expect(ordinals).toEqual(["1", "3"]);
    expect(tickers).toEqual(["AAA", "CCC"]);
  });

  it("exposes a per-row Exclude button that zeroes that name's contracts and reallocates", async () => {
    // Capital $30k, 3 names: AAA $50, BBB $100, CCC $25.
    // Default budget $10k each → AAA=2, BBB=1, CCC=4 contracts.
    // Excluding BBB redistributes the $10k that would have funded it
    // back into AAA + CCC.
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA", 80), fakeRow("BBB", 75), fakeRow("CCC", 70)]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50, monthlyBid: 1 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 100, monthlyBid: 2 }),
          CCC: fakeOptionsView("CCC", { monthlyStrike: 25, monthlyBid: 0.5 }),
        }}
      />,
    );
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "30000");

    let table = await screen.findByRole("table", { name: /capital allocation plan/i });
    // Pre-exclusion: AAA=2, BBB=1, CCC=4.
    const rowFor = (sym: string) =>
      within(table)
        .getAllByRole("row")
        .find((r) => within(r).queryByText(sym) !== null)!;
    expect(within(rowFor("BBB")).getAllByRole("cell")[5]!.textContent).toBe("1");

    // Click the Exclude button on the BBB row.
    await user.click(within(rowFor("BBB")).getByRole("button", { name: /exclude/i }));
    table = screen.getByRole("table", { name: /capital allocation plan/i });

    // After exclusion: BBB is 0; AAA + CCC absorb the freed capital.
    const bbbContracts = within(rowFor("BBB")).getAllByRole("cell")[5]!.textContent;
    const aaaContracts = within(rowFor("AAA")).getAllByRole("cell")[5]!.textContent;
    const cccContracts = within(rowFor("CCC")).getAllByRole("cell")[5]!.textContent;
    expect(bbbContracts).toBe("0");
    // AAA budget rises from $10k → $15k → 3 contracts (was 2).
    expect(aaaContracts).toBe("3");
    // CCC budget rises from $10k → $15k → 6 contracts (was 4).
    expect(cccContracts).toBe("6");

    // The BBB row's button now reads "Include" so the user can revert.
    expect(within(rowFor("BBB")).getByRole("button", { name: /include/i })).toBeInTheDocument();
  });

  it("persists capital / top N / mode / hide-toggle / exclusions across mounts via localStorage", async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 40 }),
        }}
      />,
    );
    const capital = screen.getByLabelText(/capital available/i);
    await user.clear(capital);
    await user.type(capital, "12500");
    const topN = screen.getByLabelText(/maximum number of candidates/i);
    await user.clear(topN);
    await user.type(topN, "5");
    await user.click(screen.getByLabelText(/hide unallocated/i));

    await screen.findByRole("table", { name: /capital allocation plan/i });
    const findRow = (sym: string) =>
      within(screen.getByRole("table", { name: /capital allocation plan/i }))
        .getAllByRole("row")
        .find((r) => within(r).queryByText(sym) !== null);
    await waitFor(() => {
      const row = findRow("BBB");
      expect(row).toBeDefined();
    });
    const bbbRow = findRow("BBB")!;
    await user.click(within(bbbRow).getByRole("button", { name: /^exclude bbb$/i }));
    unmount();

    // Re-mount the screen with no initialOptions — it should pull the
    // prefs we just saved (capital, topN, mode, hideUnallocated,
    // excludedSymbols) and re-apply them.
    render(
      <CapitalPlanScreen
        {...baseProps}
        rankedRows={[fakeRow("AAA"), fakeRow("BBB")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50 }),
          BBB: fakeOptionsView("BBB", { monthlyStrike: 40 }),
        }}
      />,
    );
    expect(
      (screen.getByLabelText(/capital available/i) as HTMLInputElement).value,
    ).toBe("12500");
    expect(
      (screen.getByLabelText(/maximum number of candidates/i) as HTMLInputElement).value,
    ).toBe("5");
    expect(
      (screen.getByLabelText(/hide unallocated/i) as HTMLInputElement).checked,
    ).toBe(true);
    // BBB stays excluded — its Include button must be present.
    const tablePost = screen.getByRole("table", { name: /capital allocation plan/i });
    const bbbPost = within(tablePost)
      .getAllByRole("row")
      .find((r) => within(r).queryByText("BBB") !== null)!;
    expect(within(bbbPost).getByRole("button", { name: /include/i })).toBeInTheDocument();
  });

  it("navigates to a stock when its symbol button is clicked", async () => {
    const onSelectStock = vi.fn();
    const user = userEvent.setup();
    render(
      <CapitalPlanScreen
        {...baseProps}
        onSelectStock={onSelectStock}
        rankedRows={[fakeRow("AAA")]}
        initialOptions={{
          AAA: fakeOptionsView("AAA", { monthlyStrike: 50 }),
        }}
      />,
    );
    const table = await screen.findByRole("table", { name: /capital allocation plan/i });
    await user.click(within(table).getByText("AAA"));
    expect(onSelectStock).toHaveBeenCalledWith("AAA");
  });
});
