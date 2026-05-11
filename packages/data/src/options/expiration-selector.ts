/**
 * Three-expiration selector per docs/specs/options.md §2.1. Pure function:
 * takes today + a chain's expiration list, returns up to three ISO dates
 * with a label for each.
 *
 * Selection rule (updated 2026-05-11):
 *   1. Weekly  — soonest future expiration (any type).
 *   2. Monthly — soonest future third-Friday Friday (the standard
 *      monthly expiration).
 *   3. Yearly  — soonest future January third-Friday Friday. If the
 *      next monthly IS the next January third-Friday, the yearly slot
 *      advances to the January after that (so monthly and yearly are
 *      never the same date).
 *
 * The result is deduped by expiration date. If two slots resolve to the
 * same date the latter is dropped. The chain may not provide enough
 * dates for all three slots — the selector returns whatever it can.
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
  const monthly = future.find(isMonthlyThirdFriday);
  const januaryMonthlies = future.filter(isJanuaryMonthly);

  // If the next monthly IS the next January monthly, advance yearly to
  // the January after that so the two slots are distinct.
  let yearly: string | undefined;
  if (monthly !== undefined && januaryMonthlies[0] === monthly) {
    yearly = januaryMonthlies[1];
  } else {
    yearly = januaryMonthlies[0];
  }

  const out: SelectedExpiration[] = [];
  const seen = new Set<string>();
  const push = (expiration: string | undefined, reason: SelectionReason): void => {
    if (expiration === undefined || seen.has(expiration)) return;
    out.push({ expiration, selectionReason: reason });
    seen.add(expiration);
  };
  push(weekly, "weekly");
  push(monthly, "monthly");
  push(yearly, "yearly");
  return out;
}
