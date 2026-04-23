import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

  // Regression: the original implementation anchored CACHE_ROOT at
  // `process.cwd()`, so `npm run ingest` (which runs from packages/data/
  // per its workspace script) wrote to `packages/data/tmp/chart-cache/`
  // while `compute-fv-trend` (run from the repo root) read from
  // `tmp/chart-cache/`. Producers and consumers landed on different
  // directories and the sparkline silently shipped with no historical
  // samples. Anchoring to the repo root via import.meta.url fixes this.
  describe("default cache root is repo-anchored, not cwd-dependent", () => {
    function expectedRepoRoot(): string {
      // This test file lives at packages/data/src/edgar/chart-cache.test.ts
      return resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "..",
      );
    }

    it("write+read uses the same path regardless of cwd", async () => {
      const symbol = "ROOTANCHOR_TEST";
      const expectedPath = join(
        expectedRepoRoot(),
        "tmp/chart-cache",
        symbol,
        "monthly.json",
      );

      // Run from the repo root.
      const originalCwd = process.cwd();
      try {
        process.chdir(expectedRepoRoot());
        await writeMonthlyBars(symbol, sampleBars);
        const read1 = await readMonthlyBars(symbol);
        expect(read1).toEqual(sampleBars);

        // Now run from packages/data/ — same call must hit the same file.
        process.chdir(join(expectedRepoRoot(), "packages", "data"));
        const read2 = await readMonthlyBars(symbol);
        expect(read2).toEqual(sampleBars);
      } finally {
        process.chdir(originalCwd);
        await rm(dirname(expectedPath), {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    });
  });
});
