import { describe, it, expect } from "vitest";
import {
  accrualsFromAnnual,
  netIssuanceFromAnnual,
  momentum12_1,
  FACTORS,
} from "./factors.js";
import { makeCompany, makePeriod } from "./test-helpers.js";
import type { MonthlyClose } from "@stockrank/core";

function makeMonthlyCloses(values: number[]): MonthlyClose[] {
  // Generate ISO dates oldest → newest, anchored arbitrarily. Only the
  // ordering matters for the factor — actual dates aren't used.
  return values.map((close, i) => {
    const month = (i % 12) + 1;
    const year = 2024 + Math.floor(i / 12);
    return {
      date: `${year}-${String(month).padStart(2, "0")}-01`,
      close,
    };
  });
}

describe("accrualsFromAnnual()", () => {
  it("returns positive accruals when net income exceeds operating cash flow", () => {
    // NI=8B, CFO=5B, Rev=100B → (8-5)/100 = 0.03
    const c = makeCompany({
      symbol: "POS",
      annual: [
        makePeriod({
          income: { ...makePeriod().income, netIncome: 8_000_000_000 },
          cashFlow: { ...makePeriod().cashFlow, operatingCashFlow: 5_000_000_000 },
        }),
      ],
    });
    expect(accrualsFromAnnual(c)).toBeCloseTo(0.03, 5);
  });

  it("returns negative accruals when CFO exceeds NI (conservative accounting)", () => {
    // NI=5B, CFO=11B, Rev=100B → (5-11)/100 = -0.06
    // This is the GOOD case — direction "lower" rewards it.
    const c = makeCompany({
      symbol: "CONS",
      annual: [
        makePeriod({
          income: { ...makePeriod().income, netIncome: 5_000_000_000 },
          cashFlow: { ...makePeriod().cashFlow, operatingCashFlow: 11_000_000_000 },
        }),
      ],
    });
    expect(accrualsFromAnnual(c)).toBeCloseTo(-0.06, 5);
  });

  it("returns null when revenue is missing or zero", () => {
    const c = makeCompany({
      symbol: "NOREV",
      annual: [
        makePeriod({
          income: { ...makePeriod().income, revenue: 0 },
        }),
      ],
    });
    expect(accrualsFromAnnual(c)).toBeNull();
  });

  it("returns null when net income or operating cash flow is missing", () => {
    const c1 = makeCompany({
      symbol: "NONI",
      annual: [
        makePeriod({
          income: { ...makePeriod().income, netIncome: null },
        }),
      ],
    });
    const c2 = makeCompany({
      symbol: "NOCFO",
      annual: [
        makePeriod({
          cashFlow: { ...makePeriod().cashFlow, operatingCashFlow: null },
        }),
      ],
    });
    expect(accrualsFromAnnual(c1)).toBeNull();
    expect(accrualsFromAnnual(c2)).toBeNull();
  });

  it("returns null when there are no annual periods", () => {
    const c = makeCompany({ symbol: "EMPTY", annual: [] });
    expect(accrualsFromAnnual(c)).toBeNull();
  });

  it("uses only the most recent annual period (not an average)", () => {
    const c = makeCompany({
      symbol: "RECENT",
      annual: [
        // Recent period: NI=8B, CFO=5B, Rev=100B → +0.03 accruals
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, netIncome: 8_000_000_000 },
          cashFlow: { ...makePeriod().cashFlow, operatingCashFlow: 5_000_000_000 },
        }),
        // Prior period: NI=5B, CFO=20B → would be -0.15. Should NOT
        // bleed into the result.
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, netIncome: 5_000_000_000 },
          cashFlow: { ...makePeriod().cashFlow, operatingCashFlow: 20_000_000_000 },
        }),
      ],
    });
    expect(accrualsFromAnnual(c)).toBeCloseTo(0.03, 5);
  });
});

describe("netIssuanceFromAnnual()", () => {
  it("returns positive when shares grew (dilution)", () => {
    // 1.05B shares this year vs 1.00B prior → +5% issuance
    const c = makeCompany({
      symbol: "DIL",
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, sharesDiluted: 1_050_000_000 },
        }),
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, sharesDiluted: 1_000_000_000 },
        }),
      ],
    });
    expect(netIssuanceFromAnnual(c)).toBeCloseTo(0.05, 5);
  });

  it("returns negative when shares shrank (net buybacks)", () => {
    // 0.95B vs 1.00B → -5%
    const c = makeCompany({
      symbol: "BB",
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, sharesDiluted: 950_000_000 },
        }),
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, sharesDiluted: 1_000_000_000 },
        }),
      ],
    });
    expect(netIssuanceFromAnnual(c)).toBeCloseTo(-0.05, 5);
  });

  it("returns 0 when shares are unchanged", () => {
    const c = makeCompany({
      symbol: "FLAT",
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, sharesDiluted: 1_000_000_000 },
        }),
        makePeriod({
          fiscalYear: "2024",
          income: { ...makePeriod().income, sharesDiluted: 1_000_000_000 },
        }),
      ],
    });
    expect(netIssuanceFromAnnual(c)).toBe(0);
  });

  it("returns null when only one annual period exists", () => {
    const c = makeCompany({
      symbol: "SINGLE",
      annual: [makePeriod({ fiscalYear: "2025" })],
    });
    expect(netIssuanceFromAnnual(c)).toBeNull();
  });

  it("returns null when share count is missing on either period", () => {
    const c = makeCompany({
      symbol: "MISS",
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, sharesDiluted: null },
        }),
        makePeriod({
          fiscalYear: "2024",
        }),
      ],
    });
    expect(netIssuanceFromAnnual(c)).toBeNull();
  });
});

describe("momentum12_1()", () => {
  it("computes 12-1 return skipping the most recent month", () => {
    // 14 closes: oldest (T-13m) = 100, ..., 1-month-ago (T-1m) = 130,
    //   most-recent = 200 (should be SKIPPED).
    // Expected: 130/100 - 1 = 0.30
    const closes = makeMonthlyCloses([
      100, 102, 105, 108, 110, 115, 118, 120, 122, 125, 128, 130,
      // wait, need 14 values
      130, 200,
    ]);
    // The above slice has 14 values but the wrong T-1m value. Let me
    // build it explicitly: index 12 (zero-indexed) is T-1m, 13 is T-0.
    //   closes[0] = T-13m = 100   (denominator)
    //   closes[12] = T-1m = 130   (numerator)
    //   closes[13] = T-0 = 200    (skipped)
    const c = makeCompany({
      symbol: "MOM",
      monthlyCloses: closes,
    });
    expect(momentum12_1(c)).toBeCloseTo(0.30, 5);
  });

  it("returns null when monthlyCloses is missing (older snapshot)", () => {
    const c = makeCompany({ symbol: "OLD" });
    // makeCompany doesn't set monthlyCloses → undefined
    expect(momentum12_1(c)).toBeNull();
  });

  it("returns null when fewer than 14 monthly closes are present", () => {
    const c = makeCompany({
      symbol: "SHORT",
      monthlyCloses: makeMonthlyCloses([100, 110, 120, 130, 140]),
    });
    expect(momentum12_1(c)).toBeNull();
  });

  it("returns null when the denominator close is non-positive", () => {
    // Build 14 closes where index 0 (T-13m) is 0
    const closes = makeMonthlyCloses(
      Array.from({ length: 14 }, (_, i) => (i === 0 ? 0 : 100 + i)),
    );
    const c = makeCompany({ symbol: "ZERO", monthlyCloses: closes });
    expect(momentum12_1(c)).toBeNull();
  });

  it("ignores months 13+ if more than 14 closes are present", () => {
    // 20 closes — only the trailing 14 should be used. Build so that
    // the trailing 14 give a known answer, and earlier closes are
    // wildly different to prove they don't influence.
    const earlyJunk = [1, 2, 3, 4, 5, 6];
    const trailing14 = [
      100, 102, 105, 108, 110, 115, 118, 120, 122, 125, 128, 130, 130, 200,
    ];
    const c = makeCompany({
      symbol: "LONG",
      monthlyCloses: makeMonthlyCloses([...earlyJunk, ...trailing14]),
    });
    expect(momentum12_1(c)).toBeCloseTo(0.30, 5);
  });
});

describe("FACTORS array — registration of new factors", () => {
  it("includes accruals in the Quality category with direction 'lower'", () => {
    const f = FACTORS.find((x) => x.key === "accruals");
    expect(f).toBeDefined();
    expect(f?.category).toBe("quality");
    expect(f?.direction).toBe("lower");
  });

  it("includes netIssuance in Shareholder Return with direction 'lower'", () => {
    const f = FACTORS.find((x) => x.key === "netIssuance");
    expect(f).toBeDefined();
    expect(f?.category).toBe("shareholderReturn");
    expect(f?.direction).toBe("lower");
  });

  it("includes momentum12_1 in the new momentum category with direction 'higher'", () => {
    const f = FACTORS.find((x) => x.key === "momentum12_1");
    expect(f).toBeDefined();
    expect(f?.category).toBe("momentum");
    expect(f?.direction).toBe("higher");
  });
});
