import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FvTrendSample } from "@stockrank/core";
import { FvTrendSparkline } from "./FvTrendSparkline.js";

function sample(date: string, price: number, p25: number, med: number, p75: number): FvTrendSample {
  return { date, price, fvP25: p25, fvMedian: med, fvP75: p75 };
}

const SAMPLES: FvTrendSample[] = [
  sample("2024-06-30", 60, 55, 70, 85),
  sample("2024-09-30", 62, 58, 72, 88),
  sample("2024-12-31", 65, 60, 75, 92),
  sample("2025-03-31", 70, 62, 80, 100),
];

describe("<FvTrendSparkline />", () => {
  it("renders nothing when fewer than 2 usable samples", () => {
    const { container } = render(<FvTrendSparkline samples={[SAMPLES[0]!]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders Conservative as the default anchor", () => {
    render(<FvTrendSparkline samples={SAMPLES} />);
    expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Median" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Optimistic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("toggles the FV anchor when a button is clicked", async () => {
    const user = userEvent.setup();
    render(<FvTrendSparkline samples={SAMPLES} />);
    await user.click(screen.getByRole("button", { name: "Median" }));
    expect(screen.getByRole("button", { name: "Median" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "false");
    // Legend label updates with the active anchor.
    expect(screen.getByText(/FV Median/i)).toBeInTheDocument();
  });

  it("renders an SVG with a price-line and an fv-line", () => {
    const { container } = render(<FvTrendSparkline samples={SAMPLES} />);
    const svg = container.querySelector("svg.fv-sparkline__svg");
    expect(svg).not.toBeNull();
    expect(svg!.querySelector(".fv-sparkline__price-line")).not.toBeNull();
    expect(svg!.querySelector(".fv-sparkline__fv-line")).not.toBeNull();
  });

  it("includes a price legend item and an FV legend item", () => {
    render(<FvTrendSparkline samples={SAMPLES} />);
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText(/FV Conservative/i)).toBeInTheDocument();
  });

  it("respects initialAnchor when supplied", () => {
    render(<FvTrendSparkline samples={SAMPLES} initialAnchor="p75" />);
    expect(screen.getByRole("button", { name: "Optimistic" })).toHaveAttribute("aria-pressed", "true");
  });

  it("handles samples with null FV gracefully (renders price line only across nulls)", () => {
    const mixed: FvTrendSample[] = [
      { date: "2024-06-30", price: 60, fvP25: null, fvMedian: null, fvP75: null },
      { date: "2024-09-30", price: 62, fvP25: 58, fvMedian: 72, fvP75: 88 },
      { date: "2024-12-31", price: 65, fvP25: 60, fvMedian: 75, fvP75: 92 },
    ];
    const { container } = render(<FvTrendSparkline samples={mixed} />);
    const fvPath = container.querySelector(".fv-sparkline__fv-line");
    // Path starts with M (move) for the first non-null point; we don't
    // need to assert the exact d, just that the component didn't crash
    // and emitted some path data.
    expect(fvPath?.getAttribute("d")).toMatch(/^M/);
  });
});
