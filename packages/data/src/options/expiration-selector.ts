/**
 * Three-expiration selector per docs/specs/options.md §2.1. Pure function:
 * takes today + a chain's expiration list, returns up to three ISO dates
 * with a label for each.
 *
 * Selection rule (updated 2026-05-11, cascade revision):
 *   1. Weekly  — soonest future expiration (any type).
 *   2. Monthly — soonest future third-Friday Friday that is strictly
 *      later than the weekly slot. When the next 3rd-Friday is the same
 *      date as weekly, the monthly slot cascades to the third-Friday
 *      after that (so the user always gets three distinct expirations
 *      when the chain has them).
 *   3. Yearly  — soonest future January third-Friday Friday that is
 *      strictly later than the monthly slot. Same cascade rule applies.
 *
 * The chain may not provide enough dates for all three slots — the
 * selector returns whatever it can.
 */

export type SelectionReason = "weekly" | "monthly" | "yearly";

export type SelectedExpiration = {
  expiration: string; // YYYY-MM-DD
  selectionReason: SelectionReason;
};

/** YYYY-MM-DD (UTC) regardless of input form (handles Yahoo's `T00:00:00Z`). */
function normalizeIsoDate(input: string): string {
  return input.slice(0, 10);
}

function toUtcDate(iso: string): Date {
  return new Date(`${normalizeIsoDate(iso)}T00:00:00.000Z`);
}

/**
 * Monthly third-Friday: day-of-month in [15, 21] AND weekday is Friday.
 * Yahoo expirations land on these for monthlies and quarterlies; weeklies
 * fall outside the day window.
 */
export function isMonthlyThirdFriday(iso: string): boolean {
  const d = toUtcDate(iso);
  const day = d.getUTCDate();
  if (day < 15 || day > 21) return false;
  return d.getUTCDay() === 5;
}

function isJanuaryMonthly(iso: string): boolean {
  return isMonthlyThirdFriday(iso) && toUtcDate(iso).getUTCMonth() === 0;
}

export function selectExpirations(
  today: string,
  rawExpirations: string[],
): SelectedExpiration[] {
  const todayIso = normalizeIsoDate(today);
  // Future-only, normalized, sorted ascending, deduped.
  const future = Array.from(new Set(rawExpirations.map(normalizeIsoDate)))
    .filter((iso) => iso > todayIso)
    .sort();

  if (future.length === 0) return [];

  const weekly = future[0];

  // Monthly = first 3rd-Friday Friday strictly AFTER weekly. The cascade
  // ensures the user gets three distinct expirations even when the
  // soonest expiration is itself a 3rd-Friday (which would otherwise
  // collapse weekly and monthly to the same date).
  const monthly = future.find(
    (iso) => isMonthlyThirdFriday(iso) && iso > weekly,
  );

  // Yearly = first Jan 3rd-Friday strictly AFTER monthly (or AFTER weekly
  // when no monthly is available). Same cascade rule.
  const yearlyFloor = monthly ?? weekly;
  const yearly = future.find(
    (iso) => isJanuaryMonthly(iso) && iso > yearlyFloor,
  );

  const out: SelectedExpiration[] = [];
  out.push({ expiration: weekly, selectionReason: "weekly" });
  if (monthly !== undefined) {
    out.push({ expiration: monthly, selectionReason: "monthly" });
  }
  if (yearly !== undefined) {
    out.push({ expiration: yearly, selectionReason: "yearly" });
  }
  return out;
}
