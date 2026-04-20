import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadOptionsView, _resetOptionsCache } from "./options-loader.js";
import type { OptionsView } from "@stockrank/ranking";

const fakeView: OptionsView = {
  symbol: "DECK",
  fetchedAt: "2026-04-20T12:00:00.000Z",
  currentPrice: 107.81,
  expirations: [],
};

function fetchOk(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

function fetch404(): typeof fetch {
  return vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
}

beforeEach(() => {
  _resetOptionsCache();
});

describe("loadOptionsView", () => {
  it("returns loaded view on 200", async () => {
    const f = fetchOk(fakeView);
    const result = await loadOptionsView("DECK", f);
    expect(result).toEqual({ status: "loaded", view: fakeView });
  });

  it("returns not-fetched on 404 (no error)", async () => {
    const f = fetch404();
    const result = await loadOptionsView("XYZ", f);
    expect(result).toEqual({ status: "not-fetched" });
  });

  it("throws on non-404 errors", async () => {
    const f = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    await expect(loadOptionsView("DECK", f)).rejects.toThrow(/HTTP 500/);
  });

  it("serves from cache within the 30-minute TTL", async () => {
    const f = fetchOk(fakeView);
    const t0 = 1_000_000;
    const result1 = await loadOptionsView("DECK", f, () => t0);
    const result2 = await loadOptionsView("DECK", f, () => t0 + 29 * 60 * 1000);
    expect(result1).toEqual(result2);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
  });

  it("re-fetches after the 30-minute TTL expires", async () => {
    const f = fetchOk(fakeView);
    const t0 = 1_000_000;
    await loadOptionsView("DECK", f, () => t0);
    await loadOptionsView("DECK", f, () => t0 + 31 * 60 * 1000);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });

  it("does not cache 404 responses", async () => {
    const f = fetch404();
    await loadOptionsView("XYZ", f);
    await loadOptionsView("XYZ", f);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });
});
