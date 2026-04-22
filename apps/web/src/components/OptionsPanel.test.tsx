import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import type { OptionsView, RankedRow } from "@stockrank/ranking";
import { OptionsPanel } from "./OptionsPanel.js";
import type { OptionsLoadResult } from "../snapshot/options-loader.js";

function fakeView(): OptionsView {
  return {
    symbol: "DECK",
    fetchedAt: "2026-04-20T12:00:00.000Z",
    currentPrice: 90,
    expirations: [
      {
        expiration: "2027-01-15",
        selectionReason: "leap",
        coveredCalls: [
          {
            label: "conservative",
            anchor: "p25",
            anchorPrice: 95,
            contract: {
              contractSymbol: "DECK270115C00095000",
              expiration: "2027-01-15",
              daysToExpiry: 270,
              strike: 95,
              bid: 8,
              ask: 8.2,
              lastPrice: 8,
              volume: 10,
              openInterest: 100,
              impliedVolatility: 0.4,
              inTheMoney: false,
            },
            snapWarning: false,
            shortDated: false,
            staticReturnPct: 0.0889,
            staticAnnualizedPct: 0.1202,
            assignedReturnPct: 0.1444,
            assignedAnnualizedPct: 0.1953,
            effectiveCostBasis: 82,
            effectiveDiscountPct: 0.0889,
          },
        ],
        puts: [
          {
            label: "deep-value",
            anchor: "p25",
            anchorPrice: 95,
            contract: {
              contractSymbol: "DECK270115P00080000",
              expiration: "2027-01-15",
              daysToExpiry: 270,
              strike: 80,
              bid: 4,
              ask: 4.2,
              lastPrice: 4,
              volume: 5,
              openInterest: 50,
              impliedVolatility: 0.4,
              inTheMoney: false,
            },
            snapWarning: true,
            shortDated: false,
            notAssignedReturnPct: 0.05,
            notAssignedAnnualizedPct: 0.0676,
            effectiveCostBasis: 76,
            effectiveDiscountPct: 0.1556,
            inTheMoney: false,
          },
        ],
      },
    ],
  };
}

function fakeRow(overrides: Partial<RankedRow> = {}): RankedRow {
  return {
    symbol: "DECK",
    name: "Deckers Outdoor Corp",
    sector: "Consumer Discretionary",
    industry: "Footwear",
    marketCap: 15_000_000_000,
    price: 90,
    composite: 60,
    industryRank: 1,
    universeRank: 5,
    pctOffYearHigh: 18,
    categoryScores: {
      valuation: 55, health: 60, quality: 70, shareholderReturn: 50, growth: 80,
    },
    factorDetails: [],
    missingFactors: [],
    fairValue: {
      peerSet: "cohort",
      peerCount: 8,
      anchors: {
        peerMedianPE: 110, peerMedianEVEBITDA: 115, peerMedianPFCF: 120,
        ownHistoricalPE: 105, ownHistoricalEVEBITDA: 108, ownHistoricalPFCF: 112,
        normalizedPE: 109, normalizedEVEBITDA: 113, normalizedPFCF: 117,
      },
      range: { p25: 100, median: 115, p75: 130 },
      current: 90,
      upsideToP25Pct: 11.1,
      upsideToMedianPct: 27.8,
      confidence: "high",
      ttmTreatment: "ttm",
      ebitdaTreatment: "ttm",
      peerCohortDivergent: false,
    },
    negativeEquity: false,
    optionsLiquid: true,
    annualDividend: 0,
    ...overrides,
  };
}

function loaderReturning(result: OptionsLoadResult) {
  return vi.fn(async () => result);
}

describe("<OptionsPanel /> — load states", () => {
  it("shows a loading state before the loader resolves", () => {
    const loader = vi.fn(() => new Promise<OptionsLoadResult>(() => {}));
    render(<OptionsPanel symbol="DECK" row={fakeRow()} loader={loader} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading options/i);
  });

  it("shows the not-in-Ranked-bucket message when no chain has been fetched", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "not-fetched" })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        /DECK isn't in the Ranked bucket/i,
      ),
    );
  });

  it("shows an error when the loader throws", async () => {
    const loader = vi.fn(async (): Promise<OptionsLoadResult> => {
      throw new Error("HTTP 500");
    });
    render(<OptionsPanel symbol="DECK" row={fakeRow()} loader={loader} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 500/),
    );
  });
});

describe("<OptionsPanel /> — single trade-comparison table per expiration", () => {
  it("renders one expiration section with the date + selection-reason badge", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("table", { name: /trade comparison/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Jan 15, 2027/)).toBeInTheDocument();
    expect(screen.getByText(/^LEAPS$/)).toBeInTheDocument();
  });

  it("renders the five trade rows: buy outright, buy-write, covered call, cash-secured put, hold cash", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    const table = await screen.findByRole("table", { name: /trade comparison/i });
    const t = within(table);
    expect(t.getByText("Buy outright")).toBeInTheDocument();
    expect(t.getByText("Buy-write")).toBeInTheDocument();
    expect(t.getByText("Covered call")).toBeInTheDocument();
    expect(t.getByText("Cash-secured put")).toBeInTheDocument();
    expect(t.getByText(/Hold cash/)).toBeInTheDocument();
  });

  it("shows contract detail subtitle (strike, bid, DTE, IV, OI) on option rows", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await screen.findByRole("table", { name: /trade comparison/i });
    // Call detail appears on both buy-write AND covered-call rows.
    const callDetails = screen.getAllByText(
      /K=\$95\.00 · bid \$8\.00 · 270d · IV 40% · OI 100/,
    );
    expect(callDetails).toHaveLength(2);
    // Put row: strike 80, bid 4, 270d, IV 40%, OI 50 — appears once.
    expect(screen.getByText(/K=\$80\.00 · bid \$4\.00 · 270d · IV 40% · OI 50/)).toBeInTheDocument();
  });

  it("renders snap-warning chip when the strike is off-target", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await screen.findByRole("table", { name: /trade comparison/i });
    // Put strike 80 vs anchor 95 → 16% off
    expect(screen.getByText(/16% off target/)).toBeInTheDocument();
  });

  it("renders ITM chip on in-the-money puts", async () => {
    const view = fakeView();
    view.expirations[0]!.puts[0]!.inTheMoney = true;
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view })}
      />,
    );
    await screen.findByRole("table", { name: /trade comparison/i });
    expect(screen.getByText("ITM")).toBeInTheDocument();
  });

  it("shows the suppression message when puts are suppressed", async () => {
    const view = fakeView();
    view.expirations[0]!.puts = [];
    view.expirations[0]!.putsSuppressedReason = "above-conservative-tail";
    render(
      <OptionsPanel
        symbol="DECK"
        row={fakeRow()}
        loader={loaderReturning({ status: "loaded", view })}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/at or above its conservative-tail fair value/i),
      ).toBeInTheDocument(),
    );
  });

  it("re-fetches when the symbol changes", async () => {
    const loader = vi.fn(async (sym: string): Promise<OptionsLoadResult> => ({
      status: "loaded",
      view: { ...fakeView(), symbol: sym, expirations: [] },
    }));
    const { rerender } = render(<OptionsPanel symbol="DECK" row={fakeRow()} loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalledWith("DECK"));
    rerender(<OptionsPanel symbol="NVO" row={fakeRow({ symbol: "NVO" })} loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalledWith("NVO"));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
