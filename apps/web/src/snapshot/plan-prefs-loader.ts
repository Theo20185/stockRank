/**
 * "Target expiration month" — YYYY-MM (e.g., "2026-07"). Empty string
 * means "no preference; let the screen auto-select the soonest month
 * with candidates." Legacy prefs with `mode: "monthly"` migrate to
 * empty string (auto-select). `mode: "yearly"` migrates to the
 * upcoming January's YYYY-MM (computed at load time).
 */
function isYearMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function upcomingJanuaryYearMonth(now: Date = new Date()): string {
  // If today's month is January, the upcoming Jan is next year.
  // Otherwise it's January of next year too (we're always looking
  // forward). Simpler: always pick (currentYear + 1) January.
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() : now.getUTCFullYear() + 1;
  return `${year}-01`;
}

/**
 * Plan-screen preferences stored in browser localStorage. Mirrors the
 * portfolio-loader pattern — device-local, never leaves the browser,
 * graceful failure when storage is unavailable (private mode / quota).
 *
 * What's saved is the USER'S INPUTS (capital, top-N, mode, exclusions,
 * UI toggles) — not the resolved plan itself. The plan auto-recomputes
 * from the current options data when the screen mounts. Re-running an
 * ingest changes the strikes/premiums but the user's plan inputs
 * remain valid.
 */

export const PLAN_PREFS_STORAGE_KEY = "stockrank.plan-prefs";

export type PlanPrefs = {
  capital: string;
  topN: string;
  /**
   * Target expiration month as YYYY-MM. Empty string means
   * "auto-select the soonest month with candidates." Replaces the
   * earlier `mode: monthly|yearly` toggle (2026-06-04).
   */
  selectedMonth: string;
  hideUnallocated: boolean;
  excludedSymbols: string[];
  /** Last time the prefs were written. ISO timestamp. */
  savedAt: string;
};

export const DEFAULT_PLAN_PREFS: PlanPrefs = {
  capital: "10000",
  topN: "",
  selectedMonth: "",
  hideUnallocated: false,
  excludedSymbols: [],
  savedAt: "",
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Strict but tolerant parser: unknown fields are ignored, missing
 * fields fall back to defaults. Anything wonky returns DEFAULT_PLAN_PREFS
 * so the UI can't get wedged by a corrupt key.
 */
function migrate(raw: unknown): PlanPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PLAN_PREFS;
  const obj = raw as Record<string, unknown>;
  // Determine selectedMonth: prefer the new field, else migrate from
  // the legacy `mode` field. "monthly" → empty (auto), "yearly" →
  // upcoming January's YYYY-MM. Anything else → empty.
  let selectedMonth: string;
  if (isYearMonth(obj.selectedMonth)) {
    selectedMonth = obj.selectedMonth;
  } else if (obj.mode === "yearly") {
    selectedMonth = upcomingJanuaryYearMonth();
  } else {
    selectedMonth = "";
  }
  const excludedSymbols = Array.isArray(obj.excludedSymbols)
    ? obj.excludedSymbols.filter((s): s is string => typeof s === "string")
    : [];
  return {
    capital: typeof obj.capital === "string" ? obj.capital : DEFAULT_PLAN_PREFS.capital,
    topN: typeof obj.topN === "string" ? obj.topN : DEFAULT_PLAN_PREFS.topN,
    selectedMonth,
    hideUnallocated: typeof obj.hideUnallocated === "boolean" ? obj.hideUnallocated : false,
    excludedSymbols,
    savedAt: typeof obj.savedAt === "string" ? obj.savedAt : "",
  };
}

export function loadPlanPrefs(
  storage: StorageLike | null = defaultStorage(),
): PlanPrefs {
  if (!storage) return DEFAULT_PLAN_PREFS;
  try {
    const raw = storage.getItem(PLAN_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_PLAN_PREFS;
    return migrate(JSON.parse(raw));
  } catch {
    return DEFAULT_PLAN_PREFS;
  }
}

export function savePlanPrefs(
  prefs: PlanPrefs,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PLAN_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage may be disabled (private mode / quota); fail silent.
  }
}
