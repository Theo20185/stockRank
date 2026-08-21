import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexChange } from "./wikipedia-history.js";
import { loadHistoryArtifact } from "./wikipedia-history-cache.js";

const CHANGES: IndexChange[] = [
  {
    date: "2024-01-02",
    added: { ticker: "NEW", name: "Newco" },
    removed: { ticker: "OLD", name: "Oldco" },
  },
];

function fetchers(overrides: Partial<{
  constituents: () => Promise<Array<{ symbol: string }>>;
  changes: () => Promise<IndexChange[]>;
}> = {}) {
  return {
    constituents:
      overrides.constituents ?? (async () => [{ symbol: "AAA" }, { symbol: "BBB" }]),
    changes: overrides.changes ?? (async () => CHANGES),
  };
}

async function seedCache(
  dir: string,
  fetchedAt: string,
  constituents: string[] = ["CCC"],
): Promise<void> {
  await writeFile(join(dir, "changes.json"), JSON.stringify(CHANGES), "utf-8");
  await writeFile(
    join(dir, "current-constituents.json"),
    JSON.stringify(constituents),
    "utf-8",
  );
  await writeFile(join(dir, "fetched-at.txt"), fetchedAt, "utf-8");
}

describe("loadHistoryArtifact", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sp500-history-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("returns a fresh cache without touching the network", async () => {
    await seedCache(dir, new Date().toISOString());
    const constituentsSpy = vi.fn(fetchers().constituents);
    const artifact = await loadHistoryArtifact({
      cacheDir: dir,
      fetchers: fetchers({ constituents: constituentsSpy }),
    });
    expect(artifact.currentConstituents).toEqual(["CCC"]);
    expect(constituentsSpy).not.toHaveBeenCalled();
  });

  it("refetches when the cache is stale and rewrites it", async () => {
    await seedCache(dir, "2020-01-01T00:00:00.000Z");
    const artifact = await loadHistoryArtifact({
      cacheDir: dir,
      fetchers: fetchers(),
    });
    expect(artifact.currentConstituents).toEqual(["AAA", "BBB"]);
    const onDisk = JSON.parse(
      await readFile(join(dir, "current-constituents.json"), "utf-8"),
    ) as string[];
    expect(onDisk).toEqual(["AAA", "BBB"]);
  });

  it("falls back to the STALE cache with a loud warning when the live fetch fails", async () => {
    // The 2026-08-20 incident: TTL-expired cache + Wikipedia page
    // layout change killed the whole PIT backtest. Historical
    // membership reconstruction only needs an internally consistent
    // (constituents, changes) pair, so a stale artifact is strictly
    // better than a dead run.
    await seedCache(dir, "2020-01-01T00:00:00.000Z");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const artifact = await loadHistoryArtifact({
      cacheDir: dir,
      fetchers: fetchers({
        changes: async () => {
          throw new Error("changes table not found");
        },
      }),
    });
    expect(artifact.currentConstituents).toEqual(["CCC"]);
    expect(artifact.fetchedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0])).toContain("STALE");
  });

  it("keeps the stale fetched-at so the next run retries the live fetch", async () => {
    await seedCache(dir, "2020-01-01T00:00:00.000Z");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadHistoryArtifact({
      cacheDir: dir,
      fetchers: fetchers({
        changes: async () => {
          throw new Error("boom");
        },
      }),
    });
    const fetchedAt = await readFile(join(dir, "fetched-at.txt"), "utf-8");
    expect(fetchedAt).toBe("2020-01-01T00:00:00.000Z");
  });

  it("rethrows when the live fetch fails and no cache exists at all", async () => {
    await expect(
      loadHistoryArtifact({
        cacheDir: dir,
        fetchers: fetchers({
          changes: async () => {
            throw new Error("changes table not found");
          },
        }),
      }),
    ).rejects.toThrow("changes table not found");
  });
});
