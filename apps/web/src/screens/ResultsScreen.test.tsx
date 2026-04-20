import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rank, fairValueFor } from "@stockrank/ranking";
import { ResultsScreen } from "./ResultsScreen.js";
import { makeTestSnapshot } from "../snapshot/test-snapshot.js";

function buildProps() {
  const snapshot = makeTestSnapshot();
  const ranked = rank({
    companies: snapshot.companies,
    snapshotDate: snapshot.snapshotDate,
  });
  for (const row of ranked.rows) {
    const company = snapshot.companies.find((c) => c.symbol === row.symbol);
    if (company) row.fairValue = fairValueFor(company, snapshot.companies);
  }
  return {
    snapshot,
    ranked,
    industry: null,
    weights: { valuation: 0.25, health: 0.15, quality: 0.25, shareholderReturn: 0.15, growth: 0.20 },
    tab: "composite" as const,
    onSelectTab: vi.fn(),
    onSelectStock: vi.fn(),
    onEditFilters: vi.fn(),
  };
}

describe("<ResultsScreen /> — quality bucket sub-tabs", () => {
  it("renders three sub-tabs labelled Ranked / Watch / Excluded with counts", () => {
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    expect(subtabs.getByRole("button", { name: /^Ranked \(\d+\)$/ })).toBeInTheDocument();
    expect(subtabs.getByRole("button", { name: /^Watch \(\d+\)$/ })).toBeInTheDocument();
    expect(subtabs.getByRole("button", { name: /^Excluded \(\d+\)$/ })).toBeInTheDocument();
  });

  it("defaults the Ranked sub-tab to pressed", () => {
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    expect(subtabs.getByRole("button", { name: /^Ranked/ })).toHaveAttribute("aria-pressed", "true");
    expect(subtabs.getByRole("button", { name: /^Watch/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the visible bucket when a sub-tab is clicked", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    await user.click(subtabs.getByRole("button", { name: /^Watch/ }));
    expect(subtabs.getByRole("button", { name: /^Watch/ })).toHaveAttribute("aria-pressed", "true");
    expect(subtabs.getByRole("button", { name: /^Ranked/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows an empty-state message when the active bucket has no rows", async () => {
    const user = userEvent.setup();
    const props = buildProps();
    render(<ResultsScreen {...props} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    // Excluded should be empty for the test fixture (all rows have complete data)
    const excludedBtn = subtabs.getByRole("button", { name: /^Excluded \(0\)/ });
    await user.click(excludedBtn);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/missing two or more/i);
  });

  it("bucket counts sum to total visible rows", () => {
    const props = buildProps();
    render(<ResultsScreen {...props} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    const total = props.ranked.rows.length;
    const counts = ["Ranked", "Watch", "Excluded"].map((label) => {
      const btn = subtabs.getByRole("button", { name: new RegExp(`^${label} \\((\\d+)\\)$`) });
      const match = btn.textContent!.match(/\((\d+)\)/);
      return parseInt(match![1]!, 10);
    });
    expect(counts.reduce((s, n) => s + n, 0)).toBe(total);
  });
});
