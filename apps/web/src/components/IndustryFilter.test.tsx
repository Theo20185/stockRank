import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndustryFilter } from "./IndustryFilter.js";

describe("<IndustryFilter />", () => {
  it("renders all industries plus an 'All industries' default option", () => {
    render(
      <IndustryFilter
        industries={["Pharmaceuticals", "Discount Stores"]}
        selected={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("option", { name: /all industries/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /pharmaceuticals/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /discount stores/i })).toBeInTheDocument();
  });

  it("calls onChange with the selected industry value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IndustryFilter
        industries={["Pharmaceuticals", "Discount Stores"]}
        selected={null}
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(/filter by industry/i),
      "Pharmaceuticals",
    );
    expect(onChange).toHaveBeenCalledWith("Pharmaceuticals");
  });

  it("calls onChange with null when 'All industries' is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <IndustryFilter
        industries={["Pharmaceuticals"]}
        selected="Pharmaceuticals"
        onChange={onChange}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(/filter by industry/i),
      "",
    );
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
