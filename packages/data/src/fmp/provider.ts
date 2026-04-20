import type { CompanySnapshot, SnapshotError } from "@stockrank/core";
import type { ErrorReporter, FetchOptions, MarketDataProvider } from "../provider.js";
import { FmpClient } from "./client.js";
import { buildCompanySnapshot } from "./mappers.js";
import type { FmpHistoricalPriceBar } from "./types.js";

export class FmpProvider implements MarketDataProvider {
  readonly name = "fmp";
  readonly #client: FmpClient;

  constructor(client: FmpClient) {
    this.#client = client;
  }

  async fetchCompany(
    symbol: string,
    options: FetchOptions,
    reportError: ErrorReporter,
  ): Promise<CompanySnapshot | null> {
    const profile = await this.#tryEndpoint(this.#client.getProfile.bind(this.#client), symbol, "profile", reportError);
    if (!profile) return null;
    const quote = await this.#tryEndpoint(this.#client.getQuote.bind(this.#client), symbol, "quote", reportError);
    if (!quote) return null;

    const ratiosTtm = (await this.#tryEndpoint(this.#client.getRatiosTtm.bind(this.#client), symbol, "ratios-ttm", reportError)) ?? { symbol };
    const keyMetricsTtm = (await this.#tryEndpoint(this.#client.getKeyMetricsTtm.bind(this.#client), symbol, "key-metrics-ttm", reportError)) ?? { symbol };
    const income = (await this.#tryEndpoint(this.#client.getAnnualIncomeStatements.bind(this.#client), symbol, "income-statement", reportError)) ?? [];
    const balance = (await this.#tryEndpoint(this.#client.getAnnualBalanceSheets.bind(this.#client), symbol, "balance-sheet-statement", reportError)) ?? [];
    const cashFlow = (await this.#tryEndpoint(this.#client.getAnnualCashFlows.bind(this.#client), symbol, "cash-flow-statement", reportError)) ?? [];
    const ratios = (await this.#tryEndpoint(this.#client.getAnnualRatios.bind(this.#client), symbol, "ratios", reportError)) ?? [];
    const keyMetrics = (await this.#tryEndpoint(this.#client.getAnnualKeyMetrics.bind(this.#client), symbol, "key-metrics", reportError)) ?? [];

    const priceBars = await this.#tryEndpointMulti(
      () => this.#client.getHistoricalPrices(symbol, options.priceFrom, options.priceTo),
      symbol,
      "historical-price-eod",
      reportError,
    );
    const averageVolume = averageVolumeFromBars(priceBars ?? []);

    return buildCompanySnapshot({
      profile,
      quote,
      ratiosTtm,
      keyMetricsTtm,
      income,
      balance,
      cashFlow,
      ratios,
      keyMetrics,
      averageVolume,
    });
  }

  async #tryEndpoint<T>(
    fn: (symbol: string) => Promise<T>,
    symbol: string,
    endpoint: string,
    reportError: ErrorReporter,
  ): Promise<T | null> {
    try {
      return await fn(symbol);
    } catch (err) {
      reportError(makeError(symbol, endpoint, err));
      return null;
    }
  }

  async #tryEndpointMulti<T>(
    fn: () => Promise<T>,
    symbol: string,
    endpoint: string,
    reportError: ErrorReporter,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      reportError(makeError(symbol, endpoint, err));
      return null;
    }
  }
}

function averageVolumeFromBars(bars: FmpHistoricalPriceBar[]): number {
  if (bars.length === 0) return 0;
  const total = bars.reduce((sum, b) => sum + b.volume, 0);
  return Math.round(total / bars.length);
}

function makeError(symbol: string, endpoint: string, err: unknown): SnapshotError {
  return {
    symbol,
    endpoint,
    message: err instanceof Error ? err.message : String(err),
  };
}
