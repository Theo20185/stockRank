import { describe, it, expect } from "vitest";
import {
  buildMembershipHistory,
  fetchChangesFromWikipedia,
  membersAt,
} from "./wikipedia-history.js";
import { fetchSp500FromWikipedia } from "./wikipedia.js";

const skip = !process.env.RUN_INTEGRATION;

describe.skipIf(skip)("wikipedia-history (live integration)", () => {
  it("recovers ≥ 200 changes from the live page", async () => {
    const changes = await fetchChangesFromWikipedia();
    expect(changes.length).toBeGreaterThanOrEqual(200);
  }, 30_000);

  it("builds membership history that supports lookups going back 10+ years", async () => {
    const [current, changes] = await Promise.all([
      fetchSp500FromWikipedia(),
      fetchChangesFromWikipedia(),
    ]);
    const history = buildMembershipHistory(
      current.map((c) => c.symbol),
      changes,
    );
    // 10 years ago: should still see ≥ 400 members
    const tenYearsAgo = (() => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - 10);
      return d.toISOString().slice(0, 10);
    })();
    const tenYearMembers = membersAt(history, tenYearsAgo);
    expect(tenYearMembers).not.toBeNull();
    expect(tenYearMembers!.size).toBeGreaterThanOrEqual(400);
  }, 30_000);
});
