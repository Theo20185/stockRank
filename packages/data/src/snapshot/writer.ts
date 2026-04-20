import { mkdir, rename, writeFile, copyFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Snapshot } from "@stockrank/core";

export type WriteSnapshotResult = {
  datedPath: string;
  latestPath: string;
};

/**
 * Atomically writes a snapshot to two files:
 *
 *   {outDir}/snapshot-{snapshot.snapshotDate}.json   (history)
 *   {outDir}/snapshot-latest.json                    (what the UI loads)
 *
 * Write is atomic per file: data is written to a `.tmp` sibling and renamed
 * into place, so a crashed run never leaves a half-written JSON file.
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

  return { datedPath, latestPath };
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
