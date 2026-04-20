import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Mirror the alias config from vite.config.ts so test runs resolve workspace
// packages identically to the dev/build pipeline.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@stockrank/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@stockrank/ranking": resolve(repoRoot, "packages/ranking/src/index.ts"),
    },
  },
  test: {
    name: "web",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
