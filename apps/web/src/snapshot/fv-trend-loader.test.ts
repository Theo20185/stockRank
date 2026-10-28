import { describe, expect, it } from "vitest";
import type { FvTrendArtifact } from "@stockrank/core";
import type { RankedRow } from "@stockrank/ranking";
import { applyFvTrend } from "./fv-trend-loader.js";

/**
 * The 2026-09-21 gap survey misread this seam as broken because the
 * serialized snapshot carries the rank()-time "insufficient_data"
 * stub BY DESIGN and the override lives client-side — and nothing
 * tested it, so the misread was possible in either direction. These
 * tests pin the join.
 */

function rowStub(symbol: string): RankedRow {
  return { symbol, fvTrend: "insufficient_data" } as unknown as RankedRow;
}

function artifact(symbols: FvTrendArtifact["symbols"]): FvTrendArtifact {
  return {
    generatedAt: "2026-10-28T00:00:00.000Z",
    windowYears: 2,
    slopeThresholdPctPerYear: 5,
    symbols,
  } as FvTrendArtifact;
}

describe("applyFvTrend", () => {
  it("overrides the rank()-time stub with the artifact's trend", () => {
    const rows = [rowStub("DECK"), rowStub("NVDA")];
    applyFvTrend(rows, artifact({
      DECK: { trend: "declining" },
      NVDA: { trend: "improving" },
    } as FvTrendArtifact["symbols"]));
    expect(rows[0]!.fvTrend).toBe("declining");
    expect(rows[1]!.fvTrend).toBe("improving");
  });

  it("leaves rows absent from the artifact at insufficient_data", () => {
    const rows = [rowStub("XYZ")];
    applyFvTrend(rows, artifact({} as FvTrendArtifact["symbols"]));
    expect(rows[0]!.fvTrend).toBe("insufficient_data");
  });

  it("is a no-op when the artifact failed to load (null)", () => {
    const rows = [rowStub("DECK")];
    applyFvTrend(rows, null);
    expect(rows[0]!.fvTrend).toBe("insufficient_data");
  });
});
