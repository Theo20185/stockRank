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
  pctAboveYearLow: 24.3,
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

  it("renders both 52-week range markers (off-high and above-low)", () => {
    vi.stubGlobal("fetch", stubFetch404());
    render(<StockDetailScreen row={SAMPLE_ROW} symbol="DECK" onBack={() => {}} />);
    const aside = screen.getByRole("complementary", { name: /detail for DECK/i });
    expect(aside).toHaveTextContent(/18\.7%\s*off 52-week high/i);
    expect(aside).toHaveTextContent(/24\.3%\s*above 52-week low/i);
    vi.unstubAllGlobals();
  });

  it("renders 'limited-anchor estimate' caveat when fewer than 6 anchors fired", () => {
    vi.stubGlobal("fetch", stubFetch404());
    const limitedAnchorsRow: RankedRow = {
      ...SAMPLE_ROW,
      symbol: "TROW",
      name: "T. Rowe Price",
      industry: "Asset Management",
      fairValue: {
        peerSet: "cohort",
        peerCount: 9,
        anchors: {
          peerMedianPE: 180,
          peerMedianEVEBITDA: null, // not applicable
          peerMedianPFCF: null,
          ownHistoricalPE: 140,
          ownHistoricalEVEBITDA: null,
          ownHistoricalPFCF: null,
          normalizedPE: 170,
          normalizedEVEBITDA: null,
          normalizedPFCF: null,
        },
        range: { p25: 130, median: 154, p75: 175 },
        current: 99,
        upsideToP25Pct: 31,
        upsideToMedianPct: 55,
        confidence: "low",
        ttmTreatment: "ttm",
        ebitdaTreatment: "ttm",
        peerCohortDivergent: false,
      },
    };
    render(
      <StockDetailScreen row={limitedAnchorsRow} symbol="TROW" onBack={() => {}} />,
    );
    const aside = screen.getByRole("complementary", { name: /detail for TROW/i });
    expect(aside).toHaveTextContent(/limited-anchor estimate/i);
    expect(aside).toHaveTextContent(/3 of 9/i);
    vi.unstubAllGlobals();
  });

  it("does NOT render the limited-anchor caveat when 6+ anchors fired", () => {
    vi.stubGlobal("fetch", stubFetch404());
    const fullAnchorsRow: RankedRow = {
      ...SAMPLE_ROW,
      fairValue: {
        peerSet: "cohort",
        peerCount: 9,
        anchors: {
          peerMedianPE: 100, peerMedianEVEBITDA: 100, peerMedianPFCF: 100,
          ownHistoricalPE: 100, ownHistoricalEVEBITDA: 100, ownHistoricalPFCF: 100,
          normalizedPE: 100, normalizedEVEBITDA: 100, normalizedPFCF: 100,
        },
        range: { p25: 90, median: 100, p75: 110 },
        current: 80,
        upsideToP25Pct: 12.5,
        upsideToMedianPct: 25,
        confidence: "high",
        ttmTreatment: "ttm",
        ebitdaTreatment: "ttm",
        peerCohortDivergent: false,
      },
    };
    render(<StockDetailScreen row={fullAnchorsRow} symbol="DECK" onBack={() => {}} />);
    const aside = screen.getByRole("complementary", { name: /detail for DECK/i });
    expect(aside).not.toHaveTextContent(/limited-anchor estimate/i);
    vi.unstubAllGlobals();
  });

  it("shows the not-found message when no row exists for the symbol", () => {
    render(<StockDetailScreen row={null} symbol="ZZZZ" onBack={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /ZZZZ isn't in the current ranked snapshot/i,
    );
    expect(screen.queryByRole("region", { name: /options for/i })).toBeNull();
  });

  it("renders the bucket rationale callout when provided", () => {
    vi.stubGlobal("fetch", stubFetch404());
    const rationale = {
      bucket: "ranked" as const,
      primaryReason: "actionable-buy" as const,
      headline: "Buy candidate — trades 25.0% below the conservative fair value (p25).",
      strengths: ["Quality score 78/100", "Trades 25.0% below conservative fair value (p25)"],
      weaknesses: ["Growth score 28/100"],
    };
    render(
      <StockDetailScreen
        row={SAMPLE_ROW}
        symbol="DECK"
        onBack={() => {}}
        rationale={rationale}
      />,
    );
    const rationaleSection = screen.getByRole("region", { name: /why this bucket/i });
    expect(rationaleSection).toHaveTextContent(/Buy candidate/i);
    expect(rationaleSection).toHaveTextContent(/Quality score 78/);
    expect(rationaleSection).toHaveTextContent(/Growth score 28/);
    expect(rationaleSection).toHaveTextContent(/Candidate/);
    vi.unstubAllGlobals();
  });
});
