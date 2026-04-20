import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export type UniverseEntry = {
  symbol: string;
  name: string;
};

const SP500_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./sp500.json",
);

export async function loadSp500Universe(
  pathOverride?: string,
): Promise<UniverseEntry[]> {
  const path = pathOverride ?? SP500_PATH;
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return validateUniverse(parsed);
}

function validateUniverse(value: unknown): UniverseEntry[] {
  if (!Array.isArray(value)) {
    throw new Error("Universe file must contain a JSON array");
  }
  return value.map((entry, i) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { symbol: unknown }).symbol !== "string" ||
      typeof (entry as { name: unknown }).name !== "string"
    ) {
      throw new Error(
        `Universe entry at index ${i} must have string symbol and name`,
      );
    }
    const e = entry as UniverseEntry;
    return { symbol: e.symbol, name: e.name };
  });
}
