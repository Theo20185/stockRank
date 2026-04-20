import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompanySnapshot, mapAnnualPeriods, mapTtm } from "./mappers.js";
import type {
  FmpBalanceSheet,
  FmpCashFlow,
  FmpIncomeStatement,
  FmpKeyMetricsAnnual,
  FmpKeyMetricsTtm,
  FmpProfile,
  FmpRatiosAnnual,
  FmpRatiosTtm,
} from "./types.js";

const FIXTURE_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../../../../tests/fixtures/fmp/probe",
);

async function loadFixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(FIXTURE_DIR, name), "utf8")) as T;
}

describe("mapTtm", () => {
  it("preserves real numbers and converts missing fields to null", async () => {
    const ratios = (await loadFixture<FmpRatiosTtm[]>("ratios_ttm_INTC.json"))[0]!;
    const km = (
      await loadFixture<FmpKeyMetricsTtm[]>("key_metrics_ttm_INTC.json")
    )[0]!;

    const ttm = mapTtm(ratios, km);

    expect(ttm.priceToBook).toBeGreaterThan(0);
    expect(ttm.enterpriseValue).toBeGreaterThan(0);
    expect(ttm.investedCapital).toBeGreaterThan(0);
    // Field absent on TTM ratio object should map to null without throwing.
    expect(ttm.peRatio === null || typeof ttm.peRatio === "number").toBe(true);
  });

  it("falls back to keyMetrics.currentRatioTTM when ratios.currentRatioTTM is missing", () => {
    const ratios = { symbol: "X" } as FmpRatiosTtm;
    const km = { symbol: "X", currentRatioTTM: 1.5 } as FmpKeyMetricsTtm;
    const ttm = mapTtm(ratios, km);
    expect(ttm.currentRatio).toBe(1.5);
  });

  it("returns null for NaN or non-finite numbers", () => {
    const ratios = {
      symbol: "X",
      priceToBookRatioTTM: Number.NaN,
    } as unknown as FmpRatiosTtm;
    const km = { symbol: "X" } as FmpKeyMetricsTtm;
    const ttm = mapTtm(ratios, km);
    expect(ttm.priceToBook).toBeNull();
  });
});

describe("mapAnnualPeriods", () => {
  it("joins income/balance/cashflow/ratios by fiscalYear and preserves order", async () => {
    const income = await loadFixture<FmpIncomeStatement[]>("income_a_INTC.json");
    const balance = await loadFixture<FmpBalanceSheet[]>("balance_a_INTC.json");
    const cashFlow = await loadFixture<FmpCashFlow[]>("cashflow_a_INTC.json");
    const ratios = await loadFixture<FmpRatiosAnnual[]>("ratios_a_INTC.json");
    const keyMetrics = await loadFixture<FmpKeyMetricsAnnual[]>(
      "key_metrics_a_INTC.json",
    );

    const periods = mapAnnualPeriods({
      income,
      balance,
      cashFlow,
      ratios,
      keyMetrics,
    });

    expect(periods.length).toBe(income.length);
    expect(periods[0]!.fiscalYear).toBe(income[0]!.fiscalYear);

    const fy2024 = periods.find((p) => p.fiscalYear === "2024");
    expect(fy2024).toBeDefined();
    expect(fy2024!.income.netIncome).toBeLessThan(0); // Intel's loss year
    expect(fy2024!.balance.totalDebt).toBeGreaterThan(0);
  });

  it("handles missing balance/cashflow records by emitting nulls (no throw)", () => {
    const periods = mapAnnualPeriods({
      income: [
        {
          symbol: "X",
          date: "2025-12-31",
          reportedCurrency: "USD",
          fiscalYear: "2025",
          period: "FY",
          revenue: 100,
        } as FmpIncomeStatement,
      ],
      balance: [],
      cashFlow: [],
      ratios: [],
      keyMetrics: [],
    });

    expect(periods.length).toBe(1);
    expect(periods[0]!.balance.totalDebt).toBeNull();
    expect(periods[0]!.cashFlow.freeCashFlow).toBeNull();
  });

  it("flips sign on dividend/buyback outflows so snapshot uses positive amounts", () => {
    const periods = mapAnnualPeriods({
      income: [
        {
          symbol: "X",
          date: "2025-12-31",
          reportedCurrency: "USD",
          fiscalYear: "2025",
          period: "FY",
        } as FmpIncomeStatement,
      ],
      balance: [],
      cashFlow: [
        {
          symbol: "X",
          date: "2025-12-31",
          reportedCurrency: "USD",
          fiscalYear: "2025",
          period: "FY",
          commonDividendsPaid: -2_000_000_000,
          commonStockRepurchased: -500_000_000,
        } as FmpCashFlow,
      ],
      ratios: [],
      keyMetrics: [],
    });

    expect(periods[0]!.cashFlow.dividendsPaid).toBe(2_000_000_000);
    expect(periods[0]!.cashFlow.buybacks).toBe(500_000_000);
  });
});

describe("buildCompanySnapshot", () => {
  it("assembles a CompanySnapshot for INTC with sane top-level fields", async () => {
    const profile = (await loadFixture<FmpProfile[]>("profile_INTC.json"))[0]!;
    const ratiosTtm = (
      await loadFixture<FmpRatiosTtm[]>("ratios_ttm_INTC.json")
    )[0]!;
    const keyMetricsTtm = (
      await loadFixture<FmpKeyMetricsTtm[]>("key_metrics_ttm_INTC.json")
    )[0]!;
    const income = await loadFixture<FmpIncomeStatement[]>("income_a_INTC.json");
    const balance = await loadFixture<FmpBalanceSheet[]>("balance_a_INTC.json");
    const cashFlow = await loadFixture<FmpCashFlow[]>("cashflow_a_INTC.json");
    const ratios = await loadFixture<FmpRatiosAnnual[]>("ratios_a_INTC.json");
    const keyMetrics = await loadFixture<FmpKeyMetricsAnnual[]>(
      "key_metrics_a_INTC.json",
    );

    const snapshot = buildCompanySnapshot({
      profile,
      quote: {
        symbol: "INTC",
        name: "Intel Corporation",
        price: 65.6,
        marketCap: 329_000_000_000,
        yearHigh: 70.33,
        yearLow: 18.25,
        exchange: "NASDAQ",
      },
      ratiosTtm,
      keyMetricsTtm,
      income,
      balance,
      cashFlow,
      ratios,
      keyMetrics,
      averageVolume: 100_000_000,
    });

    expect(snapshot.symbol).toBe("INTC");
    expect(snapshot.name).toBe("Intel Corporation");
    expect(snapshot.industry).toBe("Semiconductors");
    expect(snapshot.annual.length).toBe(income.length);
    expect(snapshot.pctOffYearHigh).toBeGreaterThan(0); // 65.6 < 70.33
    expect(snapshot.ttm.investedCapital).toBeGreaterThan(0);
  });
});
