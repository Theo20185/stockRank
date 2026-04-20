import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// GitHub Pages project URL is /stockRank/. The leading and trailing slash
// matter — Vite uses this to rewrite asset URLs in the production build.
//
// publicDir points at the repo-root /public/ where the local ingest writes
// snapshot-latest.json — that file then ships verbatim alongside the built
// site at /data/snapshot-latest.json.
//
// Aliases point workspace package imports at their TS source. Without these
// Vite tries to follow the package.json `exports` to a `.ts` file, which
// works on the local Windows workspace but fails under stricter resolution
// (CI, fresh `npm ci`) — see https://vite.dev/guide/dep-pre-bundling.html
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

export default defineConfig({
  plugins: [react()],
  base: "/stockRank/",
  publicDir: "../../public",
  resolve: {
    alias: {
      "@stockrank/core": resolve(repoRoot, "packages/core/src/index.ts"),
      "@stockrank/ranking": resolve(repoRoot, "packages/ranking/src/index.ts"),
    },
  },
});
