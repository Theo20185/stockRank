import { describe, it, expect } from "vitest";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSp500Universe } from "./loader.js";

async function tempFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "universe-"));
  const path = join(dir, "u.json");
  await writeFile(path, content, "utf8");
  return path;
}

describe("loadSp500Universe", () => {
  it("loads the committed default sp500.json with at least the validation tickers", async () => {
    const universe = await loadSp500Universe();
    const symbols = universe.map((e) => e.symbol);
    expect(symbols).toContain("INTC");
    expect(symbols).toContain("TGT");
    expect(universe.length).toBeGreaterThan(0);
    for (const entry of universe) {
      expect(typeof entry.symbol).toBe("string");
      expect(typeof entry.name).toBe("string");
    }
  });

  it("loads from a path override", async () => {
    const path = await tempFile(
      JSON.stringify([{ symbol: "X", name: "X Corp" }]),
    );
    const universe = await loadSp500Universe(path);
    expect(universe).toEqual([{ symbol: "X", name: "X Corp" }]);
  });

  it("rejects non-array JSON", async () => {
    const path = await tempFile(JSON.stringify({ not: "array" }));
    await expect(loadSp500Universe(path)).rejects.toThrow(/array/);
  });

  it("rejects entries missing required string fields", async () => {
    const path = await tempFile(
      JSON.stringify([{ symbol: "X" }]),
    );
    await expect(loadSp500Universe(path)).rejects.toThrow(/index 0/);
  });
});
