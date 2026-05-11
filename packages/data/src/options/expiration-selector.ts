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
 * "3rd-week expiration": day-of-month in [15, 21]. The standard monthly
 * contract is the Friday in this window; for symbols whose chain only
 * lists the monthly (no weeklies) Yahoo sometimes labels the contract
 * on an adjacent weekday (e.g. EIX 2026-06-18 Thursday — the OCC symbol
 * literally reads `EIX260618`). The day window is the stable definition;
 * weekday is used as a tiebreaker, not a hard filter.
 */
export function isMonthlyThirdFriday(iso: string): boolean {
  const d = toUtcDate(iso);
  const day = d.getUTCDate();
  return day >= 15 && day <= 21;
}

function isFriday(iso: string): boolean {
  return toUtcDate(iso).getUTCDay() === 5;
}

function isJanuary(iso: string): boolean {
  return toUtcDate(iso).getUTCMonth() === 0;
}

function yearMonth(iso: string): number {
  const d = toUtcDate(iso);
  // Single comparable integer: e.g. 2026-06 → 24318.
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/**
 * Pick the next monthly-cycle expiration strictly after `afterIso`.
 *
 * Rules:
 *   1. Candidates have day-of-month in [15, 21] and (optionally) lie in
 *      January for the yearly slot.
 *   2. Group candidates by calendar month and take the earliest month.
 *   3. Within that earliest month, prefer the Friday entry (the standard
 *      OCC monthly contract). If no Friday is listed for that month,
 *      fall back to the latest listed day in the window — for symbols
 *      whose chain only lists one expiration per month, this is whatever
 *      Yahoo labelled it (May 15 Friday, Jun 18 Thursday for EIX, etc).
 */
function pickMonthlyExpiration(
  futureSorted: string[],
  afterIso: string,
  options: { januaryOnly?: boolean } = {},
): string | undefined {
  const januaryOnly = options.januaryOnly ?? false;
  const candidates = futureSorted.filter((iso) => {
    if (iso <= afterIso) return false;
    if (!isMonthlyThirdFriday(iso)) return false;
    if (januaryOnly && !isJanuary(iso)) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;

  const earliestMonth = yearMonth(candidates[0]!);
  const inEarliest = candidates.filter((iso) => yearMonth(iso) === earliestMonth);
  const friday = inEarliest.find(isFriday);
  if (friday !== undefined) return friday;
  // No Friday listed for this month — pick the latest day in the [15,21]
  // window so we land as close to the standard 3rd-Friday slot as possible.
  return inEarliest[inEarliest.length - 1];
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

  // Monthly = next month's 3rd-week expiration strictly after weekly.
  const monthly = pickMonthlyExpiration(future, weekly);

  // Yearly = next January 3rd-week expiration strictly after monthly
  // (or after weekly when monthly isn't available).
  const yearlyFloor = monthly ?? weekly;
  const yearly = pickMonthlyExpiration(future, yearlyFloor, { januaryOnly: true });

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
