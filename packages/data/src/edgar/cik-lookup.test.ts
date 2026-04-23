import { describe, expect, it } from "vitest";
import { cikFor, formatCik } from "./cik-lookup.js";

describe("cik-lookup", () => {
  it("resolves AAPL to Apple's CIK", async () => {
    expect(await cikFor("AAPL")).toBe(320193);
  });

  it("resolves dot-notation share classes", async () => {
    // BRK.B is the canonical S&P 500 spelling; SEC ticker file uses BRK-B,
    // but we baked the dot form during lookup generation.
    expect(await cikFor("BRK.B")).toBeGreaterThan(0);
    expect(await cikFor("BF.B")).toBeGreaterThan(0);
  });

  it("returns null for an unknown ticker", async () => {
    expect(await cikFor("ZZZZZ")).toBeNull();
  });

  it("zero-pads CIK to 10 digits with the CIK prefix", () => {
    expect(formatCik(320193)).toBe("CIK0000320193");
    expect(formatCik(1)).toBe("CIK0000000001");
    expect(formatCik(1234567890)).toBe("CIK1234567890");
  });
});
