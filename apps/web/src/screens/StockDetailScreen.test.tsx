import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RankedRow } from "@stockrank/ranking";
import { StockDetailScreen } from "./StockDetailScreen.js";

// Stub global fetch so OptionsPanel's default loader doesn't blow up in
// jsdom — its rendered state isn't what this test cares about.
function stubFetch404() {
  return vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
}

const SAMPLE_ROW: RankedRow = {
  symbol: "DECK",
  name: "Deckers Outdoor Corp",
  sector: "Consumer Discretionary",
  industry: "Footwear",
  marketCap: 15_000_000_000,
  price: 107.81,
  composite: 60.4,
  industryRank: 1,
  universeRank: 6,
  pctOffYearHigh: 18.7,
  categoryScores: {
    valuation: 50, health: 60, quality: 70, shareholderReturn: 55, growth: 80,
  },
  factorDetails: [],
  missingFactors: [],
  fairValue: null,
  negativeEquity: false,
  optionsLiquid: true,
  annualDividend: 0,
  fvTrend: "insufficient_data",
};

describe("<StockDetailScreen />", () => {
  it("renders DrillDownPanel and OptionsPanel side-by-side when a row is supplied", () => {
    vi.stubGlobal("fetch", stubFetch404());
    render(<StockDetailScreen row={SAMPLE_ROW} symbol="DECK" onBack={() => {}} />);
    // Drill-down panel is an <aside> → "complementary" role
    expect(screen.getByRole("complementary", { name: /detail for DECK/i })).toBeInTheDocument();
    // Options panel is a <section> → "region" role
    expect(screen.getByRole("region", { name: /options for DECK/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the not-found message when no row exists for the symbol", () => {
    render(<StockDetailScreen row={null} symbol="ZZZZ" onBack={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /ZZZZ isn't in the current ranked snapshot/i,
    );
    expect(screen.queryByRole("region", { name: /options for/i })).toBeNull();
  });
});
