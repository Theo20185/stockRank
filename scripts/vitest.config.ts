import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

export default defineConfig({
  resolve: {
    alias: {
      "@stockrank/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@stockrank/ranking": resolve(repoRoot, "packages/ranking/src/index.ts"),
      "@stockrank/data": resolve(repoRoot, "packages/data/src/index.ts"),
    },
  },
  test: {
    name: "scripts",
    include: ["*.test.ts"],
    root: here,
  },
});
