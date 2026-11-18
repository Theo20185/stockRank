/**
 * Premarket fail-fast guard for the refresh pipeline
 * (engine-gaps-2026-09-21.md §4; shipped after the second burned
 * morning, 2026-11-18).
 *
 * Yahoo serves STUB option chains during the US premarket session
 * (04:00–09:30 ET on trading weekdays): observed 2026-11-18 as 13
 * expirations with exactly one contract each and null bids, where
 * the same symbol's market-hours chain has 3 real expirations. A
 * refresh started in that window burns ~30 minutes of ingest, writes
 * poisoned options files, and then fails its own test stage on the
 * capital-plan integration test.
 *
 * Overnight and weekend runs are fine — Yahoo serves the previous
 * close's chains outside the premarket session (the 2026-11-16
 * Sunday refresh was clean) — so the guard only refuses weekday
 * 04:00–09:29 ET starts. Holidays are not special-cased (rare; the
 * --allow-premarket override covers them).
 */

export type MarketSession = {
  premarket: boolean;
  /** Human-readable ET timestamp for the abort message. */
  detail: string;
};

export function classifyMarketSession(now: Date): MarketSession {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  // Intl with hour12:false can render midnight as "24" on some ICU
  // versions — normalize so the window math stays correct.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const minutes = hour * 60 + minute;
  const inPremarketWindow = minutes >= 4 * 60 && minutes < 9 * 60 + 30;

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return {
    premarket: isWeekday && inPremarketWindow,
    detail: `${weekday} ${hh}:${mm} ET (US market opens 09:30 ET)`,
  };
}
