import { describe, it, expect, vi, beforeEach } from "vitest";

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

function stubFundamentals() {
  // fundamentalsTimeSeries returns oldest-first.
  return [
    {
      date: new Date("2023-12-30"),
      totalRevenue: 54_228_000_000,
      grossProfit: 21_711_000_000,
      operatingIncome: 93_000_000,
      EBIT: 1_640_000_000,
      EBITDA: 11_242_000_000,
      interestExpense: 878_000_000,
      netIncome: 1_689_000_000,
      dilutedEPS: 0.40,
      dilutedAverageShares: 4_212_000_000,
      cashAndCashEquivalents: 25_000_000_000,
      currentAssets: 50_000_000_000,
      currentLiabilities: 30_000_000_000,
      totalDebt: 49_000_000_000,
      stockholdersEquity: 105_000_000_000,
      operatingCashFlow: 11_000_000_000,
      capitalExpenditure: -25_000_000_000,
      freeCashFlow: -14_000_000_000,
      cashDividendsPaid: -3_087_000_000,
      repurchaseOfCapitalStock: 0,
    },
    {
      date: new Date("2024-12-28"),
      totalRevenue: 53_101_000_000,
      grossProfit: 17_345_000_000,
      operatingIncome: -11_678_000_000,
      EBIT: -10_176_000_000,
      // No EBITDA in this row — provider should reconstruct from EBIT + depreciation
      reconciledDepreciation: 11_000_000_000,
      interestExpense: 824_000_000,
      netIncome: -18_756_000_000,
      dilutedEPS: -4.38,
      dilutedAverageShares: 4_280_000_000,
      cashAndCashEquivalents: 22_062_000_000,
      currentAssets: 47_324_000_000,
      currentLiabilities: 35_666_000_000,
      totalDebt: 50_011_000_000,
      stockholdersEquity: 99_270_000_000,
      operatingCashFlow: 8_288_000_000,
      capitalExpenditure: -23_944_000_000,
      freeCashFlow: -15_656_000_000,
      cashDividendsPaid: -1_599_000_000,
      repurchaseOfCapitalStock: 0,
    },
  ];
}

beforeEach(() => {
  quoteSummaryMock.mockReset();
  chartMock.mockReset();
  fundamentalsTimeSeriesMock.mockReset();
});

describe("YahooProvider", () => {
  it("maps quoteSummary + fundamentalsTimeSeries + chart into a CompanySnapshot", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockResolvedValue(stubFundamentals());
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

  it("sorts annual periods most-recent-first regardless of API order", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockResolvedValue(stubFundamentals());
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

  it("uses EBITDA when present and reconstructs from EBIT + depreciation when missing", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockResolvedValue(stubFundamentals());
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const snap = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-08-22", priceTo: "2025-08-22" },
      () => {},
    );

    const fy2023 = snap!.annual.find((p) => p.fiscalYear === "2023")!;
    expect(fy2023.income.ebitda).toBe(11_242_000_000); // direct from EBITDA field

    const fy2024 = snap!.annual.find((p) => p.fiscalYear === "2024")!;
    // EBIT -10.176B + depreciation 11B = 824M
    expect(fy2024.income.ebitda).toBe(824_000_000);
  });

  it("normalizes outflow sign on dividends and buybacks (stores positive)", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockResolvedValue(stubFundamentals());
    chartMock.mockResolvedValue({ quotes: [] });

    const provider = new YahooProvider();
    const snap = await provider.fetchCompany(
      "INTC",
      { priceFrom: "2024-08-22", priceTo: "2025-08-22" },
      () => {},
    );

    const fy2024 = snap!.annual.find((p) => p.fiscalYear === "2024")!;
    expect(fy2024.cashFlow.dividendsPaid).toBe(1_599_000_000);
    expect(fy2024.cashFlow.buybacks).toBe(0);
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

  it("reports fundamentalsTimeSeries failure as a non-fatal error and returns the company", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockRejectedValue(new Error("history unavailable"));
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
    expect(errors.some((e) => e.endpoint === "fundamentalsTimeSeries")).toBe(true);
  });

  it("reports chart failure as a non-fatal error and still returns the company", async () => {
    quoteSummaryMock.mockResolvedValue(stubSummary());
    fundamentalsTimeSeriesMock.mockResolvedValue([]);
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
