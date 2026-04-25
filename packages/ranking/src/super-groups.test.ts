import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_SUPER_GROUPS,
  INDUSTRY_TO_SUPER_GROUP,
  SUPER_GROUP_LABELS,
  superGroupOf,
} from "./super-groups.js";

describe("super-groups module", () => {
  it("returns the super-group for a known industry", () => {
    expect(superGroupOf("Software - Application")).toBe("software-internet");
    expect(superGroupOf("Tobacco")).toBe("consumer-staples");
    expect(superGroupOf("Diagnostics & Research")).toBe(
      "healthcare-equipment",
    );
  });

  it("returns null for an unknown industry", () => {
    expect(superGroupOf("Esoteric Frobnicators")).toBeNull();
  });

  it("places non-obvious industries per super-groups.md §4 rationale", () => {
    // Tobacco with branded staples (not commodity ag)
    expect(superGroupOf("Tobacco")).toBe("consumer-staples");
    // Discount Stores with staples (necessity-spending retail)
    expect(superGroupOf("Discount Stores")).toBe("consumer-staples");
    // Diagnostics with healthcare equipment (instrument economics)
    expect(superGroupOf("Diagnostics & Research")).toBe(
      "healthcare-equipment",
    );
    // Conglomerates / Waste Mgmt with industrials
    expect(superGroupOf("Conglomerates")).toBe("industrials");
    expect(superGroupOf("Waste Management")).toBe("industrials");
    expect(superGroupOf("Industrial Distribution")).toBe("industrials");
  });

  it("provides a label for every super-group key", () => {
    for (const key of ALL_SUPER_GROUPS) {
      expect(SUPER_GROUP_LABELS[key]).toBeTruthy();
      expect(SUPER_GROUP_LABELS[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("ALL_SUPER_GROUPS matches the keys used in the mapping table", () => {
    const usedKeys = new Set(Object.values(INDUSTRY_TO_SUPER_GROUP));
    for (const key of ALL_SUPER_GROUPS) {
      expect(usedKeys.has(key)).toBe(true);
    }
  });

  it("hits the per-super-group N≥13 floor on the live snapshot", () => {
    // Mapping-validation test: every super-group used in the mapping
    // table must have at least 13 mapped industries' worth of names
    // present in the latest snapshot. Falls back to the public/data
    // snapshot the web app reads from. If this fails, an industry has
    // been re-classified by FMP or the super-groups table needs an
    // update.
    const snapshotPath = resolve(
      __dirname,
      "../../../public/data/snapshot-latest.json",
    );
    let snapshot: { companies: Array<{ industry: string }> };
    try {
      snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    } catch {
      // No snapshot present (CI without committed data). Skip without
      // failing — the per-S&P-500-data check is opportunistic.
      return;
    }
    const counts = new Map<string, number>();
    for (const c of snapshot.companies) {
      const sg = superGroupOf(c.industry);
      if (sg !== null) {
        counts.set(sg, (counts.get(sg) ?? 0) + 1);
      }
    }
    for (const sg of ALL_SUPER_GROUPS) {
      const n = counts.get(sg) ?? 0;
      if (n < 13) {
        // Soft-fail with informative message — easier to triage than a
        // raw assertion when the snapshot drifts.
        throw new Error(
          `super-group "${sg}" has only ${n} names in the snapshot ` +
            `(need ≥ 13 per super-groups.md §2). ` +
            `An industry may have been re-classified by FMP.`,
        );
      }
    }
  });

  it("flags any unmapped industries present in the live snapshot", () => {
    const snapshotPath = resolve(
      __dirname,
      "../../../public/data/snapshot-latest.json",
    );
    let snapshot: { companies: Array<{ industry: string }> };
    try {
      snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    } catch {
      return;
    }
    const unmapped = new Set<string>();
    for (const c of snapshot.companies) {
      if (superGroupOf(c.industry) === null) {
        unmapped.add(c.industry);
      }
    }
    if (unmapped.size > 0) {
      throw new Error(
        `Unmapped industries present in snapshot — add to ` +
          `INDUSTRY_TO_SUPER_GROUP: ${[...unmapped].join(", ")}`,
      );
    }
  });
});
