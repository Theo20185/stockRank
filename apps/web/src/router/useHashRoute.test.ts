import { describe, it, expect } from "vitest";
import { parseRoute } from "./useHashRoute.js";

describe("parseRoute", () => {
  it("returns results for empty, /, or /results", () => {
    expect(parseRoute("")).toEqual({ name: "results" });
    expect(parseRoute("/")).toEqual({ name: "results" });
    expect(parseRoute("/results")).toEqual({ name: "results" });
    expect(parseRoute("#/")).toEqual({ name: "results" });
    expect(parseRoute("#/results")).toEqual({ name: "results" });
  });

  it("returns portfolio for /portfolio", () => {
    expect(parseRoute("/portfolio")).toEqual({ name: "portfolio" });
    expect(parseRoute("#/portfolio")).toEqual({ name: "portfolio" });
  });

  it("/turnaround (removed) falls back to results", () => {
    // Turnaround section removed 2026-04-26. Hash routed to /turnaround
    // (e.g. an old bookmark) lands on the home results screen.
    expect(parseRoute("/turnaround")).toEqual({ name: "results" });
  });

  it("returns filters for /filters", () => {
    expect(parseRoute("/filters")).toEqual({ name: "filters" });
  });

  it("returns stock with the parsed symbol for /stock/:symbol", () => {
    expect(parseRoute("/stock/INTC")).toEqual({ name: "stock", symbol: "INTC" });
    expect(parseRoute("#/stock/BRK.B")).toEqual({ name: "stock", symbol: "BRK.B" });
  });

  it("decodes URL-encoded symbols", () => {
    expect(parseRoute("/stock/BRK%2EB")).toEqual({ name: "stock", symbol: "BRK.B" });
  });

  it("falls back to results for unknown paths", () => {
    expect(parseRoute("/nope")).toEqual({ name: "results" });
    expect(parseRoute("/x/y/z")).toEqual({ name: "results" });
  });
});
