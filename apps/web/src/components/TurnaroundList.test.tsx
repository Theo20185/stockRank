import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TurnaroundList } from "./TurnaroundList.js";
import type { TurnaroundRow } from "@stockrank/ranking";

const SAMPLE_ROW: TurnaroundRow = {
  symbol: "INTC",
  name: "Intel Corporation",
  industry: "Semiconductors",
  marketCap: 90_000_000_000,
  price: 21,
  pctOffYearHigh: 58,
  reasons: ["longTermQuality", "ttmTrough", "deepDrawdown"],
  longTermAvgRoic: 0.13,
  ttmEpsRelativeTo5YAvg: -1.5,
  fairValue: null,
};

describe("<TurnaroundList />", () => {
  it("shows a friendly empty state when no names qualify", () => {
    render(<TurnaroundList rows={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no names currently meet/i);
  });

  it("renders a row per turnaround candidate with symbol and human-readable reasons", () => {
    render(<TurnaroundList rows={[SAMPLE_ROW]} />);
    expect(screen.getByText("INTC")).toBeInTheDocument();
    const reasonsCell = screen.getByText(/long-term quality/i);
    expect(reasonsCell).toBeInTheDocument();
    expect(reasonsCell.textContent).toMatch(/TTM trough/i);
    expect(reasonsCell.textContent).toMatch(/Deep drawdown/i);
  });
});
