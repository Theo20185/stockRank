import type { Snapshot } from "@stockrank/core";

/**
 * Tiny snapshot fixture for component tests. Two industries × multiple
 * companies so cohort and percentile math have something real to chew on.
 */
export function makeTestSnapshot(): Snapshot {
  const company = (
    symbol: string,
    overrides: Partial<{
      industry: string;
      sector: string;
      price: number;
      yearHigh: number;
      marketCap: number;
      pe: number;
      ebitda: number;
      ebit: number;
      ni: number;
      eps: number;
      shares: number;
      debt: number;
      cash: number;
    }> = {},
  ) => ({
    symbol,
    name: `${symbol} Corp`,
    sector: overrides.sector ?? "Industrials",
    industry: overrides.industry ?? "Industrial Conglomerates",
    exchange: "NYSE",
    marketCap: overrides.marketCap ?? 50_000_000_000,
    currency: "USD",
    quoteCurrency: "USD",
    quote: {
      price: overrides.price ?? 100,
      yearHigh: overrides.yearHigh ?? 110,
      yearLow: 80,
      volume: 0,
      averageVolume: 1_000_000,
    },
    // ttm fields kept self-consistent with annual values so deriveTtm
    // returns the same numbers regardless of which derivation path
    // (peRatio / evToEbitda) it takes.
    ttm: (() => {
      const price = overrides.price ?? 100;
      const eps = overrides.eps ?? 8;
      const ebitda = overrides.ebitda ?? 12_000_000_000;
      const shares = 1_000_000_000;
      const marketCap = price * shares;
      const debt = 15_000_000_000;
      const cash = 5_000_000_000;
      const enterpriseValue = marketCap + debt - cash;
      return {
        peRatio: overrides.pe ?? (eps > 0 ? price / eps : 18),
        evToEbitda: enterpriseValue / ebitda,
        priceToFcf: 20,
        priceToBook: 3,
        dividendYield: 0.025,
        currentRatio: 1.25,
        netDebtToEbitda: 0.83,
        roic: 0.15,
        earningsYield: 0.055,
        fcfYield: 0.05,
        enterpriseValue,
        investedCapital: 45_000_000_000,
        forwardEps: 8,
      };
    })(),
    annual: Array.from({ length: 5 }, (_, i) => ({
      fiscalYear: String(2025 - i),
      periodEndDate: `${2025 - i}-12-31`,
      filingDate: null,
      reportedCurrency: "USD",
      // Historical close per year. Default = year-end price 18× the
      // year's EPS (a typical quality-stock multiple). Lets the
      // production engine's own-historical PE anchor compute a real
      // multiple instead of falling back to current ttm.peRatio.
      priceAtYearEnd: (overrides.eps ?? 8) * 18,
      income: {
        revenue: 100_000_000_000,
        grossProfit: 40_000_000_000,
        operatingIncome: 10_000_000_000,
        ebit: overrides.ebit ?? 10_000_000_000,
        ebitda: overrides.ebitda ?? 12_000_000_000,
        interestExpense: 500_000_000,
        netIncome: overrides.ni ?? 8_000_000_000,
        epsDiluted: overrides.eps ?? 8,
        sharesDiluted: overrides.shares ?? 1_000_000_000,
      },
      balance: {
        cash: overrides.cash ?? 5_000_000_000,
        totalCurrentAssets: 25_000_000_000,
        totalCurrentLiabilities: 20_000_000_000,
        totalDebt: overrides.debt ?? 15_000_000_000,
        totalEquity: 30_000_000_000,
      },
      cashFlow: {
        operatingCashFlow: 11_000_000_000,
        capex: -3_000_000_000,
        freeCashFlow: 8_000_000_000,
        dividendsPaid: 2_000_000_000,
        buybacks: 1_000_000_000,
      },
      ratios: { roic: 0.15, netDebtToEbitda: 0.83, currentRatio: 1.25 },
    })),
    pctOffYearHigh: ((overrides.yearHigh ?? 110) - (overrides.price ?? 100)) /
      (overrides.yearHigh ?? 110) *
      100,
  });

  // Vary price + EPS together so deriveTtm produces a mix of TTM PE
  // multiples (price/peRatio); peer-median anchor then has real
  // dispersion, and at least one symbol per industry lands in
  // Candidates (price below derived p25 of FV anchors).
  const industrials = Array.from({ length: 10 }, (_, i) =>
    company(`I${i.toString().padStart(2, "0")}`, {
      industry: "Industrial Conglomerates",
      sector: "Industrials",
      pe: 18 + i,
      price: 100 + i,
      eps: (100 + i) / (18 + i), // EPS implied by the PE override
      yearHigh: 130 + i,
    }),
  );
  // Pharma cohort: all-default PE 18 except P00 at PE 8 (clearly cheap
  // → lands in Candidates if below the p25 of the FV anchor range).
  const pharma = Array.from({ length: 10 }, (_, i) => {
    const pe = i === 0 ? 8 : 18;
    const price = i === 0 ? 50 : 100;
    return company(`P${i.toString().padStart(2, "0")}`, {
      industry: "Pharmaceuticals",
      sector: "Healthcare",
      pe,
      price,
      eps: price / pe,
    });
  });

  return {
    schemaVersion: 1,
    snapshotDate: "2026-04-20",
    generatedAt: "2026-04-20T13:00:00.000Z",
    source: "fmp-stable",
    universeName: "sp500",
    companies: [...industrials, ...pharma],
    errors: [],
  };
}
