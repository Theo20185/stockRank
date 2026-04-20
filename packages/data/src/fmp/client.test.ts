import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { FmpClient } from "./client.js";

const BASE = "https://financialmodelingprep.com/stable";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("FmpClient construction", () => {
  it("requires an apiKey", () => {
    // @ts-expect-error intentionally missing required option
    expect(() => new FmpClient({})).toThrow(/apiKey/);
  });

  it("accepts an apiKey", () => {
    expect(() => new FmpClient({ apiKey: "k" })).not.toThrow();
  });
});

describe("FmpClient.getQuote", () => {
  it("fetches the /quote endpoint and maps the first array element to a Quote", async () => {
    server.use(
      http.get(`${BASE}/quote`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("symbol")).toBe("INTC");
        expect(url.searchParams.get("apikey")).toBe("test-key");
        return HttpResponse.json([
          {
            symbol: "INTC",
            name: "Intel Corporation",
            price: 65.6,
            marketCap: 329_000_000_000,
            yearHigh: 70.33,
            yearLow: 18.25,
            exchange: "NASDAQ",
            ignoredField: "should not crash",
          },
        ]);
      }),
    );

    const client = new FmpClient({ apiKey: "test-key" });
    const quote = await client.getQuote("INTC");

    expect(quote).toEqual({
      symbol: "INTC",
      name: "Intel Corporation",
      price: 65.6,
      marketCap: 329_000_000_000,
      yearHigh: 70.33,
      yearLow: 18.25,
      exchange: "NASDAQ",
    });
  });

  it("throws on a non-2xx response", async () => {
    server.use(
      http.get(`${BASE}/quote`, () => HttpResponse.text("nope", { status: 500 })),
    );
    const client = new FmpClient({ apiKey: "k", sleep: async () => {} });
    await expect(client.getQuote("INTC")).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the API returns an empty array", async () => {
    server.use(http.get(`${BASE}/quote`, () => HttpResponse.json([])));
    const client = new FmpClient({ apiKey: "k" });
    await expect(client.getQuote("ZZZZ")).rejects.toThrow(/empty response/);
  });

  it("respects a custom baseUrl", async () => {
    server.use(
      http.get("https://custom.example.com/quote", () =>
        HttpResponse.json([
          {
            symbol: "X",
            name: "X",
            price: 1,
            marketCap: 1,
            yearHigh: 1,
            yearLow: 1,
            exchange: "X",
          },
        ]),
      ),
    );
    const client = new FmpClient({
      apiKey: "k",
      baseUrl: "https://custom.example.com",
    });
    const q = await client.getQuote("X");
    expect(q.symbol).toBe("X");
  });
});
