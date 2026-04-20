import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Snapshot } from "@stockrank/core";
import { SNAPSHOT_SCHEMA_VERSION } from "@stockrank/core";
import { writeSnapshot } from "./writer.js";

function makeSnapshot(overrides?: Partial<Snapshot>): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotDate: "2026-04-20",
    generatedAt: "2026-04-20T13:00:00.000Z",
    source: "fmp-stable",
    universeName: "sp500",
    companies: [],
    errors: [],
    ...overrides,
  };
}

describe("writeSnapshot", () => {
  it("creates snapshot-{date}.json and snapshot-latest.json with identical content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    try {
      const snapshot = makeSnapshot();
      const { datedPath, latestPath } = await writeSnapshot(snapshot, dir);

      expect(datedPath.endsWith("snapshot-2026-04-20.json")).toBe(true);
      expect(latestPath.endsWith("snapshot-latest.json")).toBe(true);

      const datedRaw = await readFile(datedPath, "utf8");
      const latestRaw = await readFile(latestPath, "utf8");
      expect(datedRaw).toBe(latestRaw);
      expect(JSON.parse(datedRaw)).toEqual(snapshot);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates the output directory if it doesn't exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    const nested = join(dir, "deeply", "nested");
    try {
      await writeSnapshot(makeSnapshot(), nested);
      const files = await readdir(nested);
      expect(files).toContain("snapshot-latest.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("overwrites latest on a second run with the new content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    try {
      await writeSnapshot(makeSnapshot({ snapshotDate: "2026-04-20" }), dir);
      const second = makeSnapshot({
        snapshotDate: "2026-04-21",
        companies: [],
      });
      await writeSnapshot(second, dir);

      const latest = JSON.parse(
        await readFile(join(dir, "snapshot-latest.json"), "utf8"),
      ) as Snapshot;
      expect(latest.snapshotDate).toBe("2026-04-21");

      const files = await readdir(dir);
      expect(files).toContain("snapshot-2026-04-20.json");
      expect(files).toContain("snapshot-2026-04-21.json");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not leave .tmp files behind on a successful write", async () => {
    const dir = await mkdtemp(join(tmpdir(), "snap-"));
    try {
      await writeSnapshot(makeSnapshot(), dir);
      const files = await readdir(dir);
      expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
