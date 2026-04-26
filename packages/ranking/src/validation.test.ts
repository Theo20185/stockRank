/**
 * Acceptance regression for `validation/case-study-2026-04-20.md`.
 *
 * Builds synthetic peer universes plus real point-in-time CompanySnapshots
 * for NVO (Mar 2026), TGT (Apr 2026), INTC (Aug 2025), then asserts:
 *   - NVO ranks in the top quartile of Pharmaceuticals
 *   - TGT ranks in the top quartile of its industry
 *   - INTC appears on the turnaround watchlist (NOT in the main composite)
 *
 * If these stop passing, the model has drifted from the design intent.
 * Either fix the model or update the spec deliberately.
 */

import { describe, it, expect } from "vitest";
import type { CompanySnapshot, AnnualPeriod, TtmMetrics } from "@stockrank/core";
import { rank } from "./ranking.js";
import { makeCompany, makePeriod, makeTtm } from "./test-helpers.js";

// ---------- NVO at 2026-03-06, $38.78 — real numbers from Fidelity ----------
const NVO_PERIODS: AnnualPeriod[] = [
  // FY2025
  {
    fiscalYear: "2025",
    periodEndDate: "2025-12-31",
    filingDate: "2026-02-05",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 48_588_000_000,
      grossProfit: 41_652_000_000,
      operatingIncome: 20_150_000_000,
      ebit: 20_150_000_000,
      ebitda: 22_456_000_000,
      interestExpense: 699_000_000,
      netIncome: 16_104_000_000,
      epsDiluted: 3.62,
      sharesDiluted: 4_444_000_000,
    },
    balance: {
      cash: 4_239_000_000,
      totalCurrentAssets: 27_112_000_000,
      totalCurrentLiabilities: 33_904_000_000,
      totalDebt: 20_588_000_000,
      totalEquity: 30_506_000_000,
    },
    cashFlow: {
      operatingCashFlow: 18_724_000_000,
      capex: -9_455_000_000,
      freeCashFlow: 9_269_000_000,
      dividendsPaid: 8_171_000_000,
      buybacks: 850_000_000,
    },
    ratios: { roic: 0.338, netDebtToEbitda: 0.73, currentRatio: 0.80 },
  },
  // FY2024
  {
    fiscalYear: "2024",
    periodEndDate: "2024-12-31",
    filingDate: "2025-02-05",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 40_314_000_000,
      grossProfit: 35_319_000_000,
      operatingIncome: 18_893_000_000,
      ebit: 18_893_000_000,
      ebitda: 20_080_000_000,
      interestExpense: 268_000_000,
      netIncome: 14_019_000_000,
      epsDiluted: 3.28,
      sharesDiluted: 4_441_000_000,
    },
    balance: {
      cash: 3_652_000_000,
      totalCurrentAssets: 22_336_000_000,
      totalCurrentLiabilities: 30_197_000_000,
      totalDebt: 14_268_000_000,
      totalEquity: 19_919_000_000,
    },
    cashFlow: {
      operatingCashFlow: 16_793_000_000,
      capex: -6_547_000_000,
      freeCashFlow: 10_246_000_000,
      dividendsPaid: 7_036_000_000,
      buybacks: 850_000_000,
    },
    ratios: { roic: 0.42, netDebtToEbitda: 0.53, currentRatio: 0.74 },
  },
  // FY2023, 2022, 2021 — quality flag is the floor passing; specific numbers matter less
  {
    fiscalYear: "2023",
    periodEndDate: "2023-12-31",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 34_445_000_000,
      grossProfit: 30_222_000_000,
      operatingIncome: 15_194_000_000,
      ebit: 15_194_000_000,
      ebitda: 16_275_000_000,
      interestExpense: 110_000_000,
      netIncome: 12_410_000_000,
      epsDiluted: 2.76,
      sharesDiluted: 4_458_000_000,
    },
    balance: {
      cash: 4_483_000_000,
      totalCurrentAssets: 20_710_000_000,
      totalCurrentLiabilities: 25_160_000_000,
      totalDebt: 4_005_000_000,
      totalEquity: 15_803_000_000,
    },
    cashFlow: {
      operatingCashFlow: 14_000_000_000,
      capex: -3_000_000_000,
      freeCashFlow: 11_000_000_000,
      dividendsPaid: 6_227_000_000,
      buybacks: 850_000_000,
    },
    ratios: { roic: 0.55, netDebtToEbitda: -0.03, currentRatio: 0.82 },
  },
  {
    fiscalYear: "2022",
    periodEndDate: "2022-12-31",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 25_425_000_000,
      grossProfit: 22_279_000_000,
      operatingIncome: 10_600_000_000,
      ebit: 10_600_000_000,
      ebitda: 11_542_000_000,
      interestExpense: 80_000_000,
      netIncome: 7_978_000_000,
      epsDiluted: 1.76,
      sharesDiluted: 4_499_000_000,
    },
    balance: {
      cash: 3_387_000_000,
      totalCurrentAssets: 15_545_000_000,
      totalCurrentLiabilities: 17_377_000_000,
      totalDebt: 3_705_000_000,
      totalEquity: 11_995_000_000,
    },
    cashFlow: {
      operatingCashFlow: 9_000_000_000,
      capex: -2_000_000_000,
      freeCashFlow: 7_000_000_000,
      dividendsPaid: 3_636_000_000,
      buybacks: 850_000_000,
    },
    ratios: { roic: 0.55, netDebtToEbitda: 0.03, currentRatio: 0.89 },
  },
  {
    fiscalYear: "2021",
    periodEndDate: "2021-12-31",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 21_537_000_000,
      grossProfit: 18_730_000_000,
      operatingIncome: 8_919_000_000,
      ebit: 8_919_000_000,
      ebitda: 9_732_000_000,
      interestExpense: 63_000_000,
      netIncome: 7_305_000_000,
      epsDiluted: 1.59,
      sharesDiluted: 4_557_000_000,
    },
    balance: {
      cash: 2_675_000_000,
      totalCurrentAssets: 13_093_000_000,
      totalCurrentLiabilities: 15_222_000_000,
      totalDebt: 4_076_000_000,
      totalEquity: 10_821_000_000,
    },
    cashFlow: {
      operatingCashFlow: 8_500_000_000,
      capex: -2_000_000_000,
      freeCashFlow: 6_500_000_000,
      dividendsPaid: 3_291_000_000,
      buybacks: 850_000_000,
    },
    ratios: { roic: 0.62, netDebtToEbitda: 0.14, currentRatio: 0.86 },
  },
];

const NVO_TTM: TtmMetrics = {
  peRatio: 10.7,
  evToEbitda: 8.4,
  priceToFcf: 18.6,
  priceToBook: 5.65,
  dividendYield: 0.047,
  currentRatio: 0.80,
  netDebtToEbitda: 0.73,
  roic: 0.338,
  earningsYield: 0.094,
  fcfYield: 0.054,
  enterpriseValue: 188_687_000_000,
  investedCapital: 46_855_000_000,
  forwardEps: 4.0,
};

const NVO_AT_ENTRY: CompanySnapshot = {
  symbol: "NVO",
  name: "Novo Nordisk",
  sector: "Healthcare",
  industry: "Pharmaceuticals",
  exchange: "NYSE",
  marketCap: 172_338_000_000,
  quote: { price: 38.78, yearHigh: 81.44, yearLow: 38.78, volume: 0, averageVolume: 14_000_000 },
  ttm: NVO_TTM,
  annual: NVO_PERIODS,
  pctOffYearHigh: 52.4,
};

// ---------- TGT at 2026-04-09, ~$81 — real numbers from FMP ----------
const TGT_PERIODS: AnnualPeriod[] = [
  {
    fiscalYear: "2025",
    periodEndDate: "2026-01-31",
    filingDate: "2026-03-11",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 104_780_000_000,
      grossProfit: 29_269_000_000,
      operatingIncome: 5_117_000_000,
      ebit: 5_212_000_000,
      ebitda: 8_013_000_000,
      interestExpense: 445_000_000,
      netIncome: 3_705_000_000,
      epsDiluted: 8.13,
      sharesDiluted: 455_600_000,
    },
    balance: {
      cash: 5_488_000_000,
      totalCurrentAssets: 20_005_000_000,
      totalCurrentLiabilities: 21_230_000_000,
      totalDebt: 5_592_000_000,
      totalEquity: 16_165_000_000,
    },
    cashFlow: {
      operatingCashFlow: 6_562_000_000,
      capex: -3_727_000_000,
      freeCashFlow: 2_835_000_000,
      dividendsPaid: 2_053_000_000,
      buybacks: 408_000_000,
    },
    ratios: { roic: 0.249, netDebtToEbitda: 0.013, currentRatio: 0.94 },
  },
  {
    fiscalYear: "2024",
    periodEndDate: "2025-02-01",
    filingDate: "2025-03-12",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 106_566_000_000,
      grossProfit: 30_064_000_000,
      operatingIncome: 5_566_000_000,
      ebit: 5_672_000_000,
      ebitda: 8_653_000_000,
      interestExpense: 411_000_000,
      netIncome: 4_091_000_000,
      epsDiluted: 8.86,
      sharesDiluted: 461_800_000,
    },
    balance: {
      cash: 4_762_000_000,
      totalCurrentAssets: 19_454_000_000,
      totalCurrentLiabilities: 20_500_000_000,
      totalDebt: 5_900_000_000,
      totalEquity: 15_500_000_000,
    },
    cashFlow: {
      operatingCashFlow: 7_367_000_000,
      capex: -2_891_000_000,
      freeCashFlow: 4_476_000_000,
      dividendsPaid: 2_046_000_000,
      buybacks: 1_007_000_000,
    },
    ratios: { roic: 0.27, netDebtToEbitda: 0.13, currentRatio: 0.95 },
  },
  {
    fiscalYear: "2023",
    periodEndDate: "2024-02-03",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 107_412_000_000,
      grossProfit: 29_584_000_000,
      operatingIncome: 5_707_000_000,
      ebit: 5_799_000_000,
      ebitda: 8_600_000_000,
      interestExpense: 502_000_000,
      netIncome: 4_138_000_000,
      epsDiluted: 8.94,
      sharesDiluted: 462_800_000,
    },
    balance: {
      cash: 4_500_000_000,
      totalCurrentAssets: 19_000_000_000,
      totalCurrentLiabilities: 20_000_000_000,
      totalDebt: 6_200_000_000,
      totalEquity: 13_800_000_000,
    },
    cashFlow: {
      operatingCashFlow: 7_000_000_000,
      capex: -3_000_000_000,
      freeCashFlow: 4_000_000_000,
      dividendsPaid: 2_034_000_000,
      buybacks: 0,
    },
    ratios: { roic: 0.30, netDebtToEbitda: 0.20, currentRatio: 0.95 },
  },
  {
    fiscalYear: "2022",
    periodEndDate: "2023-01-28",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 109_120_000_000,
      grossProfit: 26_814_000_000,
      operatingIncome: 3_848_000_000,
      ebit: 3_896_000_000,
      ebitda: 6_596_000_000,
      interestExpense: 478_000_000,
      netIncome: 2_780_000_000,
      epsDiluted: 5.98,
      sharesDiluted: 464_700_000,
    },
    balance: {
      cash: 5_911_000_000,
      totalCurrentAssets: 21_573_000_000,
      totalCurrentLiabilities: 19_500_000_000,
      totalDebt: 7_000_000_000,
      totalEquity: 11_232_000_000,
    },
    cashFlow: {
      operatingCashFlow: 4_000_000_000,
      capex: -5_500_000_000,
      freeCashFlow: -1_500_000_000,
      dividendsPaid: 1_836_000_000,
      buybacks: 156_000_000,
    },
    ratios: { roic: 0.20, netDebtToEbitda: 0.16, currentRatio: 1.11 },
  },
  {
    fiscalYear: "2021",
    periodEndDate: "2022-01-29",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 106_005_000_000,
      grossProfit: 31_042_000_000,
      operatingIncome: 8_946_000_000,
      ebit: 9_328_000_000,
      ebitda: 11_970_000_000,
      interestExpense: 421_000_000,
      netIncome: 6_946_000_000,
      epsDiluted: 14.10,
      sharesDiluted: 492_700_000,
    },
    balance: {
      cash: 8_500_000_000,
      totalCurrentAssets: 22_000_000_000,
      totalCurrentLiabilities: 20_000_000_000,
      totalDebt: 7_400_000_000,
      totalEquity: 12_500_000_000,
    },
    cashFlow: {
      operatingCashFlow: 8_000_000_000,
      capex: -3_500_000_000,
      freeCashFlow: 4_500_000_000,
      dividendsPaid: 1_544_000_000,
      buybacks: 7_356_000_000,
    },
    ratios: { roic: 0.55, netDebtToEbitda: -0.09, currentRatio: 1.10 },
  },
];

const TGT_TTM: TtmMetrics = {
  peRatio: 9.96,
  evToEbitda: 4.62,
  priceToFcf: 13.0,
  priceToBook: 2.28,
  dividendYield: 0.0557,
  currentRatio: 0.94,
  netDebtToEbitda: 0.013,
  roic: 0.249,
  earningsYield: 0.10,
  fcfYield: 0.0768,
  enterpriseValue: 37_008_000_000,
  investedCapital: 16_269_000_000,
  forwardEps: 8.5,
};

const TGT_AT_ENTRY: CompanySnapshot = {
  symbol: "TGT",
  name: "Target Corporation",
  sector: "Consumer Defensive",
  industry: "Discount Stores",
  exchange: "NYSE",
  marketCap: 36_904_000_000,
  quote: { price: 81, yearHigh: 130, yearLow: 81, volume: 0, averageVolume: 6_000_000 },
  ttm: TGT_TTM,
  annual: TGT_PERIODS,
  pctOffYearHigh: 37.7,
};

// ---------- INTC at 2025-08-22, ~$21 — real numbers from FMP/Fidelity ----------
const INTC_PERIODS: AnnualPeriod[] = [
  // At entry the most-recent annual was FY2024 (loss year). FY2025 wasn't out
  // yet; we omit it from the entry-time snapshot.
  {
    fiscalYear: "2024",
    periodEndDate: "2024-12-28",
    filingDate: "2025-01-31",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 53_101_000_000,
      grossProfit: 17_345_000_000,
      operatingIncome: -11_678_000_000,
      ebit: -10_176_000_000,
      ebitda: 1_203_000_000,
      interestExpense: 824_000_000,
      netIncome: -18_756_000_000,
      epsDiluted: -4.38,
      sharesDiluted: 4_280_000_000,
    },
    balance: {
      cash: 22_062_000_000,
      totalCurrentAssets: 47_324_000_000,
      totalCurrentLiabilities: 35_666_000_000,
      totalDebt: 50_011_000_000,
      totalEquity: 99_270_000_000,
    },
    cashFlow: {
      operatingCashFlow: 8_288_000_000,
      capex: -23_944_000_000,
      freeCashFlow: -15_656_000_000,
      dividendsPaid: 1_599_000_000,
      buybacks: 0,
    },
    ratios: { roic: -0.071, netDebtToEbitda: 23.3, currentRatio: 1.33 },
  },
  {
    fiscalYear: "2023",
    periodEndDate: "2023-12-30",
    filingDate: "2024-01-26",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 54_228_000_000,
      grossProfit: 21_711_000_000,
      operatingIncome: 93_000_000,
      ebit: 1_640_000_000,
      ebitda: 11_242_000_000,
      interestExpense: 878_000_000,
      netIncome: 1_689_000_000,
      epsDiluted: 0.40,
      sharesDiluted: 4_212_000_000,
    },
    balance: {
      cash: 25_000_000_000,
      totalCurrentAssets: 50_000_000_000,
      totalCurrentLiabilities: 30_000_000_000,
      totalDebt: 49_000_000_000,
      totalEquity: 105_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 11_000_000_000,
      capex: -25_000_000_000,
      freeCashFlow: -14_000_000_000,
      dividendsPaid: 3_087_000_000,
      buybacks: 0,
    },
    ratios: { roic: 0.013, netDebtToEbitda: 2.13, currentRatio: 1.67 },
  },
  {
    fiscalYear: "2022",
    periodEndDate: "2022-12-31",
    filingDate: "2023-01-27",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 63_054_000_000,
      grossProfit: 26_866_000_000,
      operatingIncome: 2_334_000_000,
      ebit: 8_264_000_000,
      ebitda: 21_299_000_000,
      interestExpense: 496_000_000,
      netIncome: 8_014_000_000,
      epsDiluted: 1.94,
      sharesDiluted: 4_123_000_000,
    },
    balance: {
      cash: 28_000_000_000,
      totalCurrentAssets: 52_000_000_000,
      totalCurrentLiabilities: 32_000_000_000,
      totalDebt: 42_000_000_000,
      totalEquity: 100_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 15_000_000_000,
      capex: -25_000_000_000,
      freeCashFlow: -10_000_000_000,
      dividendsPaid: 6_002_000_000,
      buybacks: 1_000_000_000,
    },
    ratios: { roic: 0.075, netDebtToEbitda: 0.66, currentRatio: 1.63 },
  },
  {
    fiscalYear: "2021",
    periodEndDate: "2021-12-25",
    filingDate: "2022-01-27",
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 79_024_000_000,
      grossProfit: 43_815_000_000,
      operatingIncome: 19_456_000_000,
      ebit: 22_082_000_000,
      ebitda: 33_874_000_000,
      interestExpense: 597_000_000,
      netIncome: 19_868_000_000,
      epsDiluted: 4.86,
      sharesDiluted: 4_090_000_000,
    },
    balance: {
      cash: 28_000_000_000,
      totalCurrentAssets: 55_000_000_000,
      totalCurrentLiabilities: 28_000_000_000,
      totalDebt: 38_000_000_000,
      totalEquity: 95_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 30_000_000_000,
      capex: -20_000_000_000,
      freeCashFlow: 10_000_000_000,
      dividendsPaid: 5_644_000_000,
      buybacks: 2_400_000_000,
    },
    ratios: { roic: 0.196, netDebtToEbitda: 0.30, currentRatio: 1.96 },
  },
  // 2020 — strong year (pre-collapse)
  {
    fiscalYear: "2020",
    periodEndDate: "2020-12-26",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 77_867_000_000,
      grossProfit: 43_614_000_000,
      operatingIncome: 23_876_000_000,
      ebit: 24_000_000_000,
      ebitda: 35_000_000_000,
      interestExpense: 600_000_000,
      netIncome: 20_899_000_000,
      epsDiluted: 4.94,
      sharesDiluted: 4_232_000_000,
    },
    balance: {
      cash: 25_000_000_000,
      totalCurrentAssets: 50_000_000_000,
      totalCurrentLiabilities: 24_000_000_000,
      totalDebt: 36_000_000_000,
      totalEquity: 81_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 35_000_000_000,
      capex: -14_000_000_000,
      freeCashFlow: 21_000_000_000,
      dividendsPaid: 5_568_000_000,
      buybacks: 14_000_000_000,
    },
    ratios: { roic: 0.21, netDebtToEbitda: 0.31, currentRatio: 2.08 },
  },
  // Pre-collapse historical context — Intel was a strong-ROIC blue chip
  // through 2019. The turnaround watchlist needs this to recognize that
  // INTC has a "long-term track record" worth a closer look.
  {
    fiscalYear: "2019",
    periodEndDate: "2019-12-28",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 71_965_000_000,
      grossProfit: 42_140_000_000,
      operatingIncome: 22_035_000_000,
      ebit: 22_000_000_000,
      ebitda: 32_000_000_000,
      interestExpense: 484_000_000,
      netIncome: 21_048_000_000,
      epsDiluted: 4.71,
      sharesDiluted: 4_473_000_000,
    },
    balance: {
      cash: 13_000_000_000,
      totalCurrentAssets: 31_000_000_000,
      totalCurrentLiabilities: 23_000_000_000,
      totalDebt: 29_000_000_000,
      totalEquity: 77_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 33_000_000_000,
      capex: -16_000_000_000,
      freeCashFlow: 17_000_000_000,
      dividendsPaid: 5_576_000_000,
      buybacks: 13_575_000_000,
    },
    ratios: { roic: 0.23, netDebtToEbitda: 0.50, currentRatio: 1.35 },
  },
  {
    fiscalYear: "2018",
    periodEndDate: "2018-12-29",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 70_848_000_000,
      grossProfit: 43_737_000_000,
      operatingIncome: 23_244_000_000,
      ebit: 23_000_000_000,
      ebitda: 33_000_000_000,
      interestExpense: 449_000_000,
      netIncome: 21_053_000_000,
      epsDiluted: 4.48,
      sharesDiluted: 4_701_000_000,
    },
    balance: {
      cash: 11_000_000_000,
      totalCurrentAssets: 28_000_000_000,
      totalCurrentLiabilities: 22_000_000_000,
      totalDebt: 27_000_000_000,
      totalEquity: 74_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 29_000_000_000,
      capex: -15_000_000_000,
      freeCashFlow: 14_000_000_000,
      dividendsPaid: 5_541_000_000,
      buybacks: 10_730_000_000,
    },
    ratios: { roic: 0.24, netDebtToEbitda: 0.48, currentRatio: 1.27 },
  },
  {
    fiscalYear: "2017",
    periodEndDate: "2017-12-30",
    filingDate: null,
    reportedCurrency: "USD",
    priceAtYearEnd: null,
    priceHighInYear: null,
    priceLowInYear: null,
    income: {
      revenue: 62_761_000_000,
      grossProfit: 39_904_000_000,
      operatingIncome: 18_050_000_000,
      ebit: 18_000_000_000,
      ebitda: 28_000_000_000,
      interestExpense: 646_000_000,
      netIncome: 9_601_000_000,
      epsDiluted: 1.99,
      sharesDiluted: 4_835_000_000,
    },
    balance: {
      cash: 9_000_000_000,
      totalCurrentAssets: 29_000_000_000,
      totalCurrentLiabilities: 18_000_000_000,
      totalDebt: 25_000_000_000,
      totalEquity: 69_000_000_000,
    },
    cashFlow: {
      operatingCashFlow: 22_000_000_000,
      capex: -12_000_000_000,
      freeCashFlow: 10_000_000_000,
      dividendsPaid: 5_072_000_000,
      buybacks: 3_615_000_000,
    },
    ratios: { roic: 0.18, netDebtToEbitda: 0.57, currentRatio: 1.61 },
  },
];

const INTC_TTM: TtmMetrics = {
  peRatio: null,
  evToEbitda: 96,
  priceToFcf: null,
  priceToBook: 1.0,
  dividendYield: 0,
  currentRatio: 1.33,
  netDebtToEbitda: 23.3,
  roic: -0.071,
  earningsYield: -0.21,
  fcfYield: -0.17,
  enterpriseValue: 116_000_000_000,
  investedCapital: 149_000_000_000,
  forwardEps: 1.5, // analyst consensus for FY2025 (recovery in progress at entry)
};

const INTC_AT_ENTRY: CompanySnapshot = {
  symbol: "INTC",
  name: "Intel Corporation",
  sector: "Technology",
  industry: "Semiconductors",
  exchange: "NASDAQ",
  marketCap: 90_000_000_000,
  quote: { price: 21, yearHigh: 50, yearLow: 18.25, volume: 0, averageVolume: 100_000_000 },
  ttm: INTC_TTM,
  annual: INTC_PERIODS,
  pctOffYearHigh: 58, // 21/50 → 58% off the prior 12m high
};

// Build a synthetic peer set within an industry. Peers are intentionally
// mediocre on every dimension so a real outlier (NVO/TGT cheap, etc.) ranks
// near the top.
function makeSyntheticPeers(
  count: number,
  opts: { industry: string; sector: string; symbolPrefix: string },
): CompanySnapshot[] {
  return Array.from({ length: count }, (_, i) =>
    makeCompany({
      symbol: `${opts.symbolPrefix}${i.toString().padStart(2, "0")}`,
      industry: opts.industry,
      sector: opts.sector,
      ttm: makeTtm({
        peRatio: 18 + (i % 5),       // 18..22
        evToEbitda: 14 + (i % 5),    // 14..18
        priceToFcf: 22 + (i % 5),    // 22..26
        priceToBook: 4 + (i % 3),    // 4..6
        dividendYield: 0.02 + (i % 3) * 0.005, // 2.0..3.0%
        currentRatio: 1.0 + (i % 4) * 0.1,
        netDebtToEbitda: 1.5 + (i % 3) * 0.5,
        roic: 0.10 + (i % 4) * 0.02,
      }),
      annual: Array.from({ length: 5 }, (_, y) =>
        makePeriod({
          fiscalYear: String(2025 - y),
          ratios: { roic: 0.10 + (i % 4) * 0.02, netDebtToEbitda: 1.5, currentRatio: 1.2 },
        }),
      ),
    }),
  );
}

describe("validation acceptance — case study 2026-04-20", () => {
  it("ranks NVO in the top quartile of Pharmaceuticals", () => {
    const universe = [
      NVO_AT_ENTRY,
      ...makeSyntheticPeers(15, {
        industry: "Pharmaceuticals",
        sector: "Healthcare",
        symbolPrefix: "PH",
      }),
    ];
    const result = rank({ companies: universe, snapshotDate: "2026-03-06" });
    const nvo = result.rows.find((r) => r.symbol === "NVO");
    expect(nvo, "NVO should pass the quality floor and appear in main composite").toBeDefined();

    const pharmaRows = result.rows
      .filter((r) => r.industry === "Pharmaceuticals")
      .sort((a, b) => a.industryRank - b.industryRank);
    const quartileSize = Math.ceil(pharmaRows.length / 4);
    const topQuartileSymbols = pharmaRows.slice(0, quartileSize).map((r) => r.symbol);

    expect(topQuartileSymbols).toContain("NVO");
    expect(nvo!.pctOffYearHigh).toBeGreaterThan(40);
  });

  it("ranks TGT in the top quartile of Discount Stores", () => {
    const universe = [
      TGT_AT_ENTRY,
      ...makeSyntheticPeers(12, {
        industry: "Discount Stores",
        sector: "Consumer Defensive",
        symbolPrefix: "DR",
      }),
    ];
    const result = rank({ companies: universe, snapshotDate: "2026-04-09" });
    const tgt = result.rows.find((r) => r.symbol === "TGT");
    expect(tgt, "TGT should pass the quality floor").toBeDefined();

    const peerRows = result.rows
      .filter((r) => r.industry === "Discount Stores")
      .sort((a, b) => a.industryRank - b.industryRank);
    const quartileSize = Math.ceil(peerRows.length / 4);
    const topQuartileSymbols = peerRows.slice(0, quartileSize).map((r) => r.symbol);

    expect(topQuartileSymbols).toContain("TGT");
    expect(tgt!.pctOffYearHigh).toBeGreaterThan(35);
  });

  it("excludes INTC from the main composite (failed §4 floor — surfaces in Avoid)", () => {
    // Pre-2026-04-26 this test asserted INTC landed on the
    // turnaround watchlist. The watchlist was removed; INTC now just
    // surfaces as an ineligibleRow → Avoid bucket. The qualitative
    // "long-term-quality + TTM trough + deep drawdown" pattern that
    // previously distinguished it as a recovery candidate is no
    // longer surfaced by the engine — the user can recognize it
    // directly from the company history.
    const universe = [
      INTC_AT_ENTRY,
      ...makeSyntheticPeers(15, {
        industry: "Semiconductors",
        sector: "Technology",
        symbolPrefix: "SE",
      }),
    ];
    const result = rank({ companies: universe, snapshotDate: "2025-08-22" });

    expect(
      result.rows.find((r) => r.symbol === "INTC"),
      "INTC should be excluded from the main composite",
    ).toBeUndefined();
    expect(
      result.ineligibleRows.find((r) => r.symbol === "INTC"),
      "INTC should appear as an ineligibleRow stub (Avoid bucket)",
    ).toBeDefined();
  });
});
