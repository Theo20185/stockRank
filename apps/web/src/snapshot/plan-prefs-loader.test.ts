import { describe, it, expect } from "vitest";
import {
  DEFAULT_PLAN_PREFS,
  PLAN_PREFS_STORAGE_KEY,
  loadPlanPrefs,
  savePlanPrefs,
  type PlanPrefs,
} from "./plan-prefs-loader.js";

function makeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe("plan-prefs-loader", () => {
  it("returns defaults when storage is empty", () => {
    expect(loadPlanPrefs(makeStorage())).toEqual(DEFAULT_PLAN_PREFS);
  });

  it("round-trips a full prefs object", () => {
    const storage = makeStorage();
    const prefs: PlanPrefs = {
      capital: "75000",
      topN: "10",
      mode: "yearly",
      hideUnallocated: true,
      excludedSymbols: ["AES", "GM"],
      savedAt: "2026-05-12T12:00:00.000Z",
    };
    savePlanPrefs(prefs, storage);
    expect(loadPlanPrefs(storage)).toEqual(prefs);
  });

  it("ignores corrupt JSON in the storage slot", () => {
    const storage = makeStorage();
    storage.setItem(PLAN_PREFS_STORAGE_KEY, "{not json");
    expect(loadPlanPrefs(storage)).toEqual(DEFAULT_PLAN_PREFS);
  });

  it("backfills missing fields from defaults", () => {
    const storage = makeStorage();
    storage.setItem(PLAN_PREFS_STORAGE_KEY, JSON.stringify({ capital: "5000" }));
    const got = loadPlanPrefs(storage);
    expect(got.capital).toBe("5000");
    expect(got.topN).toBe(DEFAULT_PLAN_PREFS.topN);
    expect(got.mode).toBe(DEFAULT_PLAN_PREFS.mode);
    expect(got.hideUnallocated).toBe(DEFAULT_PLAN_PREFS.hideUnallocated);
    expect(got.excludedSymbols).toEqual([]);
  });

  it("drops non-string entries from excludedSymbols", () => {
    const storage = makeStorage();
    storage.setItem(
      PLAN_PREFS_STORAGE_KEY,
      JSON.stringify({ excludedSymbols: ["AES", 42, null, "GM"] }),
    );
    expect(loadPlanPrefs(storage).excludedSymbols).toEqual(["AES", "GM"]);
  });

  it("rejects an unknown mode string and falls back to default", () => {
    const storage = makeStorage();
    storage.setItem(
      PLAN_PREFS_STORAGE_KEY,
      JSON.stringify({ mode: "biweekly" }),
    );
    expect(loadPlanPrefs(storage).mode).toBe(DEFAULT_PLAN_PREFS.mode);
  });

  it("returns defaults when storage is null (SSR / disabled)", () => {
    expect(loadPlanPrefs(null)).toEqual(DEFAULT_PLAN_PREFS);
  });

  it("is a no-op when saving to null storage", () => {
    expect(() => savePlanPrefs(DEFAULT_PLAN_PREFS, null)).not.toThrow();
  });
});
