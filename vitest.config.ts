import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Aliases at the root so workspace-package imports resolve identically in
// every project (per-project configs duplicate this for safety; one or the
// other has to apply depending on how vitest discovers projects in CI vs
// dev environments).
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@stockrank/core": resolve(here, "packages/core/src/index.ts"),
      "@stockrank/ranking": resolve(here, "packages/ranking/src/index.ts"),
    },
  },
  test: {
    projects: ["packages/*", "apps/*"],
  },
});
