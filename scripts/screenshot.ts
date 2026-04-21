#!/usr/bin/env tsx
/**
 * Headless Chromium screenshot helper for ad-hoc UI inspection. Drops a
 * PNG (and optionally a small JSON sidecar with page metadata) under
 * `tmp/screenshots/` so the agent can Read it back via image support.
 *
 * Usage:
 *   npx tsx scripts/screenshot.ts <url> [options]
 *
 * Options:
 *   --out <path>         output PNG path (default: tmp/screenshots/<slug>-<viewport>.png)
 *   --viewport <preset>  desktop | tablet | mobile (default: desktop)
 *   --width <n>          custom viewport width (overrides preset)
 *   --height <n>         custom viewport height (overrides preset)
 *   --wait <selector>    wait for selector before capturing (default: body)
 *   --wait-ms <n>        extra wait after selector resolves (default: 1500)
 *   --click <selector>   click a selector before capturing
 *   --hash <route>       append hash route (e.g. "stock/DECK") after navigation
 *   --full-page          capture the full scrollable page (default: viewport only)
 *   --dark               emulate dark color scheme
 *
 * Examples:
 *   npx tsx scripts/screenshot.ts https://theo20185.github.io/stockRank/
 *   npx tsx scripts/screenshot.ts https://theo20185.github.io/stockRank/ --hash stock/GDDY --viewport mobile
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "playwright";

type ViewportPreset = "desktop" | "tablet" | "mobile";

const VIEWPORTS: Record<ViewportPreset, { width: number; height: number }> = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

type Args = {
  url: string;
  out: string | null;
  viewport: ViewportPreset;
  width: number | null;
  height: number | null;
  wait: string;
  waitMs: number;
  click: string | null;
  hash: string | null;
  fullPage: boolean;
  dark: boolean;
};

function parseArgs(argv: string[]): Args {
  if (argv.length === 0) {
    console.error("usage: screenshot <url> [options]");
    process.exit(1);
  }
  const args: Args = {
    url: argv[0]!,
    out: null,
    viewport: "desktop",
    width: null,
    height: null,
    wait: "body",
    waitMs: 1500,
    click: null,
    hash: null,
    fullPage: false,
    dark: false,
  };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === "--out") { args.out = resolve(next!); i += 1; }
    else if (a === "--viewport") {
      if (next !== "desktop" && next !== "tablet" && next !== "mobile") {
        throw new Error(`--viewport must be desktop|tablet|mobile`);
      }
      args.viewport = next; i += 1;
    }
    else if (a === "--width") { args.width = parseInt(next!, 10); i += 1; }
    else if (a === "--height") { args.height = parseInt(next!, 10); i += 1; }
    else if (a === "--wait") { args.wait = next!; i += 1; }
    else if (a === "--wait-ms") { args.waitMs = parseInt(next!, 10); i += 1; }
    else if (a === "--click") { args.click = next!; i += 1; }
    else if (a === "--hash") { args.hash = next!.startsWith("#") ? next!.slice(1) : next!; i += 1; }
    else if (a === "--full-page") { args.fullPage = true; }
    else if (a === "--dark") { args.dark = true; }
    else if (a.startsWith("--")) throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

function defaultOutPath(args: Args): string {
  const slug = args.url
    .replace(/^https?:\/\//, "")
    .replace(/[/?&=#]+/g, "_")
    .replace(/_+$/, "")
    .slice(0, 60);
  const hashSlug = args.hash ? `_${args.hash.replace(/\//g, "_")}` : "";
  const viewportSlug = args.width && args.height
    ? `${args.width}x${args.height}`
    : args.viewport;
  return resolve(`tmp/screenshots/${slug}${hashSlug}_${viewportSlug}.png`);
}

async function capture(page: Page, args: Args): Promise<string> {
  const target = args.hash ? `${args.url}#/${args.hash}` : args.url;
  console.log(`navigating: ${target}`);
  await page.goto(target, { waitUntil: "networkidle" });

  if (args.wait) {
    console.log(`waiting for: ${args.wait}`);
    await page.waitForSelector(args.wait, { timeout: 15_000 });
  }
  if (args.click) {
    console.log(`clicking: ${args.click}`);
    await page.click(args.click);
  }
  if (args.waitMs > 0) {
    await page.waitForTimeout(args.waitMs);
  }

  const out = args.out ?? defaultOutPath(args);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: args.fullPage });
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const viewport = args.width && args.height
    ? { width: args.width, height: args.height }
    : VIEWPORTS[args.viewport];

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport,
      colorScheme: args.dark ? "dark" : "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error(`page error: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") console.error(`console.${msg.type()}: ${msg.text()}`);
    });

    const out = await capture(page, args);
    const title = await page.title();
    console.log(`title: ${title}`);
    console.log(`saved: ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
