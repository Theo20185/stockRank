import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { FmpClient } from "./client.js";

const BASE = "https://financialmodelingprep.com/stable";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const STUB_QUOTE = [
  {
    symbol: "X",
    name: "X",
    price: 1,
    marketCap: 1,
    yearHigh: 1,
    yearLow: 1,
    exchange: "X",
  },
];

describe("FmpClient retry behavior", () => {
  it("retries on 503 then succeeds on the second attempt", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/quote`, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.text("down", { status: 503 });
        return HttpResponse.json(STUB_QUOTE);
      }),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({ apiKey: "k", sleep, retryBaseMs: 10 });
    const quote = await client.getQuote("X");

    expect(quote.symbol).toBe("X");
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it("retries on 429 (rate limited)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/quote`, () => {
        calls += 1;
        if (calls < 3) return HttpResponse.text("slow down", { status: 429 });
        return HttpResponse.json(STUB_QUOTE);
      }),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({ apiKey: "k", sleep, retryBaseMs: 10 });
    await client.getQuote("X");

    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx other than 429", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/quote`, () => {
        calls += 1;
        return HttpResponse.text("nope", { status: 404 });
      }),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({ apiKey: "k", sleep });
    await expect(client.getQuote("X")).rejects.toThrow(/HTTP 404/);
    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does NOT retry on 402 (premium endpoint)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/quote`, () => {
        calls += 1;
        return HttpResponse.text("paid", { status: 402 });
      }),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({ apiKey: "k", sleep });
    await expect(client.getQuote("X")).rejects.toThrow(/HTTP 402/);
    expect(calls).toBe(1);
  });

  it("retries on network errors (fetch throws)", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error("ECONNRESET");
      return new Response(JSON.stringify(STUB_QUOTE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep,
      retryBaseMs: 10,
    });
    await client.getQuote("X");

    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts and propagates the last error", async () => {
    server.use(
      http.get(`${BASE}/quote`, () => HttpResponse.text("down", { status: 503 })),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({
      apiKey: "k",
      sleep,
      maxAttempts: 3,
      retryBaseMs: 10,
    });
    await expect(client.getQuote("X")).rejects.toThrow(/HTTP 503/);
    expect(sleep).toHaveBeenCalledTimes(2); // 3 attempts → 2 sleeps between
  });

  it("uses exponential backoff: 250, 500, 1000 by default", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/quote`, () => {
        calls += 1;
        return HttpResponse.text("down", { status: 503 });
      }),
    );

    const sleep = vi.fn(async () => {});
    const client = new FmpClient({ apiKey: "k", sleep, maxAttempts: 4 });
    await expect(client.getQuote("X")).rejects.toThrow(/HTTP 503/);

    expect(calls).toBe(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([250, 500, 1000]);
  });
});
