// One-shot utility: refresh sp500.json from Wikipedia.
//
// Run with:  npx tsx packages/data/src/universe/refresh-cli.ts
//
// Writes to packages/data/src/universe/sp500.json. Compares against the
// current committed list and prints a diff summary so the operator can
// review before committing the result.

import { writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSp500FromWikipedia } from "./wikipedia.js";

const TARGET = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./sp500.json",
);

async function main(): Promise<void> {
  console.log("Fetching S&P 500 list from Wikipedia...");
  const fresh = await fetchSp500FromWikipedia();
  console.log(`Parsed ${fresh.length} constituents.`);

  let prior: { symbol: string; name: string }[] = [];
  try {
    prior = JSON.parse(await readFile(TARGET, "utf8")) as typeof prior;
  } catch {
    // First run — no prior file
  }

  const priorSet = new Set(prior.map((e) => e.symbol));
  const freshSet = new Set(fresh.map((e) => e.symbol));
  const added = fresh.filter((e) => !priorSet.has(e.symbol));
  const removed = prior.filter((e) => !freshSet.has(e.symbol));

  console.log(`prior: ${prior.length}  fresh: ${fresh.length}`);
  console.log(`added: ${added.length}  removed: ${removed.length}`);
  if (added.length > 0) console.log("  +", added.map((e) => e.symbol).join(", "));
  if (removed.length > 0) console.log("  -", removed.map((e) => e.symbol).join(", "));

  await writeFile(TARGET, JSON.stringify(fresh, null, 2) + "\n", "utf8");
  console.log(`Wrote ${TARGET}`);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
