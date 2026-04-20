import type { Snapshot } from "@stockrank/core";

const SNAPSHOT_URL = `${import.meta.env.BASE_URL}data/snapshot-latest.json`;

export async function loadSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<Snapshot> {
  const response = await fetchImpl(SNAPSHOT_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to load snapshot: HTTP ${response.status} from ${SNAPSHOT_URL}`,
    );
  }
  const body = (await response.json()) as Snapshot;
  if (body.schemaVersion !== 1) {
    throw new Error(
      `Unsupported snapshot schemaVersion: ${body.schemaVersion}`,
    );
  }
  return body;
}
