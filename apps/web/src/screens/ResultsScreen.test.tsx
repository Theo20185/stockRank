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
  it("renders three sub-tabs labelled Candidates / Watch / Avoid with counts", () => {
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    expect(subtabs.getByRole("button", { name: /^Candidates \(\d+\)$/ })).toBeInTheDocument();
    expect(subtabs.getByRole("button", { name: /^Watch \(\d+\)$/ })).toBeInTheDocument();
    expect(subtabs.getByRole("button", { name: /^Avoid \(\d+\)$/ })).toBeInTheDocument();
    // Excluded was rolled into Avoid 2026-04-26.
    expect(subtabs.queryByRole("button", { name: /^Excluded/ })).toBeNull();
  });

  it("defaults the Candidates sub-tab to pressed", () => {
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    expect(subtabs.getByRole("button", { name: /^Candidates/ })).toHaveAttribute("aria-pressed", "true");
    expect(subtabs.getByRole("button", { name: /^Watch/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the visible bucket when a sub-tab is clicked", async () => {
    const user = userEvent.setup();
    render(<ResultsScreen {...buildProps()} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    await user.click(subtabs.getByRole("button", { name: /^Watch/ }));
    expect(subtabs.getByRole("button", { name: /^Watch/ })).toHaveAttribute("aria-pressed", "true");
    expect(subtabs.getByRole("button", { name: /^Candidates/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("bucket counts sum to total rows (eligible + ineligible)", () => {
    const props = buildProps();
    render(<ResultsScreen {...props} />);
    const subtabs = within(screen.getByRole("navigation", { name: /quality buckets/i }));
    const total = props.ranked.rows.length + props.ranked.ineligibleRows.length;
    const counts = ["Candidates", "Watch", "Avoid"].map((label) => {
      const btn = subtabs.getByRole("button", { name: new RegExp(`^${label} \\((\\d+)\\)$`) });
      const match = btn.textContent!.match(/\((\d+)\)/);
      return parseInt(match![1]!, 10);
    });
    expect(counts.reduce((s, n) => s + n, 0)).toBe(total);
  });
});
