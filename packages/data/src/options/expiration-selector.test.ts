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

describe("selectExpirations", () => {
  const today = "2026-04-20";

  it("returns weekly + monthly + yearly when all three are distinct", () => {
    const result = selectExpirations(today, [
      "2026-04-24",       // soonest weekly (Apr 24 Fri)
      "2026-05-15",       // next monthly (May 3rd Fri)
      "2026-06-19",
      "2027-01-15",       // next Jan yearly
      "2028-01-21",
    ]);
    expect(result).toEqual([
      { expiration: "2026-04-24", selectionReason: "weekly" },
      { expiration: "2026-05-15", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("cascades monthly to the next third-Friday when weekly equals the next monthly", () => {
    // No earlier weekly listed; 2026-05-15 is the very first future
    // expiration AND it's a monthly third-Friday. The monthly slot rolls
    // forward to the next third-Friday Friday (Jun 19) so the user
    // always gets three distinct expirations when the chain has them.
    const result = selectExpirations(today, [
      "2026-05-15",
      "2026-06-19",
      "2027-01-15",
    ]);
    expect(result).toEqual([
      { expiration: "2026-05-15", selectionReason: "weekly" },
      { expiration: "2026-06-19", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("reproduces the 2026-05-11 production bug (Monday before May 3rd-Fri)", () => {
    // Today 2026-05-11 (Monday). Next 3rd-Fri = 2026-05-15. Without the
    // cascade, monthly was deduped and the Plan screen defaulted to a mode
    // with zero candidates. The cascade rolls monthly forward to Jun 19.
    const result = selectExpirations("2026-05-11", [
      "2026-05-15", "2026-05-22", "2026-06-19", "2026-07-17", "2027-01-15",
    ]);
    expect(result).toEqual([
      { expiration: "2026-05-15", selectionReason: "weekly" },
      { expiration: "2026-06-19", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("accepts a Thursday day-18 expiration as monthly when no Friday is listed for that month", () => {
    // The 2026-05-11 EIX case: Yahoo's chain for EIX returned May 15 (Fri),
    // June 18 (THURSDAY — Yahoo's OCC symbol literally reads "EIX260618"),
    // July 17 (Fri). The previous strict-Friday rule skipped Jun 18 and
    // picked July 17 (67 DTE). The user expected June 18 (38 DTE) because
    // it's the symbol's actual next month-end contract.
    const result = selectExpirations("2026-05-11", [
      "2026-05-15",      // weekly (3rd-Fri Fri)
      "2026-06-18",      // EIX-style June (day 18, Thursday)
      "2026-07-17",      // July 3rd-Fri Fri
      "2027-01-15",      // yearly
    ]);
    expect(result).toEqual([
      { expiration: "2026-05-15", selectionReason: "weekly" },
      { expiration: "2026-06-18", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("prefers the Friday entry when multiple day-15-21 expirations are listed in the same month", () => {
    // SPY-style chain with weeklies. Several day-15-21 entries in June
    // (Mon, Wed, Fri). The Friday is the standard "monthly" — pick it
    // regardless of sort order.
    const result = selectExpirations("2026-05-11", [
      "2026-05-15",      // weekly (3rd-Fri Fri)
      "2026-06-15",      // Mon, day 15
      "2026-06-17",      // Wed, day 17
      "2026-06-19",      // Fri, day 19 — the canonical monthly
      "2026-06-26",      // last Fri of June, day 26 (outside [15,21])
      "2027-01-15",      // yearly
    ]);
    expect(result).toEqual([
      { expiration: "2026-05-15", selectionReason: "weekly" },
      { expiration: "2026-06-19", selectionReason: "monthly" },
      { expiration: "2027-01-15", selectionReason: "yearly" },
    ]);
  });

  it("cascades through both monthly and yearly when weekly is a January 3rd-Friday", () => {
    // Today is two days before the Jan 3rd-Friday. weekly takes that
    // Jan date. monthly cascades to Feb. yearly cascades to next year.
    const result = selectExpirations("2027-01-13", [
      "2027-01-15", "2027-02-19", "2027-03-19", "2028-01-21",
    ]);
    expect(result).toEqual([
      { expiration: "2027-01-15", selectionReason: "weekly" },
      { expiration: "2027-02-19", selectionReason: "monthly" },
      { expiration: "2028-01-21", selectionReason: "yearly" },
    ]);
  });

  it("advances yearly to the following January when next monthly IS next January monthly", () => {
    // Today is late Dec → the very next monthly is the Jan third-Friday.
    const result = selectExpirations("2026-12-26", [
      "2027-01-02",       // weekly
      "2027-01-15",       // monthly = next Jan
      "2027-02-19",
      "2028-01-21",       // yearly must skip ahead to this
    ]);
    expect(result).toEqual([
      { expiration: "2027-01-02", selectionReason: "weekly" },
      { expiration: "2027-01-15", selectionReason: "monthly" },
      { expiration: "2028-01-21", selectionReason: "yearly" },
    ]);
  });

  it("collapses weekly+monthly+yearly to a single entry when all three are the same date", () => {
    // Tortured edge case: today is the Wednesday before the Jan third-Friday
    // and the chain only has that Jan date. weekly == monthly == yearly.
    const result = selectExpirations("2027-01-13", ["2027-01-15"]);
    expect(result).toEqual([
      { expiration: "2027-01-15", selectionReason: "weekly" },
    ]);
  });

  it("omits the yearly slot when the chain has no January monthly", () => {
    const result = selectExpirations(today, [
      "2026-04-24",
      "2026-05-15",
      "2026-06-19",
    ]);
    expect(result).toEqual([
      { expiration: "2026-04-24", selectionReason: "weekly" },
      { expiration: "2026-05-15", selectionReason: "monthly" },
    ]);
  });

  it("omits the monthly slot when the chain has only weeklies", () => {
    const result = selectExpirations(today, [
      "2026-04-24",
      "2026-05-01",
      "2026-05-08",
    ]);
    expect(result).toEqual([
      { expiration: "2026-04-24", selectionReason: "weekly" },
    ]);
  });

  it("returns empty when input is empty", () => {
    expect(selectExpirations(today, [])).toEqual([]);
  });

  it("ignores expirations in the past", () => {
    const result = selectExpirations(today, [
      "2025-01-17",       // past LEAPS — ignored
      "2026-04-24",
      "2026-05-15",
      "2027-01-15",
    ]);
    expect(result.map((e) => e.expiration)).toEqual([
      "2026-04-24",
      "2026-05-15",
      "2027-01-15",
    ]);
  });

  it("treats today's date itself as in the past (already expired)", () => {
    const result = selectExpirations(today, [today, "2026-05-15", "2027-01-15"]);
    expect(result.map((e) => e.expiration)).toEqual(["2026-05-15", "2027-01-15"]);
  });

  it("accepts ISO timestamp inputs (Yahoo's chain format)", () => {
    const result = selectExpirations(today, [
      "2026-04-24T00:00:00.000Z",
      "2026-05-15T00:00:00.000Z",
      "2027-01-15T00:00:00.000Z",
    ]);
    expect(result.map((e) => e.expiration)).toEqual([
      "2026-04-24",
      "2026-05-15",
      "2027-01-15",
    ]);
  });
});
