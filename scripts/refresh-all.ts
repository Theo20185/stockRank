#!/usr/bin/env tsx
/**
 * Deeper refresh, on top of `npm run refresh`. Runs the back-test
 * accuracy harness first (engine validation), then the standard
 * refresh.
 *
 * Two phases:
 *
 *   1. Re-pull the back-test cache via `--merge-cache` and re-score
 *      every symbol over the past 8y. This validates that the engine
 *      still projects accurately at past dates. The accuracy CSV
 *      (per-symbol, per-horizon hit rates) is the artifact to look at.
 *      Yahoo's fundamentalsTimeSeries is internally capped at ~5y of
 *      annual data, so merge mode keeps anything we previously cached
 *      that has since aged out of Yahoo's rolling window.
 *
 *   2. Run the standard `npm run refresh` (ingest → fv-trend → tests
 *      → build → commit → push). The single commit produced by step 2
 *      captures every changed file from steps 1-2.
 *
 * Note: the FV-trend signal that drives the stock-detail sparkline is
 * built by `npm run fv-trend` directly off the dated snapshot
 * archive, NOT off the back-test CSVs. So step 1 is purely about
 * engine validation now — daily refreshes don't need it.
 *
 * Usage:
 *   npm run refresh-all
 *   npm run refresh-all -- --skip-tests           # passed through to refresh
 *   npm run refresh-all -- --no-push              # passed through to refresh
 */

import { spawn } from "node:child_process";

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

  console.log("=== refresh-all (1/2): backtest with --merge-cache (engine validation) ===");
  await runStreaming("npm", [
    "run", "backtest", "--",
    "--all-sp500",
    "--years", "8",
    "--accuracy",
    "--horizons", "1,2,3",
    "--merge-cache",
  ]);

  console.log("\n=== refresh-all (2/2): standard refresh (ingest + fv-trend + tests + commit) ===");
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
