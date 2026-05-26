import { describe, it, expect } from "vitest";
import { selectExpirations, isMonthlyThirdFriday } from "./expiration-selector.js";

// Reference dates used throughout: January 16, 2026 is a Friday (day 16).
// January 15, 2027 is a Friday (day 15). January 21, 2028 is a Friday (day 21).
// March 20, 2026 = Friday (Q1 monthly). June 19, 2026 = Friday (Q2 monthly).

describe("isMonthlyThirdFriday (day-15-to-21 window — weekday is a tiebreaker, not a filter)", () => {
  it.each([
    ["2026-01-16", true],   // 3rd Friday Jan 2026
    ["2027-01-15", true],   // 3rd Friday Jan 2027
    ["2028-01-21", true],   // 3rd Friday Jan 2028
    ["2026-03-20", true],   // 3rd Friday Mar 2026
    ["2026-06-19", true],   // 3rd Friday Jun 2026
    ["2026-04-17", true],   // 3rd Friday Apr 2026
    ["2026-06-18", true],   // EIX-style Thursday in 3rd week — accepted
    ["2026-04-15", true],   // Wednesday Apr 15 — day 15 in window, accepted
    ["2026-01-09", false],  // 2nd Friday — day 9 not in [15,21]
    ["2026-01-23", false],  // 4th Friday — day 23 not in [15,21]
    ["2026-04-24", false],  // Friday Apr 24 — day 24 not in [15,21]
  ])("recognizes %s as %s", (iso, expected) => {
    expect(isMonthlyThirdFriday(iso)).toBe(expected);
  });
});

// 2026-05-26 redesign: selector returns ALL monthly 3rd-week expirations
// from today through the yearly (Jan) slot. No more "weekly" slot — the
// user no longer wants to write weekly options. UI tabs are monthly +
// yearly only; the portfolio reads bid/ask for any held contract by
// looking up its expiration in the widened set.
describe("selectExpirations — monthlies + yearly only (no weekly)", () => {
  const today = "2026-05-26";

  it("returns every monthly 3rd-week between today and the yearly slot, plus yearly", () => {
    const result = selectExpirations(today, [
      "2026-06-19", "2026-07-17", "2026-08-21", "2026-09-18",
      "2026-10-16", "2026-11-20", "2026-12-18", "2027-01-15",
      "2027-02-19", // beyond yearly — should NOT appear
    ]);
    expect(result).toEqual([
      { expiration: "2026-06-19", selectionReason: "monthly" },
      { expiration: "2026-07-17", selectionReason: "monthly" },
      { expiration: "2026-08-21", selectionReason: "monthly" },
      { expiration: "2026-09-18", selectionReason: "monthly" },
      { expiration: "2026-10-16", selectionReason: "monthly" },
      { expiration: "2026-11-20", selectionReason: "monthly" },
      { expiration: "2026-12-18", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("never emits a 'weekly' selectionReason (the slot was removed)", () => {
    const result = selectExpirations(today, [
      "2026-05-29",       // a true weekly — must NOT be selected at all
      "2026-06-05",
      "2026-06-19",       // first 3rd-week monthly
      "2026-07-17",
      "2027-01-15",
    ]);
    for (const r of result) {
      expect(r.selectionReason).not.toBe("weekly");
    }
    // True weeklies are skipped entirely; only 3rd-week dates appear.
    expect(result.map((r) => r.expiration)).toEqual([
      "2026-06-19", "2026-07-17", "2027-01-15",
    ]);
  });

  it("EIX-class regression: soonest Thursday 3rd-week IS the monthly slot (not weekly)", () => {
    // EIX's June expiration is 2026-06-18 (Thursday, day 18). With the
    // old cascade, this was wrongly placed in 'weekly' and the monthly
    // slot pushed forward to 2026-07-17 (60 DTE). New behavior: it's
    // the monthly directly.
    const result = selectExpirations("2026-05-26", [
      "2026-06-18", "2026-07-17", "2027-01-15",
    ]);
    expect(result[0]).toEqual({
      expiration: "2026-06-18",
      selectionReason: "monthly",
    });
    expect(result.find((r) => r.selectionReason === "yearly")).toEqual({
      expiration: "2027-01-15",
      selectionReason: "yearly",
    });
  });

  it("cascades yearly to the FOLLOWING January when the soonest 3rd-week IS the next January", () => {
    // Today is two days before Jan 3rd-Fri 2027. The monthly slot
    // takes Jan 15 2027 (it IS the next 3rd-week). Yearly cascades
    // forward to Jan 21 2028.
    const result = selectExpirations("2027-01-13", [
      "2027-01-15", "2027-02-19", "2027-03-19", "2028-01-21",
    ]);
    expect(result).toEqual([
      { expiration: "2027-01-15", selectionReason: "monthly" },
      { expiration: "2027-02-19", selectionReason: "monthly" },
      { expiration: "2027-03-19", selectionReason: "monthly" },
      { expiration: "2028-01-21", selectionReason: "yearly" },
    ]);
  });

  it("omits the yearly slot when the chain has no January 3rd-week", () => {
    const result = selectExpirations(today, [
      "2026-06-19", "2026-07-17", "2026-08-21",
    ]);
    expect(result).toEqual([
      { expiration: "2026-06-19", selectionReason: "monthly" },
      { expiration: "2026-07-17", selectionReason: "monthly" },
      { expiration: "2026-08-21", selectionReason: "monthly" },
    ]);
  });

  it("returns just the yearly entry when no intermediate monthlies are listed", () => {
    const result = selectExpirations(today, ["2027-01-15"]);
    expect(result).toEqual([
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("prefers the Friday entry when multiple day-15-21 dates exist in the same month", () => {
    // SPY-style chain — several day-15-21 entries in June (Mon/Wed/Fri).
    // The Friday is the canonical OCC monthly — pick it.
    const result = selectExpirations(today, [
      "2026-06-15",       // Mon, day 15
      "2026-06-17",       // Wed, day 17
      "2026-06-19",       // Fri, day 19 — canonical
      "2026-06-26",       // last Fri of June, day 26 (outside [15,21])
      "2027-01-15",
    ]);
    expect(result.map((r) => r.expiration)).toEqual([
      "2026-06-19", "2027-01-15",
    ]);
  });

  it("returns empty when input is empty", () => {
    expect(selectExpirations(today, [])).toEqual([]);
  });

  it("ignores past dates", () => {
    const result = selectExpirations(today, [
      "2025-01-17",       // past LEAPS — ignored
      "2026-06-19",
      "2027-01-15",
    ]);
    expect(result.map((r) => r.expiration)).toEqual([
      "2026-06-19", "2027-01-15",
    ]);
  });

  it("treats today's date itself as in the past (already expired)", () => {
    const result = selectExpirations(today, [today, "2026-06-19", "2027-01-15"]);
    expect(result.map((r) => r.expiration)).toEqual(["2026-06-19", "2027-01-15"]);
  });

  it("accepts ISO timestamp inputs (Yahoo's chain format)", () => {
    const result = selectExpirations(today, [
      "2026-06-19T00:00:00.000Z",
      "2027-01-15T00:00:00.000Z",
    ]);
    expect(result.map((r) => r.expiration)).toEqual([
      "2026-06-19", "2027-01-15",
    ]);
  });
});
