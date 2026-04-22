#!/usr/bin/env tsx
/**
 * Full refresh, deeper than `npm run refresh`. Three phases in order:
 *
 *   1. Re-pull the back-test cache via `--merge-cache`. Yahoo's
 *      fundamentalsTimeSeries is internally capped at ~5y of annual
 *      data; older periods age out of their rolling window over time.
 *      Merge mode fetches fresh AND keeps every date previously in
 *      the cache, so the long-tail historical data we accumulated
 *      doesn't drop. Also re-pulls the price chart and merges by date
 *      (Yahoo's adjclose can shift retroactively when dividends or
 *      splits happen, so fresh wins for shared dates).
 *   2. Recompute the FV-trend signal from the updated CSVs. Fast
 *      (seconds) — just reads the per-symbol back-test CSVs and
 *      regenerates `public/data/fv-trend.json`.
 *   3. Run the existing `npm run refresh` (ingest → tests → commit
 *      → push). The single commit produced by step 3 captures every
 *      changed file from steps 1-3 (snapshot, options summary,
 *      fv-trend.json, …).
 *
 * Use this when you want the back-test data freshened in addition to
 * the daily snapshot. The regular `npm run refresh` skips steps 1-2
 * for daily speed.
 *
 * Usage:
 *   npm run refresh-all
 *   npm run refresh-all -- --skip-tests           # passed through to refresh
 *   npm run refresh-all -- --no-push              # passed through to refresh
 */

import { spawn } from "node:child_process";

/**
 * Run a child process, stream output through to ours, resolve when
 * exit 0. Same shape as scripts/refresh.ts (intentional — keeps the
 * Windows .cmd / DEP0190 workaround in one mental model).
 */
function runStreaming(cmd: string, cmdArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const commandLine = [cmd, ...cmdArgs].join(" ");
    const child = spawn(commandLine, { stdio: "inherit", shell: true });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const passthroughArgs = process.argv.slice(2);
  const startedAt = Date.now();

  console.log("=== refresh-all (1/3): backtest with --merge-cache ===");
  await runStreaming("npm", [
    "run", "backtest", "--",
    "--all-sp500",
    "--years", "8",
    "--accuracy",
    "--horizons", "1,2,3",
    "--merge-cache",
  ]);

  console.log("\n=== refresh-all (2/3): recompute fv-trend ===");
  await runStreaming("npm", ["run", "fv-trend"]);

  console.log("\n=== refresh-all (3/3): standard refresh (ingest + tests + commit) ===");
  // Forward any remaining args (--skip-tests, --no-push, --message …)
  // through to the existing refresh script.
  const refreshArgs = ["run", "refresh"];
  if (passthroughArgs.length > 0) {
    refreshArgs.push("--", ...passthroughArgs);
  }
  await runStreaming("npm", refreshArgs);

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\nrefresh-all done in ${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`);
}

main().catch((err) => {
  console.error("\nfatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
