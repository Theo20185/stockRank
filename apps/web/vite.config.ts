import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages project URL is /stockRank/. The leading and trailing slash
// matter — Vite uses this to rewrite asset URLs in the production build.
//
// publicDir points at the repo-root /public/ where the local ingest writes
// snapshot-latest.json — that file then ships verbatim alongside the built
// site at /data/snapshot-latest.json.
export default defineConfig({
  plugins: [react()],
  base: "/stockRank/",
  publicDir: "../../public",
});
