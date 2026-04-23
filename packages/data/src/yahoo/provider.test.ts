import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnnualPeriod } from "@stockrank/core";

const quoteSummaryMock = vi.fn();
const chartMock = vi.fn();
const fundamentalsTimeSeriesMock = vi.fn();

vi.mock("yahoo-finance2", () => {
  const FakeYahoo = function () {
    return {
      quoteSummary: (...args: unknown[]) => quoteSummaryMock(...args),
      chart: (...args: unknown[]) => chartMock(...args),
      fundamentalsTimeSeries: (...args: unknown[]) =>
        fundamentalsTimeSeriesMock(...args),
    };
  };
  return { default: FakeYahoo };
});

const getEdgarFundamentalsMock = vi.fn();

vi.mock("../edgar/index.js", async () => {
  // Bring along the real classes / helpers we re-export through this
  // module so the provider's `instanceof EdgarNotFoundError` check
  // still works.
  const real = await vi.importActual<typeof import("../edgar/index.js")>(
    "../edgar/index.js",
  );
  return {
    ...real,
    getEdgarFundamentals: (...args: unknown[]) =>
      getEdgarFundamentalsMock(...args),
  };
});

// eslint-disable-next-line import/first
import { YahooProvider } from "./provider.js";

function stubSummary(): unknown {
  return {
    price: {
      longName: "Intel Corporation",
      exchangeName: "NMS",
      regularMarketPrice: 65.5,
    },
    assetProfile: {
      sector: "Technology",
      industry: "Semiconductors",
    },
    summaryDetail: {
      marketCap: 320_000_000_000,
      fiftyTwoWeekHigh: 70,
      fiftyTwoWeekLow: 18,
      averageVolume: 100_000_000,
      trailingPE: 30,
      dividendYield: 0.01,
    },
    defaultKeyStatistics: {
      enterpriseValue: 360_000_000_000,
      enterpriseToEbitda: 25,
      priceToBook: 2.8,
      sharesOutstanding: 4_500_000_000,
      trailingEps: 2.18,
    },
    financialData: {
      ebitda: 14_000_000_000,
      totalCash: 22_000_000_000,
      totalDebt: 50_000_000_000,
      currentRatio: 1.3,
      freeCashflow: 2_000_000_000,
    },
  };
}

/** Minimal AnnualPeriod fixture in the EDGAR-output shape. The EDGAR
 * mapper itself owns concept extraction + EBITDA reconstruction +
 * sign-normalization tests; here we stub the post-mapper output. */
function annualPeriod(overrides: Partial<AnnualPeriod> & {
  fiscalYear: string;
  periodEndDate: string;
}): AnnualPeriod {
  return {
    fiscalYear: overrides.fiscalYear,
    periodEndDate: overrides.periodEndDate,
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: null,
      grossProfit: null,
      operatingIncome: null,
      ebit: null,
      ebitda: null,
      interestExpense: null,
      netIncome: null,
      epsDiluted: null,
      sharesDiluted: null,
      ...overrides.income,
    },
    balance: {
      cash: null,
      totalCurrentAssets: null,
      totalCurrentLiabilities: null,
      totalDebt: null,
      totalEquity: null,
      ...overrides.balance,
    },
    cashFlow: {
      operatingCashFlow: null,
      capex: null,
      freeCashFlow: null,
      dividendsPaid: null,
      buybacks: null,
      ...overrides.cashFlow,
    },
    ratios: {
      roic: null,
      netDebtToEbitda: null,
      currentRatio: null,
      ...overrides.ratios,
    },
  };
}

/** Two-year INTC-shaped EDGAR fundamentals fixture in the
 * provider-consumed shape (newest-first per the EDGAR mapper). */
function stubEdgarPeriods(): { annual: AnnualPeriod[]; quarterly: never[] } {
  return {
    annual: [
      annualPeriod({
        fiscalYear: "2024",
        periodEndDate: "2024-12-28",
        income: {
          revenue: 53_101_000_000,
          netIncome: -18_756_000_000,
          epsDiluted: -4.38,
          sharesDiluted: 4_280_000_000,
        },
        balance: { totalDebt: 50_011_000_000, cash: 22_062_000_000 },
        cashFlow: { dividendsPaid: 1_599_000_000, buybacks: 0 },
      }),
      annualPeriod({
        fiscalYear: "2023",
        periodEndDate: "2023-12-30",
        income: {
          revenue: 54_228_000_000,
          netIncome: 1_689_000_000,
          epsDiluted: 0.4,
          sharesDiluted: 4_212_000_000,
          ebitda: 11_242_000_000,
        },
        balance: { totalDebt: 49_000_000_000, cash: 25_000_000_000 },
        cashFlow: { dividendsPaid: 3_087_000_000, buybacks: 0 },
      }),
    ],
    quarterly: [],
  };
}

beforeEach(() => {
  quoteSummaryMock.mockReset();
  chartMock.mockReset();
  fundamentalsTimeSeriesMock.mockReset();
  getEdgarFundamentalsMock.mockReset();
});

describe("YahooProvider", () => {
  it("maps quoteSummary + EDGAR + chart into a CompanySnapshot", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    getEdgarFundamentalsMock.mockResolvedValue(stubEdgarPeriods());
    chartMock.mockResolvedValue({
      quotes: [
        { close: 20, volume: 100_000_000 },
        { close: 25, volume: 150_000_000 },
        { close: 30, volume: 120_000_000 },
      ],
    });

    const provider = new YahooProvider();
    const errors: unknown[] = [];
    const snap = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-08-22", priceTo: "2025-08-22" },
      (e) => errors.push(e),
    );

    expect(snap).not.toBeNull();
    expect(snap!.symbol).toBe("INTC");
    expect(snap!.name).toBe("Intel Corporation");
    expect(snap!.industry).toBe("Semiconductors");
    expect(snap!.marketCap).toBe(320_000_000_000);
    expect(snap!.quote.price).toBe(65.5);
    expect(snap!.ttm.evToEbitda).toBe(25);
    expect(snap!.pctOffYearHigh).toBeCloseTo(6.43, 1);
    expect(errors).toHaveLength(0);
  });

  it("preserves EDGAR's newest-first annual ordering", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    getEdgarFundamentalsMock.mockResolvedValue(stubEdgarPeriods());
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const snap = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-08-22", priceTo: "2025-08-22" },
      () => {},
    );

    expect(snap!.annual[0]!.fiscalYear).toBe("2024");
    expect(snap!.annual[1]!.fiscalYear).toBe("2023");
  });

  it("returns null and reports an error when quoteSummary fails entirely", async () => {
    quoteSummaryMock.mockRejectedValue(new Error("Not Found"));

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "ZZZZ",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(result).toBeNull();
    expect(errors).toEqual([
      expect.objectContaining({ symbol: "ZZZZ", endpoint: "quoteSummary" }),
    ]);
  });

  it("reports EDGAR failure as a non-fatal error and returns the company", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    getEdgarFundamentalsMock.mockRejectedValue(new Error("EDGAR down"));
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(result).not.toBeNull();
    expect(result!.annual).toEqual([]);
    expect(errors.some((e) => e.endpoint === "edgar")).toBe(true);
  });

  it("flags edgar-not-found separately when the symbol has no CIK", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    const { EdgarNotFoundError } = await import("../edgar/index.js");
    getEdgarFundamentalsMock.mockRejectedValue(new EdgarNotFoundError("INTC", -1));
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(errors.some((e) => e.endpoint === "edgar-not-found")).toBe(true);
  });

  it("excludes a symbol when quote.price disagrees with marketCap/sharesOutstanding (>50% off)", async () => {
    // Mimic the BKNG case: Yahoo's marketCap ($152B) and sharesOutstanding
    // (32.6M) imply ~$4664/share, but quote.price reports ~$192 — phantom
    // split. Both inputs come from the same Yahoo response, so the gap is
    // genuine Yahoo data corruption.
    quoteSummaryMock.mockResolvedValue({
      ...stubSummary(),
      summaryDetail: {
        ...stubSummary().summaryDetail,
        marketCap: 152_000_000_000,
      },
      defaultKeyStatistics: {
        ...stubSummary().defaultKeyStatistics,
        sharesOutstanding: 32_600_000, // real BKNG share count
      },
      price: { ...stubSummary().price, regularMarketPrice: 192 },
    });
    getEdgarFundamentalsMock.mockResolvedValue({ annual: [], quarterly: [] });
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "BKNG",
      { priceFrom: "2025-04-20", priceTo: "2026-04-20" },
      (e) => errors.push(e),
    );

    expect(result).toBeNull();
    expect(errors).toEqual([
      expect.objectContaining({
        symbol: "BKNG",
        endpoint: "price-consistency",
      }),
    ]);
  });

  it("does NOT exclude when EDGAR's per-period shares differ from Yahoo's current sharesOutstanding (Berry-Amcor case)", async () => {
    // After AMCR's Berry merger, EDGAR's most-recent fiscal year
    // (pre-merger) shows ~1.45B shares while Yahoo's sharesOutstanding
    // (post-merger) shows ~4.95B. Both are correct for what they
    // represent. The price-consistency check should pass.
    quoteSummaryMock.mockResolvedValue({
      ...stubSummary(),
      summaryDetail: {
        ...stubSummary().summaryDetail,
        marketCap: 58_000_000_000,
      },
      defaultKeyStatistics: {
        ...stubSummary().defaultKeyStatistics,
        sharesOutstanding: 4_950_000_000,
      },
      price: { ...stubSummary().price, regularMarketPrice: 11.72 },
    });
    getEdgarFundamentalsMock.mockResolvedValue({
      annual: [
        annualPeriod({
          fiscalYear: "2024",
          periodEndDate: "2024-06-30",
          income: { sharesDiluted: 1_450_000_000 }, // pre-merger
        }),
      ],
      quarterly: [],
    });
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "AMCR",
      { priceFrom: "2025-04-23", priceTo: "2026-04-23" },
      (e) => errors.push(e),
    );

    expect(result).not.toBeNull();
    expect(
      errors.filter(
        (e) => (e as { endpoint: string }).endpoint === "price-consistency",
      ),
    ).toHaveLength(0);
  });

  it("does NOT exclude when implied price is within 50% of quote price", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary()); // INTC: $65.50, $320B mcap
    getEdgarFundamentalsMock.mockResolvedValue(stubEdgarPeriods());
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: unknown[] = [];
    const result = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(result).not.toBeNull();
    expect(
      errors.filter(
        (e) => (e as { endpoint: string }).endpoint === "price-consistency",
      ),
    ).toHaveLength(0);
  });

  it("skips the consistency check when annual shares are unavailable", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    getEdgarFundamentalsMock.mockResolvedValue({ annual: [], quarterly: [] });
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: unknown[] = [];
    const result = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(result).not.toBeNull();
    expect(
      errors.filter(
        (e) => (e as { endpoint: string }).endpoint === "price-consistency",
      ),
    ).toHaveLength(0);
  });

  it("rescales EDGAR shares when filer reports in millions (MCD case)", async () => {
    // Mimic MCD: Yahoo's defaultKeyStatistics.sharesOutstanding = 716M
    // (raw count); EDGAR returns 716.4 for the same period (millions).
    // Without rescaling, marketCap/sharesDiluted is off by 1M× and the
    // price-consistency check excludes the symbol.
    quoteSummaryMock.mockResolvedValue({
      ...stubSummary(),
      summaryDetail: {
        ...stubSummary().summaryDetail,
        marketCap: 215_000_000_000,
      },
      defaultKeyStatistics: {
        ...stubSummary().defaultKeyStatistics,
        sharesOutstanding: 716_000_000,
      },
      price: { ...stubSummary().price, regularMarketPrice: 300 },
    });
    getEdgarFundamentalsMock.mockResolvedValue({
      annual: [
        annualPeriod({
          fiscalYear: "2025",
          periodEndDate: "2025-12-31",
          income: {
            netIncome: 8_200_000_000,
            epsDiluted: 11.45,
            sharesDiluted: 716.4, // EDGAR's millions-scale value
          },
          balance: { totalDebt: 50_000_000_000, cash: 1_000_000_000 },
        }),
        annualPeriod({
          fiscalYear: "2024",
          periodEndDate: "2024-12-31",
          income: { sharesDiluted: 721.9 },
        }),
      ],
      quarterly: [],
    });
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "MCD",
      { priceFrom: "2025-04-23", priceTo: "2026-04-23" },
      (e) => errors.push(e),
    );

    // Without the fix: price-consistency check excludes; with the fix:
    // shares get rescaled by 1M and the check passes.
    expect(result).not.toBeNull();
    expect(
      errors.filter(
        (e) => (e as { endpoint: string }).endpoint === "price-consistency",
      ),
    ).toHaveLength(0);
    // All periods should be rescaled by the same factor.
    expect(result!.annual[0]!.income.sharesDiluted).toBe(716_400_000);
    expect(result!.annual[1]!.income.sharesDiluted).toBe(721_900_000);
  });

  it("leaves shares unscaled when EDGAR already reports raw counts (AAPL case)", async () => {
    // Numbers picked so implied price ≈ quote price (consistency check
    // passes): 15B shares × $65.5 ≈ $983B market cap.
    quoteSummaryMock.mockResolvedValue({
      ...stubSummary(),
      summaryDetail: {
        ...stubSummary().summaryDetail,
        marketCap: 983_000_000_000,
      },
      defaultKeyStatistics: {
        ...stubSummary().defaultKeyStatistics,
        sharesOutstanding: 15_000_000_000,
      },
    });
    getEdgarFundamentalsMock.mockResolvedValue({
      annual: [
        annualPeriod({
          fiscalYear: "2025",
          periodEndDate: "2025-09-30",
          income: { sharesDiluted: 15_004_000_000 }, // already raw
        }),
      ],
      quarterly: [],
    });
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const result = await provider.fetchCompany(
      "AAPL",
      { priceFrom: "2025-04-23", priceTo: "2026-04-23" },
      () => {},
    );

    expect(result).not.toBeNull();
    expect(result!.annual[0]!.income.sharesDiluted).toBe(15_004_000_000);
  });

  it("reports chart failure as a non-fatal error and still returns the company", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    getEdgarFundamentalsMock.mockResolvedValue({ annual: [], quarterly: [] });
    chartMock.mockRejectedValue(new Error("chart unavailable"));

    const provider = new YahooProvider();
    const errors: Array<{ symbol: string; endpoint: string; message: string }> = [];
    const result = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-01-01", priceTo: "2025-01-01" },
      (e) => errors.push(e),
    );

    expect(result).not.toBeNull();
    expect(errors.some((e) => e.endpoint === "chart")).toBe(true);
  });
});
