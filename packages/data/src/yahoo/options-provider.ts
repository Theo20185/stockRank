import YahooFinance from "yahoo-finance2";
import type {
  ContractQuote,
  ExpirationGroup,
  ExpirationList,
  OptionsProvider,
} from "../options/types.js";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

type YahooContract = {
  contractSymbol?: string;
  strike?: number;
  bid?: number | null;
  ask?: number | null;
  lastPrice?: number | null;
  volume?: number | null;
  openInterest?: number | null;
  impliedVolatility?: number | null;
  inTheMoney?: boolean;
  expiration?: Date | string;
};

type YahooOptionsResponse = {
  underlyingSymbol?: string;
  quote?: { regularMarketPrice?: number | null };
  expirationDates?: Array<Date | string>;
  options?: Array<{
    expirationDate?: Date | string;
    calls?: YahooContract[];
    puts?: YahooContract[];
  }>;
};

function toIsoDate(input: Date | string): string {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return input.slice(0, 10);
}

function daysBetween(from: Date, toIso: string): number {
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((to - f) / 86_400_000);
}

function mapContract(raw: YahooContract, expirationIso: string, now: Date): ContractQuote {
  return {
    contractSymbol: raw.contractSymbol ?? "",
    expiration: expirationIso,
    daysToExpiry: daysBetween(now, expirationIso),
    strike: raw.strike ?? 0,
    bid: raw.bid ?? null,
    ask: raw.ask ?? null,
    lastPrice: raw.lastPrice ?? null,
    volume: raw.volume ?? 0,
    openInterest: raw.openInterest ?? 0,
    impliedVolatility: raw.impliedVolatility ?? null,
    inTheMoney: raw.inTheMoney ?? false,
  };
}

export type YahooOptionsProviderOptions = {
  /** Injectable clock for daysToExpiry — defaults to `new Date()`. */
  now?: () => Date;
};

export class YahooOptionsProvider implements OptionsProvider {
  readonly name = "yahoo";
  private readonly now: () => Date;

  constructor(opts: YahooOptionsProviderOptions = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  async listExpirations(symbol: string): Promise<ExpirationList> {
    const raw = (await yahooFinance.options(symbol)) as YahooOptionsResponse;
    const dates = (raw.expirationDates ?? []).map(toIsoDate);
    const unique = Array.from(new Set(dates)).sort();
    return {
      symbol,
      fetchedAt: this.now().toISOString(),
      underlyingPrice: raw.quote?.regularMarketPrice ?? 0,
      expirationDates: unique,
    };
  }

  async fetchExpirationGroup(
    symbol: string,
    expirationDate: string,
  ): Promise<ExpirationGroup> {
    const dateIso = expirationDate.slice(0, 10);
    const raw = (await yahooFinance.options(symbol, {
      date: new Date(`${dateIso}T00:00:00.000Z`),
    })) as YahooOptionsResponse;

    const groups = raw.options ?? [];
    const block =
      groups.find((g) => g.expirationDate && toIsoDate(g.expirationDate) === dateIso) ??
      groups[0];

    if (!block) return { expiration: dateIso, calls: [], puts: [] };

    const now = this.now();
    return {
      expiration: dateIso,
      calls: (block.calls ?? []).map((c) => mapContract(c, dateIso, now)),
      puts: (block.puts ?? []).map((p) => mapContract(p, dateIso, now)),
    };
  }
}
