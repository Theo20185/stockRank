import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Portfolio } from "@stockrank/core";
import { evaluatePortfolio } from "@stockrank/ranking";
import type { RankedSnapshot } from "@stockrank/ranking";
import { PortfolioScreen } from "./PortfolioScreen.js";

const EMPTY_SNAPSHOT: RankedSnapshot = {
  snapshotDate: "2026-04-26",
  weights: { valuation: 0.5, health: 0.2, quality: 0.1, shareholderReturn: 0.1, growth: 0.1, momentum: 0 },
  universeSize: 0,
  excludedCount: 0,
  rows: [],
  ineligibleRows: [],
  turnaroundWatchlist: [],
};

function buildProps(portfolio: Portfolio) {
  return {
    portfolio,
    evaluation: evaluatePortfolio(portfolio, EMPTY_SNAPSHOT),
    onSelectStock: vi.fn(),
    onSelectTab: vi.fn(),
    onPortfolioChange: vi.fn(),
  };
}

describe("<PortfolioScreen />", () => {
  it("shows empty-state copy when portfolio is empty", () => {
    const props = buildProps({ updatedAt: "2026-04-26T00:00:00Z", positions: [] });
    render(<PortfolioScreen {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no positions yet/i);
  });

  it("renders + Add position button", () => {
    const props = buildProps({ updatedAt: "2026-04-26T00:00:00Z", positions: [] });
    render(<PortfolioScreen {...props} />);
    expect(screen.getByRole("button", { name: /\+ add position/i })).toBeInTheDocument();
  });

  it("opens the add-position form when the button is clicked", async () => {
    const user = userEvent.setup();
    const props = buildProps({ updatedAt: "2026-04-26T00:00:00Z", positions: [] });
    render(<PortfolioScreen {...props} />);
    await user.click(screen.getByRole("button", { name: /\+ add position/i }));
    expect(screen.getByRole("region", { name: /add a new position/i })).toBeInTheDocument();
  });

  it("submits a new stock position when the stock form is filled out", async () => {
    const user = userEvent.setup();
    const props = buildProps({ updatedAt: "2026-04-26T00:00:00Z", positions: [] });
    render(<PortfolioScreen {...props} />);
    await user.click(screen.getByRole("button", { name: /\+ add position/i }));
    const form = screen.getByRole("region", { name: /add a new position/i });
    const formScope = within(form);
    await user.type(formScope.getByLabelText(/^Ticker$/i), "MSFT");
    await user.clear(formScope.getByLabelText(/^Shares$/i));
    await user.type(formScope.getByLabelText(/^Shares$/i), "10");
    await user.clear(formScope.getByLabelText(/^Total cost basis/i));
    await user.type(formScope.getByLabelText(/^Total cost basis/i), "4000");
    await user.click(formScope.getByRole("button", { name: /add stock/i }));
    expect(props.onPortfolioChange).toHaveBeenCalledTimes(1);
    const next = (props.onPortfolioChange.mock.calls[0]![0]) as Portfolio;
    expect(next.positions).toHaveLength(1);
    expect(next.positions[0]).toMatchObject({
      kind: "stock",
      symbol: "MSFT",
      shares: 10,
      costBasis: 4000,
    });
  });

  it("renders a stock section when a stock position exists", () => {
    const props = buildProps({
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "stock",
          id: "abc",
          symbol: "AAPL",
          entryDate: "2025-01-01",
          shares: 10,
          costBasis: 1500,
        },
      ],
    });
    render(<PortfolioScreen {...props} />);
    expect(screen.getByRole("region", { name: /stock positions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AAPL" })).toBeInTheDocument();
  });

  it("renders an option section + milestone scenarios when an option exists", () => {
    const props = buildProps({
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "option",
          id: "opt1",
          symbol: "AAPL",
          optionType: "call",
          contracts: -1,
          strike: 200,
          expiration: "2026-06-19",
          entryDate: "2026-04-01",
          premium: 350,
        },
      ],
    });
    render(<PortfolioScreen {...props} />);
    const section = screen.getByRole("region", { name: /option positions/i });
    expect(section).toHaveTextContent(/Short 1 CALL/);
    expect(section).toHaveTextContent(/P&L scenarios at expiry/i);
  });

  it("renders a cash section when a cash position exists", () => {
    const props = buildProps({
      updatedAt: "2026-04-26T00:00:00Z",
      positions: [
        {
          kind: "cash",
          id: "cash1",
          symbol: "SPAXX",
          entryDate: "2026-01-01",
          amount: 10000,
          yieldPct: 4.85,
        },
      ],
    });
    render(<PortfolioScreen {...props} />);
    expect(screen.getByRole("region", { name: /cash positions/i })).toBeInTheDocument();
    expect(screen.getByText("SPAXX")).toBeInTheDocument();
  });
});
