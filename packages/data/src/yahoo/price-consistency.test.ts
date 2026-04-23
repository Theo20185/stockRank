import { describe, expect, it } from "vitest";
import { checkPriceConsistency } from "./price-consistency.js";

describe("checkPriceConsistency", () => {
  it("passes when both implied prices match quote within tolerance (normal case)", () => {
    // AAPL-shape: 15B shares, $3T marketCap, price $200
    const r = checkPriceConsistency({
      marketCap: 3_000_000_000_000,
      yahooShares: 15_000_000_000,
      edgarShares: 15_004_000_000,
      quotePrice: 200,
    });
    expect(r.ok).toBe(true);
  });

  it("excludes when BOTH sources disagree materially (BKNG phantom-split case)", () => {
    // BKNG: marketCap $152B, both sources agree shares ≈ 32.6M,
    // but price corruption shows $192 (implied $4664).
    const r = checkPriceConsistency({
      marketCap: 152_000_000_000,
      yahooShares: 32_600_000,
      edgarShares: 32_600_000,
      quotePrice: 192,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/disagrees with both/);
  });

  it("lets a dual-class ticker through when only Yahoo-shares implied is off (GOOGL)", () => {
    // GOOGL: Yahoo's sharesOutstanding = 5.8B (per-class Class A),
    // but marketCap = $4.1T (company-wide). Yahoo-implied $707;
    // EDGAR shares = 12.2B (total) → EDGAR-implied $336, matches price.
    const r = checkPriceConsistency({
      marketCap: 4_111_000_000_000,
      yahooShares: 5_820_000_000,
      edgarShares: 12_230_000_000,
      quotePrice: 339.83,
    });
    expect(r.ok).toBe(true);
  });

  it("lets a post-merger ticker through when only EDGAR-shares is off (AMCR-style)", () => {
    // AMCR: Yahoo (post-Berry-merger) shares = 4.95B, marketCap = $58B,
    // price $11.72 → Yahoo-implied matches. EDGAR's stale pre-merger
    // shares = 1.45B → EDGAR-implied $40 (~3× off).
    const r = checkPriceConsistency({
      marketCap: 58_000_000_000,
      yahooShares: 4_950_000_000,
      edgarShares: 1_450_000_000,
      quotePrice: 11.72,
    });
    expect(r.ok).toBe(true);
  });

  it("uses Yahoo alone when EDGAR shares unavailable (BRK.B has no us-gaap concept)", () => {
    const r = checkPriceConsistency({
      marketCap: 1_012_000_000_000,
      yahooShares: 2_260_000_000,
      edgarShares: null,
      quotePrice: 469.33,
    });
    // Yahoo-implied $448 matches price within 5% → ok
    expect(r.ok).toBe(true);
  });

  it("uses EDGAR alone when Yahoo shares unavailable", () => {
    const r = checkPriceConsistency({
      marketCap: 3_000_000_000_000,
      yahooShares: 0,
      edgarShares: 15_000_000_000,
      quotePrice: 200,
    });
    expect(r.ok).toBe(true);
  });

  it("returns ok=true when quote or marketCap is zero", () => {
    expect(checkPriceConsistency({
      marketCap: 0,
      yahooShares: 1e9,
      edgarShares: 1e9,
      quotePrice: 100,
    }).ok).toBe(true);
    expect(checkPriceConsistency({
      marketCap: 1e9,
      yahooShares: 1e9,
      edgarShares: 1e9,
      quotePrice: 0,
    }).ok).toBe(true);
  });

  it("returns ok=true when no shares source is available", () => {
    expect(checkPriceConsistency({
      marketCap: 1e9,
      yahooShares: 0,
      edgarShares: null,
      quotePrice: 100,
    }).ok).toBe(true);
  });

  it("catches single-source failure when the other source is missing (safety net)", () => {
    // If only EDGAR is available and it's way off, still exclude.
    const r = checkPriceConsistency({
      marketCap: 1_000_000_000,
      yahooShares: 0,
      edgarShares: 10_000, // 10K shares → implied $100K/share
      quotePrice: 100,
    });
    expect(r.ok).toBe(false);
  });
});
