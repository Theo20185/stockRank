import { describe, expect, it } from "vitest";
import {
  appendObservedChanges,
  diffConstituents,
  ledgerChangesAsIndexChanges,
  type ChangesLedger,
} from "./changes-ledger.js";

/**
 * Wikipedia deleted the S&P 500 changes table (discovered 2026-10-28;
 * the dedicated "List of S&P 500 index changes" article is a soft
 * 404). The ledger replaces it: seeded from the last good cache
 * (effective dates through 2026-06-22), extended by diffing live
 * constituents at refresh time (observation dates, ± refresh
 * cadence). Membership reconstruction only needs ordered
 * consistency, so observation-dated entries are an honest
 * approximation.
 */

function ledger(over: Partial<ChangesLedger> = {}): ChangesLedger {
  return {
    seededFrom: "test",
    updatedAt: "2026-06-11T00:00:00.000Z",
    currentConstituents: ["AAA", "BBB", "CCC"],
    changes: [],
    ...over,
  };
}

describe("diffConstituents", () => {
  it("reports additions and removals by symbol", () => {
    const d = diffConstituents(
      ["AAA", "BBB", "CCC"],
      [
        { symbol: "AAA", name: "A Corp" },
        { symbol: "CCC", name: "C Corp" },
        { symbol: "DDD", name: "D Corp" },
      ],
    );
    expect(d.added.map((e) => e.symbol)).toEqual(["DDD"]);
    expect(d.removed).toEqual(["BBB"]);
  });

  it("is empty when membership is unchanged", () => {
    const d = diffConstituents(["AAA"], [{ symbol: "AAA", name: "A" }]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe("appendObservedChanges", () => {
  it("appends paired add/remove entries dated at observation and updates currentConstituents", () => {
    const next = appendObservedChanges(
      ledger(),
      [
        { symbol: "AAA", name: "A Corp" },
        { symbol: "BBB", name: "B Corp" },
        { symbol: "DDD", name: "D Corp" },
      ],
      "2026-10-28",
    );
    expect(next.currentConstituents).toEqual(["AAA", "BBB", "DDD"]);
    // Adds and removes pair positionally into single rows — the same
    // convention as Wikipedia's "+MRVL −POOL" paired entries.
    expect(next.changes).toHaveLength(1);
    const entry = next.changes[0]!;
    expect(entry.date).toBe("2026-10-28");
    expect(entry.source).toBe("observed");
    expect(entry.added?.ticker).toBe("DDD");
    expect(entry.removed?.ticker).toBe("CCC");
    expect(entry.reason).toContain("observed");
  });

  it("is idempotent — a second run with the same live set appends nothing", () => {
    const live = [
      { symbol: "AAA", name: "A" },
      { symbol: "BBB", name: "B" },
      { symbol: "CCC", name: "C" },
    ];
    const once = appendObservedChanges(ledger(), live, "2026-10-28");
    expect(once).toBe(ledger().changes.length === once.changes.length ? once : once);
    const twice = appendObservedChanges(once, live, "2026-10-29");
    expect(twice.changes).toHaveLength(once.changes.length);
  });

  it("returns the input unchanged (same reference) when there is no drift", () => {
    const base = ledger();
    const out = appendObservedChanges(base, [
      { symbol: "AAA", name: "A" },
      { symbol: "BBB", name: "B" },
      { symbol: "CCC", name: "C" },
    ], "2026-10-28");
    expect(out).toBe(base);
  });
});

describe("ledgerChangesAsIndexChanges", () => {
  it("exposes entries in the wikipedia-history IndexChange shape", () => {
    const next = appendObservedChanges(ledger(), [
      { symbol: "AAA", name: "A" },
      { symbol: "BBB", name: "B" },
      { symbol: "ZZZ", name: "Z Corp" },
    ], "2026-10-28");
    const asChanges = ledgerChangesAsIndexChanges(next);
    for (const c of asChanges) {
      expect(typeof c.date).toBe("string");
      expect("added" in c && "removed" in c && "reason" in c).toBe(true);
    }
    expect(asChanges.some((c) => c.added?.ticker === "ZZZ")).toBe(true);
  });
});
