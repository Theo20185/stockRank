#!/usr/bin/env tsx
/**
 * Dump the full list of EIX option expirations from Yahoo so we can
 * see whether the user's "June 19 should be there" expectation is
 * supported by what the API actually returns, or whether Yahoo only
 * lists a sparse set of expirations for this symbol.
 *
 * Run: `npx tsx scripts/probe-eix-options.ts`
 */
import YahooFinance from "yahoo-finance2";

async function main(): Promise<void> {
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  const symbol = process.argv[2] ?? "EIX";
  console.log(`probing ${symbol}…`);
  const raw = (await yf.options(symbol)) as {
    expirationDates?: Array<Date | string>;
    quote?: { regularMarketPrice?: number | null };
  };
  const dates = raw.expirationDates ?? [];
  console.log(`spot: $${raw.quote?.regularMarketPrice}`);
  console.log(`${dates.length} expirations returned (raw):`);
  for (const d of dates) {
    if (d instanceof Date) {
      const ts = d.getTime();
      const iso = d.toISOString();
      const utcWeekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
      console.log(`  raw=${iso}  ts=${ts}  utc-day=${utcWeekday}`);
    } else {
      console.log(`  raw="${d}" (string)`);
    }
  }

  // Fetch the suspicious June group and inspect contractSymbol's embedded YYMMDD.
  console.log("\nfetching the June group to inspect contractSymbol YYMMDD…");
  const juneDate = (dates[1] as Date);
  const group = (await yf.options(symbol, { date: juneDate })) as {
    options?: Array<{ expirationDate?: Date | string; calls?: Array<{ contractSymbol?: string }> }>;
  };
  const block = group.options?.[0];
  const sample = block?.calls?.[0]?.contractSymbol ?? "(no calls)";
  const blockDate = block?.expirationDate;
  const blockIso = blockDate instanceof Date ? blockDate.toISOString() : String(blockDate);
  console.log(`  block.expirationDate = ${blockIso}`);
  console.log(`  sample contractSymbol = ${sample}`);
  // OCC symbol format: SYMBOL + YYMMDD + C/P + strike*1000 (8 digits)
  const m = sample.match(/^[A-Z.]+(\d{6})[CP]\d{8}$/);
  if (m) {
    const ymd = m[1]!;
    console.log(`  → embedded expiry: 20${ymd.slice(0, 2)}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
