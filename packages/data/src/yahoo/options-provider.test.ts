import { describe, it, expect, vi, beforeEach } from "vitest";

const optionsMock = vi.fn();

vi.mock("yahoo-finance2", () => {
  const FakeYahoo = function () {
    return {
      options: (...args: unknown[]) => optionsMock(...args),
    };
  };
  return { default: FakeYahoo };
});

// eslint-disable-next-line import/first
import { YahooOptionsProvider } from "./options-provider.js";

function stubInitial() {
  return {
    underlyingSymbol: "DECK",
    quote: { regularMarketPrice: 107.81 },
    expirationDates: [
      new Date("2026-04-24T00:00:00.000Z"),
      new Date("2026-05-15T00:00:00.000Z"),
      new Date("2027-01-15T00:00:00.000Z"),
      new Date("2028-01-21T00:00:00.000Z"),
    ],
    strikes: [80, 90, 100, 110, 120, 130],
    options: [
      {
        expirationDate: new Date("2026-04-24T00:00:00.000Z"),
        calls: [],
        puts: [],
      },
    ],
  };
}

function stubGroup(expiration: Date) {
  return {
    underlyingSymbol: "DECK",
    quote: { regularMarketPrice: 107.81 },
    expirationDates: [expiration],
    strikes: [100, 110, 120],
    options: [
      {
        expirationDate: expiration,
        calls: [
          {
            contractSymbol: "DECK270115C00110000",
            strike: 110,
            currency: "USD",
            lastPrice: 12.5,
            change: 0.2,
            percentChange: 1.6,
            volume: 25,
            openInterest: 480,
            bid: 12.3,
            ask: 12.7,
            contractSize: "REGULAR",
            expiration,
            lastTradeDate: new Date("2026-04-17T14:00:00.000Z"),
            impliedVolatility: 0.41,
            inTheMoney: false,
          },
        ],
        puts: [
          {
            contractSymbol: "DECK270115P00100000",
            strike: 100,
            currency: "USD",
            lastPrice: 7.4,
            change: -0.1,
            percentChange: -1.3,
            volume: 18,
            openInterest: 320,
            bid: 7.1,
            ask: 7.6,
            contractSize: "REGULAR",
            expiration,
            lastTradeDate: new Date("2026-04-17T14:00:00.000Z"),
            impliedVolatility: 0.39,
            inTheMoney: false,
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  optionsMock.mockReset();
});

describe("YahooOptionsProvider.listExpirations", () => {
  it("normalizes Yahoo's Date objects to YYYY-MM-DD strings, sorted ascending", async () => {
    optionsMock.mockResolvedValueOnce(stubInitial());
    const provider = new YahooOptionsProvider();
    const result = await provider.listExpirations("DECK");
    expect(result.symbol).toBe("DECK");
    expect(result.underlyingPrice).toBe(107.81);
    expect(result.expirationDates).toEqual([
      "2026-04-24",
      "2026-05-15",
      "2027-01-15",
      "2028-01-21",
    ]);
    expect(optionsMock).toHaveBeenCalledTimes(1);
    expect(optionsMock).toHaveBeenCalledWith("DECK");
  });

  it("accepts ISO-string expirationDates from Yahoo (not just Dates)", async () => {
    optionsMock.mockResolvedValueOnce({
      underlyingSymbol: "DECK",
      quote: { regularMarketPrice: 100 },
      expirationDates: ["2027-01-15T00:00:00.000Z", "2028-01-21T00:00:00.000Z"],
      strikes: [100],
      options: [],
    });
    const provider = new YahooOptionsProvider();
    const result = await provider.listExpirations("DECK");
    expect(result.expirationDates).toEqual(["2027-01-15", "2028-01-21"]);
  });

  it("dedupes and sorts when Yahoo returns out-of-order dates", async () => {
    optionsMock.mockResolvedValueOnce({
      underlyingSymbol: "DECK",
      quote: { regularMarketPrice: 100 },
      expirationDates: [
        new Date("2028-01-21T00:00:00.000Z"),
        new Date("2027-01-15T00:00:00.000Z"),
        new Date("2027-01-15T00:00:00.000Z"),
      ],
      strikes: [],
      options: [],
    });
    const provider = new YahooOptionsProvider();
    const result = await provider.listExpirations("DECK");
    expect(result.expirationDates).toEqual(["2027-01-15", "2028-01-21"]);
  });
});

describe("YahooOptionsProvider.fetchExpirationGroup", () => {
  it("passes a Date for the requested expiration to yahoo.options()", async () => {
    optionsMock.mockResolvedValueOnce(stubGroup(new Date("2027-01-15T00:00:00.000Z")));
    const provider = new YahooOptionsProvider();
    await provider.fetchExpirationGroup("DECK", "2027-01-15");
    expect(optionsMock).toHaveBeenCalledTimes(1);
    const [symbol, opts] = optionsMock.mock.calls[0]!;
    expect(symbol).toBe("DECK");
    expect((opts as { date: Date }).date.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("maps Yahoo contract shape into ContractQuote, computing daysToExpiry from a fixed clock", async () => {
    optionsMock.mockResolvedValueOnce(stubGroup(new Date("2027-01-15T00:00:00.000Z")));
    const provider = new YahooOptionsProvider({ now: () => new Date("2026-04-20T00:00:00.000Z") });
    const group = await provider.fetchExpirationGroup("DECK", "2027-01-15");

    expect(group.expiration).toBe("2027-01-15");
    expect(group.calls).toHaveLength(1);
    expect(group.puts).toHaveLength(1);

    const call = group.calls[0]!;
    expect(call).toMatchObject({
      contractSymbol: "DECK270115C00110000",
      expiration: "2027-01-15",
      strike: 110,
      bid: 12.3,
      ask: 12.7,
      lastPrice: 12.5,
      volume: 25,
      openInterest: 480,
      impliedVolatility: 0.41,
      inTheMoney: false,
    });
    expect(call.daysToExpiry).toBe(270);  // Apr 20 2026 → Jan 15 2027

    expect(group.puts[0]).toMatchObject({
      contractSymbol: "DECK270115P00100000",
      strike: 100,
      bid: 7.1,
    });
  });

  it("returns empty calls/puts when Yahoo returns no matching expiration block", async () => {
    optionsMock.mockResolvedValueOnce({
      underlyingSymbol: "DECK",
      quote: { regularMarketPrice: 107.81 },
      expirationDates: [new Date("2027-01-15T00:00:00.000Z")],
      strikes: [],
      options: [],
    });
    const provider = new YahooOptionsProvider();
    const group = await provider.fetchExpirationGroup("DECK", "2027-01-15");
    expect(group).toEqual({ expiration: "2027-01-15", calls: [], puts: [] });
  });

  it("coerces null/undefined volume + openInterest to 0", async () => {
    const expiration = new Date("2027-01-15T00:00:00.000Z");
    optionsMock.mockResolvedValueOnce({
      underlyingSymbol: "DECK",
      quote: { regularMarketPrice: 107.81 },
      expirationDates: [expiration],
      strikes: [110],
      options: [{
        expirationDate: expiration,
        calls: [{
          contractSymbol: "X", strike: 110, expiration,
          bid: 1, ask: 2, lastPrice: 1.5,
          // volume + openInterest deliberately missing
          impliedVolatility: 0.3, inTheMoney: false,
        }],
        puts: [],
      }],
    });
    const provider = new YahooOptionsProvider();
    const group = await provider.fetchExpirationGroup("DECK", "2027-01-15");
    expect(group.calls[0]).toMatchObject({ volume: 0, openInterest: 0 });
  });
});
