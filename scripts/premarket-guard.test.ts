import { describe, expect, it } from "vitest";
import { classifyMarketSession } from "./premarket-guard.js";

// The 2026-11-18 failure: refresh started ~05:20 PT; options fetched
// at 13:46Z = 08:46 ET on a Wednesday — premarket. Yahoo served stub
// chains (13 expirations, one contract each, null bids) and the
// capital-plan integration test failed after ~30 minutes of ingest.
describe("classifyMarketSession", () => {
  it("flags a weekday premarket instant (the 2026-11-18 failure time)", () => {
    const s = classifyMarketSession(new Date("2026-11-18T13:46:15Z")); // Wed 08:46 EST
    expect(s.premarket).toBe(true);
    expect(s.detail).toMatch(/08:46/);
  });

  it("passes at the 09:30 ET open", () => {
    const s = classifyMarketSession(new Date("2026-11-18T14:30:00Z")); // Wed 09:30 EST
    expect(s.premarket).toBe(false);
  });

  it("passes overnight before 04:00 ET (previous close data is valid)", () => {
    const s = classifyMarketSession(new Date("2026-11-18T08:59:00Z")); // Wed 03:59 EST
    expect(s.premarket).toBe(false);
  });

  it("flags the 04:00 ET premarket-session boundary", () => {
    const s = classifyMarketSession(new Date("2026-11-20T09:00:00Z")); // Fri 04:00 EST
    expect(s.premarket).toBe(true);
  });

  it("passes on weekends (the 2026-11-16 Sunday refresh ran fine)", () => {
    expect(
      classifyMarketSession(new Date("2026-11-15T16:30:00Z")).premarket, // Sun 11:30 EST
    ).toBe(false);
    expect(
      classifyMarketSession(new Date("2026-11-21T14:00:00Z")).premarket, // Sat 09:00 EST
    ).toBe(false);
  });

  it("handles daylight time (EDT) correctly", () => {
    expect(
      classifyMarketSession(new Date("2026-07-15T13:00:00Z")).premarket, // Wed 09:00 EDT
    ).toBe(true);
    expect(
      classifyMarketSession(new Date("2026-07-15T13:30:00Z")).premarket, // Wed 09:30 EDT
    ).toBe(false);
  });
});
