/**
 * LEAPS-preferred expiration selector per docs/specs/options.md §2.1.
 * Pure function: takes today + a chain's expiration list, returns up to
 * two ISO dates with a label for why each was picked.
 */

export type SelectionReason = "leap" | "leap-fallback" | "quarterly" | "monthly";

export type SelectedExpiration = {
  expiration: string;        // YYYY-MM-DD
  selectionReason: SelectionReason;
};

const FALLBACK_MIN_DAYS = 60;
const QUARTERLY_MONTHS = new Set([3, 6, 9, 12]);

/** YYYY-MM-DD (UTC) regardless of input form (handles Yahoo's `T00:00:00Z`). */
function normalizeIsoDate(input: string): string {
  return input.slice(0, 10);
}

function toUtcDate(iso: string): Date {
  return new Date(`${normalizeIsoDate(iso)}T00:00:00.000Z`);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = toUtcDate(toIso).getTime() - toUtcDate(fromIso).getTime();
  return Math.round(ms / 86_400_000);
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

function isJanuaryLeap(iso: string): boolean {
  return isMonthlyThirdFriday(iso) && toUtcDate(iso).getUTCMonth() === 0;
}

function isQuarterly(iso: string): boolean {
  if (!isMonthlyThirdFriday(iso)) return false;
  const month = toUtcDate(iso).getUTCMonth() + 1;
  return QUARTERLY_MONTHS.has(month);
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

  const yr = toUtcDate(todayIso).getUTCFullYear();
  const targetYears = [yr + 1, yr + 2];
  const januaryLeaps = future.filter(isJanuaryLeap);
  const matchingLeaps = targetYears
    .map((y) => januaryLeaps.find((iso) => toUtcDate(iso).getUTCFullYear() === y))
    .filter((v): v is string => v !== undefined);

  // Branch 1: both target Januaries present.
  if (matchingLeaps.length >= 2) {
    return matchingLeaps
      .slice(0, 2)
      .map((expiration) => ({ expiration, selectionReason: "leap" as const }));
  }

  // Branch 2: exactly one target January LEAPS — pair it with the next
  // non-Jan monthly that's at least FALLBACK_MIN_DAYS out.
  if (matchingLeaps.length === 1) {
    const leap = matchingLeaps[0]!;
    const fallback = future.find(
      (iso) =>
        iso !== leap &&
        isMonthlyThirdFriday(iso) &&
        toUtcDate(iso).getUTCMonth() !== 0 &&
        daysBetween(todayIso, iso) >= FALLBACK_MIN_DAYS,
    );
    const out: SelectedExpiration[] = [{ expiration: leap, selectionReason: "leap" }];
    if (fallback !== undefined) {
      out.push({ expiration: fallback, selectionReason: "leap-fallback" });
    }
    return out;
  }

  // Branch 3: no LEAPS — two next quarterlies.
  const quarterlies = future.filter(isQuarterly);
  if (quarterlies.length >= 2) {
    return quarterlies
      .slice(0, 2)
      .map((expiration) => ({ expiration, selectionReason: "quarterly" as const }));
  }

  // Branch 4: no quarterlies — two next monthlies (any month).
  const monthlies = future.filter(isMonthlyThirdFriday);
  if (monthlies.length >= 2) {
    return monthlies
      .slice(0, 2)
      .map((expiration) => ({ expiration, selectionReason: "monthly" as const }));
  }

  // Branch 5 (and degenerate cases): return whatever the chain has, label
  // each by what it actually is. Up to two entries.
  const labeled = future.slice(0, 2).map((iso): SelectedExpiration => {
    if (isQuarterly(iso)) return { expiration: iso, selectionReason: "quarterly" };
    if (isMonthlyThirdFriday(iso)) return { expiration: iso, selectionReason: "monthly" };
    return { expiration: iso, selectionReason: "monthly" };
  });
  return labeled;
}
