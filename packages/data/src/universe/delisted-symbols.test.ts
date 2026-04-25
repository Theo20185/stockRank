import { describe, it, expect } from "vitest";
import {
  classifyRemovalReason,
  extractDelistedSymbols,
} from "./delisted-symbols.js";
import type { IndexChange } from "./wikipedia-history.js";

describe("classifyRemovalReason", () => {
  it("classifies bankruptcies", () => {
    expect(classifyRemovalReason("Chapter 11 filing.")).toBe("bankruptcy");
    expect(classifyRemovalReason("filed for bankruptcy")).toBe("bankruptcy");
    expect(classifyRemovalReason("Liquidated.")).toBe("bankruptcy");
  });

  it("classifies acquisitions", () => {
    expect(classifyRemovalReason("Microsoft acquired ABC.")).toBe("acquired");
    expect(classifyRemovalReason("Merger with XYZ Corp.")).toBe("acquired");
    expect(classifyRemovalReason("Taken private by KKR.")).toBe("acquired");
  });

  it("classifies cap changes", () => {
    expect(classifyRemovalReason("Market capitalization change.")).toBe("market-cap-change");
    expect(classifyRemovalReason("size criterion failure")).toBe("market-cap-change");
  });

  it("classifies spinoffs", () => {
    expect(classifyRemovalReason("Spin-off from parent.")).toBe("spinoff");
  });

  it("falls through to 'other' for unmatched text and null", () => {
    expect(classifyRemovalReason("Some other reason.")).toBe("other");
    expect(classifyRemovalReason(null)).toBe("other");
    expect(classifyRemovalReason("")).toBe("other");
  });
});

describe("extractDelistedSymbols", () => {
  it("returns symbols that were removed and aren't currently in the index", () => {
    const changes: IndexChange[] = [
      {
        date: "2020-01-15",
        added: { ticker: "NEW1", name: "New Co" },
        removed: { ticker: "GONE1", name: "Gone Co" },
        reason: "Acquired by SuperCo.",
      },
      {
        date: "2018-06-30",
        added: null,
        removed: { ticker: "BANKRUPT1", name: "Bankrupt Co" },
        reason: "Chapter 11.",
      },
    ];
    const current = ["NEW1", "AAPL", "MSFT"];
    const result = extractDelistedSymbols(changes, current);
    expect(result.length).toBe(2);
    const tickers = result.map((d) => d.ticker).sort();
    expect(tickers).toEqual(["BANKRUPT1", "GONE1"]);
  });

  it("excludes tickers that are still in the current index", () => {
    const changes: IndexChange[] = [
      {
        date: "2020-01-15",
        added: { ticker: "NEW1", name: "" },
        removed: { ticker: "AAPL", name: "Apple" }, // hypothetical Apple removal
        reason: "—",
      },
    ];
    const current = ["AAPL", "MSFT"]; // AAPL is currently in
    const result = extractDelistedSymbols(changes, current);
    // AAPL is in current → not delisted
    expect(result.find((d) => d.ticker === "AAPL")).toBeUndefined();
  });

  it("dedupes by ticker, keeping the EARLIEST removal", () => {
    const changes: IndexChange[] = [
      {
        date: "2022-01-01",
        added: null,
        removed: { ticker: "T1", name: "" },
        reason: "second removal",
      },
      {
        date: "2018-01-01",
        added: null,
        removed: { ticker: "T1", name: "" },
        reason: "first removal",
      },
    ];
    const result = extractDelistedSymbols(changes, []);
    expect(result.length).toBe(1);
    expect(result[0]!.removalDate).toBe("2018-01-01");
    expect(result[0]!.rawReason).toBe("first removal");
  });

  it("returns symbols sorted by removal date ascending", () => {
    const changes: IndexChange[] = [
      { date: "2022-06-01", added: null, removed: { ticker: "T1", name: "" }, reason: null },
      { date: "2020-01-01", added: null, removed: { ticker: "T2", name: "" }, reason: null },
      { date: "2024-12-31", added: null, removed: { ticker: "T3", name: "" }, reason: null },
    ];
    const result = extractDelistedSymbols(changes, []);
    expect(result.map((d) => d.removalDate)).toEqual([
      "2020-01-01",
      "2022-06-01",
      "2024-12-31",
    ]);
  });
});
