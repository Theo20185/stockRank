#!/usr/bin/env tsx
/**
 * One-shot data refresh + deploy:
 *   1. Run the nightly ingest (Yahoo fundamentals + options for the
 *      Ranked bucket + options-summary roll-up).
 *   2. Run the test suite.
 *   3. Stage everything; if there's anything to commit, compose an
 *      auto-generated chore(snapshot) message including bucket counts +
 *      options stats parsed from the ingest output.
 *   4. Push to origin so GitHub Actions deploys the new snapshot to Pages.
 *
 * Skips the commit/push when nothing changed (so you can run it as a
 * sanity refresh without polluting history).
 *
 * Usage:
 *   npm run refresh
 *   npm run refresh -- --skip-tests          # faster iteration
 *   npm run refresh -- --no-push             # local-only commit
 *   npm run refresh -- --message "Custom"    # override the auto message
 */

import { spawn } from "node:child_process";
import { execSync } from "node:child_process";

type Args = {
  skipTests: boolean;
  push: boolean;
  customMessage: string | null;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { skipTests: false, push: true, customMessage: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--skip-tests") out.skipTests = true;
    else if (a === "--no-push") out.push = false;
    else if (a === "--message") {
      if (!next) throw new Error("--message requires a value");
      out.customMessage = next;
      i += 1;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return out;
}

/**
 * Run a child process, stream stdout/stderr through to ours, capture
 * combined output for later parsing, and resolve when it exits 0.
 * Rejects on non-zero exit.
 *
 * Implementation note — DEP0190: passing an args array alongside
 * `shell: true` is deprecated because Node concatenates args without
 * shell-escaping them. We need `shell: true` on Windows so spawn can
 * find npm.cmd / npx.cmd via PATHEXT (Node's CVE-2024-27980 mitigation
 * blocks spawning .cmd/.bat without a shell). Workaround: concatenate
 * everything into a single command-line string ourselves. All callers
 * pass hardcoded args (no user input), so there's no injection surface.
 */
function runStreaming(cmd: string, cmdArgs: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const commandLine = [cmd, ...cmdArgs].join(" ");
    const child = spawn(commandLine, { stdio: ["inherit", "pipe", "pipe"], shell: true });
    let combined = "";
    child.stdout?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      combined += s;
      process.stdout.write(s);
    });
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString("utf8");
      combined += s;
      process.stderr.write(s);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(combined);
      else reject(new Error(`${cmd} exited ${code}`));
    });
    child.on("error", reject);
  });
}

function gitOutput(args: string[]): string {
  return execSync(`git ${args.join(" ")}`, { encoding: "utf8" }).trim();
}

type Stats = {
  date: string | null;
  companies: number | null;
  errors: number | null;
  ranked: number | null;
  watch: number | null;
  excluded: number | null;
  optionsOk: number | null;
  optionsSkipped: number | null;
  optionsFailed: number | null;
};

function parseStats(log: string): Stats {
  const stats: Stats = {
    date: null, companies: null, errors: null,
    ranked: null, watch: null, excluded: null,
    optionsOk: null, optionsSkipped: null, optionsFailed: null,
  };
  const dateMatch = log.match(/snapshot (\d{4}-\d{2}-\d{2})/);
  if (dateMatch) stats.date = dateMatch[1]!;
  const doneMatch = log.match(/done — (\d+) companies, (\d+) errors/);
  if (doneMatch) {
    stats.companies = parseInt(doneMatch[1]!, 10);
    stats.errors = parseInt(doneMatch[2]!, 10);
  }
  const buckets = log.match(/buckets: ranked=(\d+) watch=(\d+) excluded=(\d+)/);
  if (buckets) {
    stats.ranked = parseInt(buckets[1]!, 10);
    stats.watch = parseInt(buckets[2]!, 10);
    stats.excluded = parseInt(buckets[3]!, 10);
  }
  const optionsDone = log.match(/options done — (\d+) ok, (\d+) skipped, (\d+) failed/);
  if (optionsDone) {
    stats.optionsOk = parseInt(optionsDone[1]!, 10);
    stats.optionsSkipped = parseInt(optionsDone[2]!, 10);
    stats.optionsFailed = parseInt(optionsDone[3]!, 10);
  }
  return stats;
}

function composeCommitMessage(stats: Stats): string {
  const lines: string[] = [];
  lines.push(`chore(snapshot): refresh ${stats.date ?? new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  if (stats.companies !== null) {
    lines.push(`Snapshot: ${stats.companies} companies, ${stats.errors ?? 0} errors`);
  }
  if (stats.ranked !== null) {
    lines.push(`Buckets: ${stats.ranked} ranked / ${stats.watch} watch / ${stats.excluded} excluded`);
  }
  if (stats.optionsOk !== null) {
    lines.push(`Options: ${stats.optionsOk} ok, ${stats.optionsSkipped} skipped, ${stats.optionsFailed} failed`);
  }
  lines.push("");
  lines.push("Auto-generated by scripts/refresh.ts.");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();

  console.log("=== refresh: ingest ===");
  const ingestLog = await runStreaming("npm", ["run", "ingest"]);

  if (!args.skipTests) {
    console.log("\n=== refresh: tests ===");
    await runStreaming("npx", ["vitest", "run"]);
  } else {
    console.log("\n(skipped tests per --skip-tests)");
  }

  console.log("\n=== refresh: git ===");
  const status = gitOutput(["status", "--porcelain"]);
  if (!status) {
    console.log("nothing changed; skipping commit/push");
    return;
  }
  console.log(status);

  execSync("git add -A", { stdio: "inherit" });

  const stats = parseStats(ingestLog);
  const message = args.customMessage ?? composeCommitMessage(stats);
  console.log("\ncommit message:\n" + message);

  // Pass via stdin to avoid quoting issues across shells.
  execSync(`git commit -F -`, { input: message, stdio: ["pipe", "inherit", "inherit"] });

  if (args.push) {
    console.log("\npushing to origin...");
    execSync("git push", { stdio: "inherit" });
    console.log("\npushed; GitHub Actions will deploy to Pages within ~1 minute");
    console.log("see: https://github.com/Theo20185/stockRank/actions");
  } else {
    console.log("\n(skipped push per --no-push)");
  }

  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\ndone in ${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`);
}

main().catch((err) => {
  console.error("\nfatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
