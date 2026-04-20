import { describe, it, expect } from "vitest";
import { selectExpirations, isMonthlyThirdFriday } from "./expiration-selector.js";

// Reference dates used throughout: January 16, 2026 is a Friday (day 16).
// January 15, 2027 is a Friday (day 15). January 21, 2028 is a Friday (day 21).
// March 20, 2026 = Friday (Q1 monthly). June 19, 2026 = Friday (Q2 monthly).

describe("isMonthlyThirdFriday", () => {
  it.each([
    ["2026-01-16", true],   // 3rd Friday Jan 2026
    ["2027-01-15", true],   // 3rd Friday Jan 2027
    ["2028-01-21", true],   // 3rd Friday Jan 2028
    ["2026-03-20", true],   // 3rd Friday Mar 2026
    ["2026-06-19", true],   // 3rd Friday Jun 2026
    ["2026-04-17", true],   // 3rd Friday Apr 2026 (in spec date range)
    ["2026-01-09", false],  // 2nd Friday — day 9 not in [15,21]
    ["2026-01-23", false],  // 4th Friday — day 23 not in [15,21]
    ["2026-04-15", false],  // Wednesday Apr 15 — not Friday
    ["2026-04-24", false],  // Friday Apr 24 — day 24 not in [15,21]
  ])("recognizes %s as %s", (iso, expected) => {
    expect(isMonthlyThirdFriday(iso)).toBe(expected);
  });
});

describe("selectExpirations", () => {
  const today = "2026-04-20";

  it("returns next two January LEAPS when both available (branch 1)", () => {
    const result = selectExpirations(today, [
      "2026-04-24", "2026-05-15",
      "2027-01-15", "2027-06-18",
      "2028-01-21",
    ]);
    expect(result.map((e) => e.expiration)).toEqual(["2027-01-15", "2028-01-21"]);
    expect(result.every((e) => e.selectionReason === "leap")).toBe(true);
  });

  it("falls back to single LEAPS + next non-Jan monthly >=60d out (branch 2)", () => {
    const result = selectExpirations(today, [
      "2026-04-24",       // 4 days out — too close
      "2026-05-15",       // 25 days out — too close
      "2026-06-19",       // 60 days out — qualifies
      "2026-12-18",
      "2027-01-15",       // single LEAPS
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ expiration: "2027-01-15", selectionReason: "leap" });
    expect(result[1]).toEqual({ expiration: "2026-06-19", selectionReason: "leap-fallback" });
  });

  it("falls back to two quarterlies when no LEAPS (branch 3)", () => {
    const result = selectExpirations(today, [
      "2026-04-24", "2026-05-15",
      "2026-06-19",   // quarterly Jun
      "2026-09-18",   // quarterly Sep
      "2026-12-18",   // quarterly Dec
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.expiration)).toEqual(["2026-06-19", "2026-09-18"]);
    expect(result.every((e) => e.selectionReason === "quarterly")).toBe(true);
  });

  it("falls back to two next monthlies when no LEAPS or quarterlies (branch 4)", () => {
    const result = selectExpirations(today, [
      "2026-04-24",
      "2026-05-15",  // monthly May (3rd Fri but not quarterly)
      "2026-07-17",  // monthly Jul (3rd Fri but not quarterly)
      "2026-08-21",  // monthly Aug
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.expiration)).toEqual(["2026-05-15", "2026-07-17"]);
    expect(result.every((e) => e.selectionReason === "monthly")).toBe(true);
  });

  it("returns whatever exists when chain has fewer than two (branch 5)", () => {
    const result = selectExpirations(today, ["2026-05-15"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ expiration: "2026-05-15", selectionReason: "monthly" });
  });

  it("returns empty when input is empty", () => {
    expect(selectExpirations(today, [])).toEqual([]);
  });

  it("ignores expirations in the past", () => {
    const result = selectExpirations(today, [
      "2025-01-17",       // past LEAPS — ignored
      "2027-01-15", "2028-01-21",
    ]);
    expect(result.map((e) => e.expiration)).toEqual(["2027-01-15", "2028-01-21"]);
  });

  it("treats today's date itself as in the past (already expired)", () => {
    const result = selectExpirations(today, [today, "2027-01-15", "2028-01-21"]);
    expect(result.map((e) => e.expiration)).toEqual(["2027-01-15", "2028-01-21"]);
  });

  it("accepts ISO timestamp inputs (Yahoo's chain format)", () => {
    const result = selectExpirations(today, [
      "2026-04-24T00:00:00.000Z",
      "2027-01-15T00:00:00.000Z",
      "2028-01-21T00:00:00.000Z",
    ]);
    expect(result.map((e) => e.expiration)).toEqual(["2027-01-15", "2028-01-21"]);
  });
});
