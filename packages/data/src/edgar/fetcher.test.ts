import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EdgarFetchError,
  EdgarNotFoundError,
  _resetPaceClock,
  cacheAgeHours,
  fetchCompanyFacts,
} from "./fetcher.js";

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "edgar-fetch-test-"));
  _resetPaceClock();
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const factsBody = {
  cik: 320193,
  entityName: "Apple Inc.",
  facts: { "us-gaap": {} },
};

describe("fetchCompanyFacts", () => {
  it("hits EDGAR with the right URL + User-Agent", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      userAgent: "Test test@example.com",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Test test@example.com");
  });

  it("writes the response to cache", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const cached = JSON.parse(
      await readFile(join(cacheDir, "AAPL", "facts.json"), "utf8"),
    );
    expect(cached.cik).toBe(320193);
    const fetchedAt = await readFile(
      join(cacheDir, "AAPL", "fetched-at.txt"),
      "utf8",
    );
    expect(new Date(fetchedAt.trim()).getTime()).toBeGreaterThan(0);
  });

  it("reads from cache on the second call (no network)", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-fetches when cache is older than the TTL", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    // Backdate the fetched-at sidecar by 2 days.
    await writeFile(
      join(cacheDir, "AAPL", "fetched-at.txt"),
      new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      "utf8",
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheTtlHours: 24,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refresh: true bypasses the cache even when warm", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );

    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      refresh: true,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws EdgarNotFoundError for an unknown ticker", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchCompanyFacts("ZZZZZ", {
        cacheDir,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(EdgarNotFoundError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws EdgarNotFoundError on HTTP 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    await expect(
      fetchCompanyFacts("AAPL", {
        cacheDir,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(EdgarNotFoundError);
  });

  it("throws EdgarFetchError on non-2xx, non-404 responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(
      fetchCompanyFacts("AAPL", {
        cacheDir,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(EdgarFetchError);
  });
});

describe("cacheAgeHours", () => {
  it("returns null when no cache exists", async () => {
    expect(await cacheAgeHours("ZZZZ", { cacheDir })).toBeNull();
  });

  it("returns hours-since-fetch when cache exists", async () => {
    // mockImplementation rather than mockResolvedValue: a Response body
    // can only be read once. We need a fresh Response per call.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse(factsBody)),
    );
    await fetchCompanyFacts("AAPL", {
      cacheDir,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const age = await cacheAgeHours("AAPL", { cacheDir });
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1);
  });
});
