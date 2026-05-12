import type { SelectionReason } from "@stockrank/ranking";

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
  mode: SelectionReason;
  hideUnallocated: boolean;
  excludedSymbols: string[];
  /** Last time the prefs were written. ISO timestamp. */
  savedAt: string;
};

export const DEFAULT_PLAN_PREFS: PlanPrefs = {
  capital: "10000",
  topN: "",
  mode: "monthly",
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
  const mode = obj.mode;
  const validMode: SelectionReason =
    mode === "weekly" || mode === "monthly" || mode === "yearly"
      ? mode
      : DEFAULT_PLAN_PREFS.mode;
  const excludedSymbols = Array.isArray(obj.excludedSymbols)
    ? obj.excludedSymbols.filter((s): s is string => typeof s === "string")
    : [];
  return {
    capital: typeof obj.capital === "string" ? obj.capital : DEFAULT_PLAN_PREFS.capital,
    topN: typeof obj.topN === "string" ? obj.topN : DEFAULT_PLAN_PREFS.topN,
    mode: validMode,
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
