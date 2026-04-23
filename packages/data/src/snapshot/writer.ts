import { mkdir, readdir, rename, writeFile, copyFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Snapshot } from "@stockrank/core";

export type WriteSnapshotResult = {
  datedPath: string;
  latestPath: string;
  /** Older `snapshot-YYYY-MM-DD.json` files removed during this write. */
  prunedPaths: string[];
};

const DATED_SNAPSHOT_RE = /^snapshot-\d{4}-\d{2}-\d{2}\.json$/;

/**
 * Atomically writes a snapshot to two files:
 *
 *   {outDir}/snapshot-{snapshot.snapshotDate}.json   (today's archive)
 *   {outDir}/snapshot-latest.json                    (what the UI loads)
 *
 * After writing, prunes any prior `snapshot-YYYY-MM-DD.json` files so
 * only today's dated snapshot remains alongside `snapshot-latest.json`.
 *
 * Per design: historical FV-trend reconstructs from EDGAR quarterly
 * filings (deep, validated, free), so the daily snapshot archive
 * piling up in the repo serves no purpose — older dated files are
 * deleted on each write to keep the repo lean.
 *
 * Write is atomic per file: data is written to a `.tmp` sibling and
 * renamed into place, so a crashed run never leaves a half-written
 * JSON file. Non-snapshot artifacts in `outDir` (fv-trend.json,
 * options-summary.json, etc.) are untouched.
 */
export async function writeSnapshot(
  snapshot: Snapshot,
  outDir: string,
): Promise<WriteSnapshotResult> {
  await mkdir(outDir, { recursive: true });

  const datedPath = join(outDir, `snapshot-${snapshot.snapshotDate}.json`);
  const latestPath = join(outDir, "snapshot-latest.json");

  await atomicWriteJson(datedPath, snapshot);
  // Copy then rename so latest swap is also atomic — never read a half-written
  // file via the latest path even mid-update.
  const latestTmp = `${latestPath}.tmp`;
  await copyFile(datedPath, latestTmp);
  await rename(latestTmp, latestPath);

  const prunedPaths = await pruneOlderDatedSnapshots(
    outDir,
    `snapshot-${snapshot.snapshotDate}.json`,
  );

  return { datedPath, latestPath, prunedPaths };
}

async function pruneOlderDatedSnapshots(
  outDir: string,
  keepFile: string,
): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return [];
  }
  const pruned: string[] = [];
  for (const file of entries) {
    if (!DATED_SNAPSHOT_RE.test(file)) continue;
    if (file === keepFile) continue;
    const target = join(outDir, file);
    try {
      await unlink(target);
      pruned.push(target);
    } catch {
      // Best-effort pruning; a missing file or permission glitch
      // shouldn't fail the write itself.
    }
  }
  return pruned;
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  try {
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}
