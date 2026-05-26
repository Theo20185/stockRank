/**
 * Expiration selector per docs/specs/options.md §2.
 *
 * Selection rule (updated 2026-05-26, weekly removed):
 *   1. **Monthlies** — every future third-week expiration (day-of-month
 *      in [15, 21], weekday is a tiebreaker per §2.3) between today and
 *      the yearly slot. Each emits `selectionReason: "monthly"`.
 *   2. **Yearly** — the soonest future January third-week expiration
 *      strictly after the latest monthly. When the soonest 3rd-week
 *      IS the next January, the yearly slot cascades forward to the
 *      following January so the slots stay distinct. Emits
 *      `selectionReason: "yearly"`.
 *
 * The Plan-screen UI shows just two tabs (monthly + yearly); the
 * portfolio screen uses the widened monthly set to look up bid/ask
 * for any held contract between today and the yearly horizon.
 *
 * The legacy "weekly" slot was removed because the user only writes
 * monthly+ horizons. If a chain has no 3rd-week monthlies before
 * yearly (e.g., illiquid name with only the yearly listed), the
 * selector returns just the yearly entry. If the chain has no Jan
 * 3rd-week at all, yearly is omitted.
 */

export type SelectionReason = "monthly" | "yearly";

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
 * Pick one 3rd-week expiration per calendar month from the candidates.
 * Within a month, prefer Friday; fall back to the latest day in [15,21].
 * Returns sorted ascending. Input must be future-only and pre-filtered
 * to 3rd-week dates.
 */
function pickOnePerMonth(thirdWeekDates: string[]): string[] {
  const byMonth = new Map<number, string[]>();
  for (const iso of thirdWeekDates) {
    const ym = yearMonth(iso);
    const arr = byMonth.get(ym) ?? [];
    arr.push(iso);
    byMonth.set(ym, arr);
  }
  const out: string[] = [];
  for (const [, group] of [...byMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const friday = group.find(isFriday);
    if (friday !== undefined) {
      out.push(friday);
    } else {
      // Latest day in the window — closest to the standard Friday slot.
      out.push(group.sort()[group.length - 1]!);
    }
  }
  return out;
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

  // Step 1: keep only 3rd-week expirations, one per month (Friday
  // preferred, else latest day in [15,21]).
  const thirdWeekFuture = future.filter(isMonthlyThirdFriday);
  if (thirdWeekFuture.length === 0) return [];
  const monthlies = pickOnePerMonth(thirdWeekFuture);

  // Step 2: pick the yearly Jan slot.
  //   - Default: yearly = soonest Jan 3rd-week in the chain.
  //   - Cascade: if the soonest Jan is within ~60 days of today AND a
  //     later Jan exists, cascade forward so "yearly" actually
  //     represents a ~1-year horizon (not a near-term contract that
  //     just happens to be in January). This is the "depending on the
  //     cascade" branch the user described.
  const CASCADE_PROXIMITY_DAYS = 60;
  const januaryCandidates = monthlies.filter(isJanuary);
  let yearly: string | null = null;
  let yearlyIndex = -1;
  if (januaryCandidates.length > 0) {
    const soonestJan = januaryCandidates[0]!;
    const daysToSoonestJan = Math.round(
      (toUtcDate(soonestJan).getTime() - toUtcDate(todayIso).getTime()) /
        86_400_000,
    );
    const laterJan = januaryCandidates[1];
    if (daysToSoonestJan < CASCADE_PROXIMITY_DAYS && laterJan !== undefined) {
      yearly = laterJan;
    } else {
      yearly = soonestJan;
    }
    yearlyIndex = monthlies.indexOf(yearly);
  }

  // Step 3: assemble output. Entries before the yearly index are
  // monthlies; the yearly entry (if any) is the last item. Entries
  // *after* the yearly date are dropped — the spec says "up to the
  // yearly slot."
  const out: SelectedExpiration[] = [];
  const lastMonthlyIndex = yearly === null ? monthlies.length - 1 : yearlyIndex - 1;
  for (let i = 0; i <= lastMonthlyIndex; i += 1) {
    out.push({ expiration: monthlies[i]!, selectionReason: "monthly" });
  }
  if (yearly !== null) {
    out.push({ expiration: yearly, selectionReason: "yearly" });
  }
  return out;
}
