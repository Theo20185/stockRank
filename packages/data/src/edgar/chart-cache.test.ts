import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chartCacheAgeHours,
  readMonthlyBars,
  writeMonthlyBars,
} from "./chart-cache.js";
import type { HistoricalBar } from "./mapper.js";

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "chart-cache-test-"));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

const sampleBars: HistoricalBar[] = [
  { date: "2025-09-30", close: 150, high: 155, low: 145 },
  { date: "2025-12-31", close: 160, high: 165, low: 155 },
];

describe("chart-cache", () => {
  it("write then read round-trips the bars", async () => {
    await writeMonthlyBars("AAPL", sampleBars, { cacheDir });
    const loaded = await readMonthlyBars("AAPL", { cacheDir });
    expect(loaded).toEqual(sampleBars);
  });

  it("read returns null when no cache exists", async () => {
    expect(await readMonthlyBars("ZZZZ", { cacheDir })).toBeNull();
  });

  it("write is best-effort — does not throw on bad cache dir", async () => {
    // Pointing at a path that exists as a file (not a dir) should fail
    // the underlying mkdir; the helper swallows + logs.
    await expect(
      writeMonthlyBars("AAPL", sampleBars, {
        cacheDir: "/dev/null/bad-path",
      }),
    ).resolves.toBeUndefined();
  });

  it("cacheAgeHours returns hours-since-write for a fresh cache", async () => {
    await writeMonthlyBars("AAPL", sampleBars, { cacheDir });
    const age = await chartCacheAgeHours("AAPL", { cacheDir });
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(1);
  });

  it("cacheAgeHours returns null when no cache exists", async () => {
    expect(await chartCacheAgeHours("ZZZZ", { cacheDir })).toBeNull();
  });
});
