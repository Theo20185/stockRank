import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FmpClient } from "./client.js";

const BASE = "https://financialmodelingprep.com/stable";
const FIXTURE_DIR = resolve(
  fileURLToPath(import.meta.url),
  "../../../../../tests/fixtures/fmp/probe",
);

async function loadFixture(name: string): Promise<unknown> {
  const raw = await readFile(resolve(FIXTURE_DIR, name), "utf8");
  return JSON.parse(raw);
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("FmpClient endpoints (against captured probe fixtures)", () => {
  it("getProfile returns the first record for INTC", async () => {
    const fixture = await loadFixture("profile_INTC.json");
    server.use(http.get(`${BASE}/profile`, () => HttpResponse.json(fixture)));

    const client = new FmpClient({ apiKey: "k" });
    const profile = await client.getProfile("INTC");

    expect(profile.symbol).toBe("INTC");
    expect(profile.companyName).toBe("Intel Corporation");
    expect(profile.industry).toBe("Semiconductors");
    expect(profile.exchange).toBe("NASDAQ");
    expect(profile.marketCap).toBeGreaterThan(0);
  });

  it("getRatiosTtm exposes the TTM ratios for INTC", async () => {
    const fixture = await loadFixture("ratios_ttm_INTC.json");
    server.use(http.get(`${BASE}/ratios-ttm`, () => HttpResponse.json(fixture)));

    const client = new FmpClient({ apiKey: "k" });
    const ratios = await client.getRatiosTtm("INTC");

    expect(ratios.symbol).toBe("INTC");
    expect(typeof ratios.priceToBookRatioTTM).toBe("number");
    expect(typeof ratios.currentRatioTTM).toBe("number");
  });

  it("getKeyMetricsTtm exposes EV, ROIC, leverage metrics", async () => {
    const fixture = await loadFixture("key_metrics_ttm_INTC.json");
    server.use(
      http.get(`${BASE}/key-metrics-ttm`, () => HttpResponse.json(fixture)),
    );

    const client = new FmpClient({ apiKey: "k" });
    const km = await client.getKeyMetricsTtm("INTC");

    expect(km.symbol).toBe("INTC");
    expect(typeof km.enterpriseValueTTM).toBe("number");
    expect(typeof km.evToEBITDATTM).toBe("number");
    expect(typeof km.investedCapitalTTM).toBe("number");
  });

  it("getAnnualIncomeStatements returns up to 5 fiscal years", async () => {
    const fixture = await loadFixture("income_a_INTC.json");
    server.use(
      http.get(`${BASE}/income-statement`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("period")).toBe("annual");
        expect(url.searchParams.get("limit")).toBe("5");
        return HttpResponse.json(fixture);
      }),
    );

    const client = new FmpClient({ apiKey: "k" });
    const statements = await client.getAnnualIncomeStatements("INTC");

    expect(statements.length).toBe(5);
    const fy2025 = statements[0]!;
    expect(fy2025.fiscalYear).toBe("2025");
    expect(fy2025.revenue).toBeGreaterThan(0);
    expect(fy2025.ebitda).toBeGreaterThan(0);
  });

  it("getAnnualBalanceSheets reads totalDebt and totalStockholdersEquity", async () => {
    const fixture = await loadFixture("balance_a_INTC.json");
    server.use(
      http.get(`${BASE}/balance-sheet-statement`, () =>
        HttpResponse.json(fixture),
      ),
    );

    const client = new FmpClient({ apiKey: "k" });
    const sheets = await client.getAnnualBalanceSheets("INTC");

    const fy2025 = sheets[0]!;
    expect(fy2025.totalDebt).toBeGreaterThan(0);
    expect(fy2025.totalStockholdersEquity).toBeGreaterThan(0);
    expect(fy2025.cashAndShortTermInvestments).toBeGreaterThan(0);
  });

  it("getAnnualCashFlows reads OCF, CapEx, FCF", async () => {
    const fixture = await loadFixture("cashflow_a_INTC.json");
    server.use(
      http.get(`${BASE}/cash-flow-statement`, () => HttpResponse.json(fixture)),
    );

    const client = new FmpClient({ apiKey: "k" });
    const cfs = await client.getAnnualCashFlows("INTC");

    const fy2025 = cfs[0]!;
    expect(typeof fy2025.netCashProvidedByOperatingActivities).toBe("number");
    expect(typeof fy2025.capitalExpenditure).toBe("number");
    expect(typeof fy2025.freeCashFlow).toBe("number");
  });

  it("getAnnualRatios returns historical period ratios", async () => {
    const fixture = await loadFixture("ratios_a_INTC.json");
    server.use(http.get(`${BASE}/ratios`, () => HttpResponse.json(fixture)));

    const client = new FmpClient({ apiKey: "k" });
    const ratios = await client.getAnnualRatios("INTC");

    expect(ratios.length).toBeGreaterThan(0);
    expect(typeof ratios[0]!.currentRatio).toBe("number");
  });

  it("getAnnualKeyMetrics returns historical period metrics", async () => {
    const fixture = await loadFixture("key_metrics_a_INTC.json");
    server.use(
      http.get(`${BASE}/key-metrics`, () => HttpResponse.json(fixture)),
    );

    const client = new FmpClient({ apiKey: "k" });
    const km = await client.getAnnualKeyMetrics("INTC");

    expect(km.length).toBeGreaterThan(0);
    // ROIC field may be present or null depending on the period;
    // we only assert the field exists on the type after parsing.
    expect("returnOnInvestedCapital" in km[0]!).toBe(true);
  });

  it("getHistoricalPrices accepts a date range and returns price bars", async () => {
    const fixture = await loadFixture("historical_price_INTC.json");
    server.use(
      http.get(`${BASE}/historical-price-eod/full`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("from")).toBe("2024-08-22");
        expect(url.searchParams.get("to")).toBe("2025-09-15");
        return HttpResponse.json(fixture);
      }),
    );

    const client = new FmpClient({ apiKey: "k" });
    const bars = await client.getHistoricalPrices(
      "INTC",
      "2024-08-22",
      "2025-09-15",
    );

    expect(bars.length).toBeGreaterThan(0);
    expect(typeof bars[0]!.close).toBe("number");
    expect(typeof bars[0]!.date).toBe("string");
  });
});
