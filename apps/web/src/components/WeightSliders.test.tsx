import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeightSliders } from "./WeightSliders.js";
import { DEFAULT_WEIGHTS } from "@stockrank/ranking";

describe("<WeightSliders />", () => {
  it("renders one slider per category", () => {
    render(
      <WeightSliders
        weights={DEFAULT_WEIGHTS}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByLabelText(/valuation weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/health weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quality weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/shareholder return weight/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/growth weight/i)).toBeInTheDocument();
  });

  it("displays each category's current weight as a percentage", () => {
    render(
      <WeightSliders
        weights={DEFAULT_WEIGHTS}
        onChange={() => {}}
        onReset={() => {}}
      />,
    );
    // Default = value-deep per ranking.md §8.1 (updated 2026-04-25)
    expect(screen.getByText("50%")).toBeInTheDocument(); // valuation
    expect(screen.getByText("20%")).toBeInTheDocument(); // health
    // quality, shareholderReturn, growth all = 10% — three matches
    expect(screen.getAllByText("10%").length).toBe(3);
  });

  it("calls onChange with the new weights when a slider is adjusted", () => {
    const onChange = vi.fn();
    render(
      <WeightSliders
        weights={DEFAULT_WEIGHTS}
        onChange={onChange}
        onReset={() => {}}
      />,
    );
    const slider = screen.getByLabelText(/growth weight/i);
    fireEvent.change(slider, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls.at(-1)![0];
    expect(lastCall.growth).toBe(0.5);
  });

  it("calls onReset when the reset button is clicked", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <WeightSliders
        weights={DEFAULT_WEIGHTS}
        onChange={() => {}}
        onReset={onReset}
      />,
    );
    await user.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(onReset).toHaveBeenCalled();
  });
});
