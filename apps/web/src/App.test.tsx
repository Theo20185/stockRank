import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";
import { makeTestSnapshot } from "./snapshot/test-snapshot.js";

beforeEach(() => {
  // Reset hash so each test starts on the results screen.
  window.location.hash = "";
});

describe("<App /> — results screen (default route)", () => {
  it("renders the StockRank heading and snapshot summary", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /stockrank/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-04-20/)).toBeInTheDocument();
  });

  it("renders the ranked table", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    expect(screen.getByRole("table", { name: /ranked stocks/i })).toBeInTheDocument();
  });

  it("renders both Composite and Turnaround tabs", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tabs = within(screen.getByRole("navigation", { name: /sections/i }));
    expect(tabs.getByRole("button", { name: /composite/i })).toBeInTheDocument();
    expect(tabs.getByRole("button", { name: /turnaround/i })).toBeInTheDocument();
  });

  it("shows filter chips for industry and weights", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const chips = screen.getByRole("group", { name: /active filters/i });
    expect(within(chips).getByText(/industry/i)).toBeInTheDocument();
    expect(within(chips).getByText(/weights/i)).toBeInTheDocument();
  });
});

describe("<App /> — navigation", () => {
  it("switches to the Turnaround screen when clicked", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tabs = within(screen.getByRole("navigation", { name: /sections/i }));
    await user.click(tabs.getByRole("button", { name: /turnaround/i }));
    expect(
      screen.getByRole("heading", { level: 1, name: /turnaround watchlist/i }),
    ).toBeInTheDocument();
  });

  it("opens the Filters screen when an Industry chip is tapped", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const chips = screen.getByRole("group", { name: /active filters/i });
    const industryChip = within(chips).getByText(/industry/i).closest("button");
    expect(industryChip).not.toBeNull();
    await user.click(industryChip!);
    expect(
      screen.getByRole("heading", { level: 1, name: /filters/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/filter by industry/i)).toBeInTheDocument();
  });

  it("Filters screen has the weight sliders for live tuning", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const chips = screen.getByRole("group", { name: /active filters/i });
    await user.click(within(chips).getByText(/weights/i).closest("button")!);
    expect(screen.getByLabelText(/valuation weight/i)).toBeInTheDocument();
  });

  it("opens the StockDetail screen when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tableRows = within(screen.getByRole("table")).getAllByRole("row");
    const firstDataRow = tableRows[1]!;
    await user.click(firstDataRow);
    // Stock detail screen now puts the symbol in the DrillDownPanel's
    // h2 (the AppHeader on this screen is bare back-button only).
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toMatch(/[A-Z0-9.-]+/);
  });

  it("returns to results when the back button on the Filters screen is clicked", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const chips = screen.getByRole("group", { name: /active filters/i });
    await user.click(within(chips).getByText(/industry/i).closest("button")!);
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("table", { name: /ranked stocks/i })).toBeInTheDocument();
  });
});
