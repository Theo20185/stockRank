import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for end-to-end tests against the static web app.
 *
 * Tests live under `e2e/`. The runner spins up `vite preview` against
 * the built `apps/web/dist` bundle, so the e2e suite exercises the
 * exact assets a Pages deploy would serve (including the committed
 * snapshot + options JSONs under `public/data/`). The `--port` flag
 * makes the preview port stable for the baseURL below.
 *
 * Run with: `npm run e2e`
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4173/stockRank/",
    trace: "retain-on-failure",
  },
  webServer: {
    // --host 127.0.0.1 forces IPv4 binding. By default Vite preview binds
    // to "localhost" which on some Windows configs resolves only to ::1
    // (IPv6); Playwright then can't reach it via http://127.0.0.1 and
    // times out waiting for the server. Pinning the host avoids the
    // dual-stack mismatch.
    command: "npm run preview --workspace=@stockrank/web -- --port 4173 --strictPort --host 127.0.0.1",
    url: "http://localhost:4173/stockRank/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
