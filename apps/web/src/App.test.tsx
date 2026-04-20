import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";
import { makeTestSnapshot } from "./snapshot/test-snapshot.js";

describe("<App />", () => {
  it("renders the StockRank heading and snapshot summary", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /stockrank/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2026-04-20/)).toBeInTheDocument();
  });

  it("renders the ranked table with at least one row from the test snapshot", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    expect(screen.getByRole("table", { name: /ranked stocks/i })).toBeInTheDocument();
  });

  it("renders both Composite and Turnaround tabs", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tabs = within(screen.getByRole("navigation", { name: /sections/i }));
    expect(tabs.getByRole("button", { name: /composite/i })).toBeInTheDocument();
    expect(tabs.getByRole("button", { name: /turnaround/i })).toBeInTheDocument();
  });

  it("switches to the Turnaround tab when clicked", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tabs = within(screen.getByRole("navigation", { name: /sections/i }));
    const turnaroundTab = tabs.getByRole("button", { name: /turnaround/i });
    await user.click(turnaroundTab);
    expect(turnaroundTab).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the weight sliders panel on the composite tab", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    expect(screen.getByRole("region", { name: /category weights/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/valuation weight/i)).toBeInTheDocument();
  });

  it("renders the industry filter on the composite tab", () => {
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const filter = screen.getByLabelText(/filter by industry/i);
    expect(filter).toBeInTheDocument();
    // industries from the test snapshot should be in the option list
    const options = within(filter).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Industrial Conglomerates");
    expect(options).toContain("Pharmaceuticals");
  });

  it("filters the table when an industry is selected", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const filter = screen.getByLabelText(/filter by industry/i);
    await user.selectOptions(filter, "Pharmaceuticals");

    const tableRows = within(screen.getByRole("table")).getAllByRole("row");
    // first row is the header
    const dataRows = tableRows.slice(1);
    for (const row of dataRows) {
      expect(within(row).queryByText("Pharmaceuticals")).not.toBeNull();
    }
  });

  it("opens the drill-down when a row is clicked", async () => {
    const user = userEvent.setup();
    render(<App initialSnapshot={makeTestSnapshot()} />);
    const tableRows = within(screen.getByRole("table")).getAllByRole("row");
    const firstDataRow = tableRows[1]!;
    await user.click(firstDataRow);
    // The drill-down aside changes its aria-label from "Stock detail" to
    // "Detail for {symbol}" — assert the latter exists.
    expect(
      screen.getByRole("complementary", { name: /detail for /i }),
    ).toBeInTheDocument();
  });
});
