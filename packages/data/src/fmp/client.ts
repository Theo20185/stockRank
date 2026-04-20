import type {
  FmpProfile,
  FmpQuote,
  FmpRatiosTtm,
  FmpKeyMetricsTtm,
  FmpIncomeStatement,
  FmpBalanceSheet,
  FmpCashFlow,
  FmpRatiosAnnual,
  FmpKeyMetricsAnnual,
  FmpHistoricalPriceBar,
} from "./types.js";

export type FmpClientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Max attempts including the initial try. Default 4 (3 retries). */
  maxAttempts?: number;
  /** Base backoff in ms; doubles per attempt. Default 250ms → 250/500/1000/2000. */
  retryBaseMs?: number;
  /** Sleep impl, overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_BASE_URL = "https://financialmodelingprep.com/stable";
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_MS = 250;
const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type Quote = {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  yearHigh: number;
  yearLow: number;
  exchange: string;
};

export type HistoricalPriceResponse =
  | FmpHistoricalPriceBar[]
  | { historical: FmpHistoricalPriceBar[] };

export class FmpClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #maxAttempts: number;
  readonly #retryBaseMs: number;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(options: FmpClientOptions) {
    if (!options.apiKey) {
      throw new Error("FmpClient: apiKey is required");
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.#sleep = options.sleep ?? defaultSleep;
  }

  async getProfile(symbol: string): Promise<FmpProfile> {
    const arr = await this.#fetchArray<FmpProfile>("/profile", { symbol });
    return this.#firstOrThrow(arr, "/profile", symbol);
  }

  async getQuote(symbol: string): Promise<Quote> {
    const arr = await this.#fetchArray<FmpQuote>("/quote", { symbol });
    const first = this.#firstOrThrow(arr, "/quote", symbol);
    return {
      symbol: first.symbol,
      name: first.name,
      price: first.price,
      marketCap: first.marketCap,
      yearHigh: first.yearHigh,
      yearLow: first.yearLow,
      exchange: first.exchange,
    };
  }

  async getRatiosTtm(symbol: string): Promise<FmpRatiosTtm> {
    const arr = await this.#fetchArray<FmpRatiosTtm>("/ratios-ttm", { symbol });
    return this.#firstOrThrow(arr, "/ratios-ttm", symbol);
  }

  async getKeyMetricsTtm(symbol: string): Promise<FmpKeyMetricsTtm> {
    const arr = await this.#fetchArray<FmpKeyMetricsTtm>("/key-metrics-ttm", {
      symbol,
    });
    return this.#firstOrThrow(arr, "/key-metrics-ttm", symbol);
  }

  async getAnnualIncomeStatements(
    symbol: string,
    limit = 5,
  ): Promise<FmpIncomeStatement[]> {
    return this.#fetchArray<FmpIncomeStatement>("/income-statement", {
      symbol,
      period: "annual",
      limit: String(limit),
    });
  }

  async getAnnualBalanceSheets(
    symbol: string,
    limit = 5,
  ): Promise<FmpBalanceSheet[]> {
    return this.#fetchArray<FmpBalanceSheet>("/balance-sheet-statement", {
      symbol,
      period: "annual",
      limit: String(limit),
    });
  }

  async getAnnualCashFlows(symbol: string, limit = 5): Promise<FmpCashFlow[]> {
    return this.#fetchArray<FmpCashFlow>("/cash-flow-statement", {
      symbol,
      period: "annual",
      limit: String(limit),
    });
  }

  async getAnnualRatios(symbol: string, limit = 5): Promise<FmpRatiosAnnual[]> {
    return this.#fetchArray<FmpRatiosAnnual>("/ratios", {
      symbol,
      period: "annual",
      limit: String(limit),
    });
  }

  async getAnnualKeyMetrics(
    symbol: string,
    limit = 5,
  ): Promise<FmpKeyMetricsAnnual[]> {
    return this.#fetchArray<FmpKeyMetricsAnnual>("/key-metrics", {
      symbol,
      period: "annual",
      limit: String(limit),
    });
  }

  async getHistoricalPrices(
    symbol: string,
    from: string,
    to: string,
  ): Promise<FmpHistoricalPriceBar[]> {
    const url = this.#buildUrl("/historical-price-eod/full", {
      symbol,
      from,
      to,
    });
    const response = await this.#fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(
        `FmpClient.getHistoricalPrices: HTTP ${response.status} for ${symbol}`,
      );
    }
    const body = (await response.json()) as HistoricalPriceResponse;
    if (Array.isArray(body)) return body;
    if (body && Array.isArray(body.historical)) return body.historical;
    return [];
  }

  async #fetchArray<T>(
    path: string,
    params: Record<string, string>,
  ): Promise<T[]> {
    const url = this.#buildUrl(path, params);
    const response = await this.#fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(
        `FmpClient${path}: HTTP ${response.status}${
          params["symbol"] ? ` for ${params["symbol"]}` : ""
        }`,
      );
    }
    const body = (await response.json()) as T[];
    if (!Array.isArray(body)) {
      throw new Error(`FmpClient${path}: expected array response`);
    }
    return body;
  }

  /**
   * Wraps fetch with retry-on-transient-error. Retries on:
   *   - HTTP 5xx (server errors that may resolve)
   *   - HTTP 429 (rate limited)
   *   - Network errors thrown by fetch
   *
   * Does NOT retry on 4xx (auth, premium, not-found) — those are persistent.
   */
  async #fetchWithRetry(url: string): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      try {
        const response = await this.#fetch(url);
        if (response.ok) return response;
        // Retryable HTTP statuses
        if (response.status >= 500 || response.status === 429) {
          if (attempt < this.#maxAttempts) {
            await this.#sleep(this.#backoffMs(attempt));
            continue;
          }
        }
        // Non-retryable (4xx other than 429) — return as-is for callers to throw
        return response;
      } catch (err) {
        lastError = err;
        if (attempt < this.#maxAttempts) {
          await this.#sleep(this.#backoffMs(attempt));
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("FmpClient: unreachable retry loop exit");
  }

  #backoffMs(attempt: number): number {
    return this.#retryBaseMs * 2 ** (attempt - 1);
  }

  #firstOrThrow<T>(arr: T[], path: string, symbol: string): T {
    const first = arr[0];
    if (!first) {
      throw new Error(`FmpClient${path}: empty response for ${symbol}`);
    }
    return first;
  }

  #buildUrl(path: string, params: Record<string, string>): string {
    const url = new URL(`${this.#baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    url.searchParams.set("apikey", this.#apiKey);
    return url.toString();
  }
}
