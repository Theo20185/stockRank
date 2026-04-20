import { describe, it, expect } from "vitest";
import { inferReportingCurrency } from "./currency.js";

describe("inferReportingCurrency", () => {
  it("returns USD for United States", () => {
    expect(inferReportingCurrency("United States")).toBe("USD");
  });

  it("returns DKK for Denmark (Novo Nordisk)", () => {
    expect(inferReportingCurrency("Denmark")).toBe("DKK");
  });

  it("returns JPY for Japan (Toyota)", () => {
    expect(inferReportingCurrency("Japan")).toBe("JPY");
  });

  it("returns GBP for the United Kingdom (Shell)", () => {
    expect(inferReportingCurrency("United Kingdom")).toBe("GBP");
  });

  it("returns EUR for Eurozone countries", () => {
    expect(inferReportingCurrency("Germany")).toBe("EUR");
    expect(inferReportingCurrency("France")).toBe("EUR");
    expect(inferReportingCurrency("Netherlands")).toBe("EUR");
    expect(inferReportingCurrency("Ireland")).toBe("EUR");
  });

  it("treats Bermuda/Cayman as USD (typical for offshore-incorporated US listings)", () => {
    expect(inferReportingCurrency("Bermuda")).toBe("USD");
    expect(inferReportingCurrency("Cayman Islands")).toBe("USD");
  });

  it("defaults to USD for unknown countries", () => {
    expect(inferReportingCurrency("Atlantis")).toBe("USD");
    expect(inferReportingCurrency(undefined)).toBe("USD");
  });
});
