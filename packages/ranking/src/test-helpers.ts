import type {
  AnnualPeriod,
  CompanySnapshot,
  TtmMetrics,
} from "@stockrank/core";

export function makePeriod(overrides: Partial<AnnualPeriod> = {}): AnnualPeriod {
  return {
    fiscalYear: "2025",
    periodEndDate: "2025-12-31",
    filingDate: "2026-01-31",
    reportedCurrency: "USD",
    income: {
      revenue: 100_000_000_000,
      grossProfit: 40_000_000_000,
      operatingIncome: 10_000_000_000,
      ebit: 10_000_000_000,
      ebitda: 12_000_000_000,
      interestExpense: 500_000_000,
      netIncome: 8_000_000_000,
      epsDiluted: 8,
      sharesDiluted: 1_000_000_000,
    },
    balance: {
      cash: 5_000_000_000,
      totalCurrentAssets: 25_000_000_000,
      totalCurrentLiabilities: 20_000_000_000,
      totalDebt: 15_000_000_000,
      totalEquity: 30_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 11_000_000_000,
      capex: -3_000_000_000,
      freeCashFlow: 8_000_000_000,
      dividendsPaid: 2_000_000_000,
      buybacks: 1_000_000_000,
    },
    ratios: {
      roic: 0.15,
      netDebtToEbitda: 0.83,
      currentRatio: 1.25,
    },
    ...overrides,
  };
}

export function makeTtm(overrides: Partial<TtmMetrics> = {}): TtmMetrics {
  return {
    peRatio: 18,
    evToEbitda: 12,
    priceToFcf: 20,
    priceToBook: 3,
    dividendYield: 0.025,
    currentRatio: 1.25,
    netDebtToEbitda: 0.83,
    roic: 0.15,
    earningsYield: 0.055,
    fcfYield: 0.05,
    enterpriseValue: 50_000_000_000,
    investedCapital: 45_000_000_000,
    forwardEps: 8,
    ...overrides,
  };
}

export function makeCompany(
  overrides: Partial<CompanySnapshot> & { symbol: string },
): CompanySnapshot {
  return {
    symbol: overrides.symbol,
    name: overrides.name ?? `${overrides.symbol} Corp`,
    sector: overrides.sector ?? "Industrials",
    industry: overrides.industry ?? "Industrial Conglomerates",
    exchange: overrides.exchange ?? "NYSE",
    marketCap: overrides.marketCap ?? 50_000_000_000,
    currency: overrides.currency ?? "USD",
    quoteCurrency: overrides.quoteCurrency ?? "USD",
    quote: overrides.quote ?? {
      price: 100,
      yearHigh: 110,
      yearLow: 80,
      volume: 0,
      averageVolume: 1_000_000,
    },
    ttm: overrides.ttm ?? makeTtm(),
    annual:
      overrides.annual ??
      Array.from({ length: 5 }, (_, i) =>
        makePeriod({ fiscalYear: String(2025 - i) }),
      ),
    pctOffYearHigh: overrides.pctOffYearHigh ?? 9.09,
  };
}
