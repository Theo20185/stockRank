import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import type { OptionsView } from "@stockrank/ranking";
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
            label: "stretch",
            anchor: "p75",
            anchorPrice: 130,
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

function loaderReturning(result: OptionsLoadResult) {
  return vi.fn(async () => result);
}

describe("<OptionsPanel />", () => {
  it("shows a loading state before the loader resolves", () => {
    const loader = vi.fn(() => new Promise<OptionsLoadResult>(() => {}));
    render(<OptionsPanel symbol="DECK" loader={loader} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading options/i);
  });

  it("shows the not-in-Ranked-bucket message when no chain has been fetched", async () => {
    render(<OptionsPanel symbol="DECK" loader={loaderReturning({ status: "not-fetched" })} />);
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
    render(<OptionsPanel symbol="DECK" loader={loader} />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 500/),
    );
  });

  it("renders one section per expiration with covered-call + put tables", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("table", { name: /covered calls/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("table", { name: /cash-secured puts/i })).toBeInTheDocument();
    expect(screen.getByText(/Jan 15, 2027/)).toBeInTheDocument();
    expect(screen.getByText(/^LEAPS$/)).toBeInTheDocument();
    expect(screen.getByText(/If you own this stock today/)).toBeInTheDocument();
    expect(screen.getByText(/If you want to own this stock/)).toBeInTheDocument();
  });

  it("renders covered-call row with strike, bid, DTE, returns, and effective cost", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await waitFor(() => screen.getByRole("table", { name: /covered calls/i }));
    const callTable = within(screen.getByRole("table", { name: /covered calls/i }));
    const dataRow = callTable.getAllByRole("row")[1]!;
    expect(within(dataRow).getByText("$95.00")).toBeInTheDocument();   // strike
    expect(within(dataRow).getByText("$8.00")).toBeInTheDocument();    // bid
    expect(within(dataRow).getByText("270d")).toBeInTheDocument();
    expect(within(dataRow).getByText("$82.00")).toBeInTheDocument();   // effective cost
    expect(within(dataRow).getByText(/Conservative/)).toBeInTheDocument();
  });

  it("renders snapWarning chip when strike is off-target", async () => {
    render(
      <OptionsPanel
        symbol="DECK"
        loader={loaderReturning({ status: "loaded", view: fakeView() })}
      />,
    );
    await waitFor(() => screen.getByRole("table", { name: /cash-secured puts/i }));
    // Put strike 80 vs anchor 130 → 38% off
    const putTable = within(screen.getByRole("table", { name: /cash-secured puts/i }));
    expect(putTable.getByText(/38% off target/)).toBeInTheDocument();
  });

  it("shows the suppression message when puts are suppressed", async () => {
    const view = fakeView();
    view.expirations[0]!.puts = [];
    view.expirations[0]!.putsSuppressedReason = "above-conservative-tail";
    render(
      <OptionsPanel symbol="DECK" loader={loaderReturning({ status: "loaded", view })} />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/at or above its conservative-tail fair value/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows ITM chip on in-the-money puts", async () => {
    const view = fakeView();
    view.expirations[0]!.puts[0]!.inTheMoney = true;
    render(
      <OptionsPanel symbol="DECK" loader={loaderReturning({ status: "loaded", view })} />,
    );
    await waitFor(() => screen.getByRole("table", { name: /cash-secured puts/i }));
    expect(screen.getByText("ITM")).toBeInTheDocument();
  });

  it("re-fetches when the symbol changes", async () => {
    const loader = vi.fn(async (sym: string): Promise<OptionsLoadResult> => ({
      status: "loaded",
      view: { ...fakeView(), symbol: sym, expirations: [] },
    }));
    const { rerender } = render(<OptionsPanel symbol="DECK" loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalledWith("DECK"));
    rerender(<OptionsPanel symbol="NVO" loader={loader} />);
    await waitFor(() => expect(loader).toHaveBeenCalledWith("NVO"));
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
