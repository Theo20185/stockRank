import { describe, it, expect } from "vitest";
import {
  buildMembershipHistory,
  membersAt,
  parseChangesTable,
  parseWikiDate,
  type IndexChange,
} from "./wikipedia-history.js";

describe("parseWikiDate", () => {
  it("parses ISO format", () => {
    expect(parseWikiDate("2024-03-17")).toBe("2024-03-17");
  });

  it("parses 'Month DD, YYYY'", () => {
    expect(parseWikiDate("March 17, 2024")).toBe("2024-03-17");
    expect(parseWikiDate("Mar 17, 2024")).toBe("2024-03-17");
    expect(parseWikiDate("Sept 4, 2018")).toBe("2018-09-04");
  });

  it("parses 'DD Month YYYY'", () => {
    expect(parseWikiDate("17 March 2024")).toBe("2024-03-17");
    expect(parseWikiDate("4 Sep 2018")).toBe("2018-09-04");
  });

  it("returns null on non-date input", () => {
    expect(parseWikiDate("Date")).toBeNull();
    expect(parseWikiDate("")).toBeNull();
    expect(parseWikiDate("not a date")).toBeNull();
  });
});

describe("parseChangesTable", () => {
  it("extracts changes from a synthetic two-table HTML fixture", () => {
    const html = `
      <table class="wikitable" id="constituents">
        <tr><th>Symbol</th><th>Security</th></tr>
        <tr><td>AAPL</td><td>Apple Inc.</td></tr>
      </table>
      <table class="wikitable">
        <tr><th rowspan="2">Date</th><th colspan="2">Added</th><th colspan="2">Removed</th><th rowspan="2">Reason</th></tr>
        <tr><th>Ticker</th><th>Security</th><th>Ticker</th><th>Security</th></tr>
        <tr>
          <td>March 17, 2024</td>
          <td>NEW1</td><td>NewCo</td>
          <td>OLD1</td><td>OldCo</td>
          <td>Replacement</td>
        </tr>
        <tr>
          <td>February 1, 2024</td>
          <td></td><td></td>
          <td>OLD2</td><td>BankruptCo</td>
          <td>Bankruptcy</td>
        </tr>
        <tr>
          <td>January 5, 2023</td>
          <td>NEW2</td><td>NewerCo</td>
          <td></td><td></td>
          <td>Index expansion</td>
        </tr>
      </table>
    `;
    const changes = parseChangesTable(html);
    expect(changes.length).toBe(3);

    const replace = changes.find((c) => c.date === "2024-03-17")!;
    expect(replace.added?.ticker).toBe("NEW1");
    expect(replace.added?.name).toBe("NewCo");
    expect(replace.removed?.ticker).toBe("OLD1");
    expect(replace.reason).toBe("Replacement");

    const bankruptcy = changes.find((c) => c.date === "2024-02-01")!;
    expect(bankruptcy.added).toBeNull();
    expect(bankruptcy.removed?.ticker).toBe("OLD2");

    const expansion = changes.find((c) => c.date === "2023-01-05")!;
    expect(expansion.added?.ticker).toBe("NEW2");
    expect(expansion.removed).toBeNull();
  });

  it("throws when the second wikitable is missing", () => {
    const html = `<table class="wikitable"><tr><td>only one table</td></tr></table>`;
    expect(() => parseChangesTable(html)).toThrow(/changes table not found/);
  });

  it("skips header rows by date-parse failure", () => {
    const html = `
      <table class="wikitable">x</table>
      <table class="wikitable">
        <tr><th>Date</th><th>Ticker</th><th>Security</th><th>Ticker</th><th>Security</th></tr>
        <tr><td>March 17, 2024</td><td>NEW1</td><td>NewCo</td><td>OLD1</td><td>OldCo</td><td>R</td></tr>
      </table>
    `;
    const changes = parseChangesTable(html);
    expect(changes.length).toBe(1);
  });
});

describe("buildMembershipHistory", () => {
  it("starts with today's constituents and reverses changes", () => {
    const today = new Date().toISOString().slice(0, 10);
    const current = ["NEW1", "AAPL", "MSFT"];
    const changes: IndexChange[] = [
      // 2024-03-17: NEW1 replaces OLD1
      {
        date: "2024-03-17",
        added: { ticker: "NEW1", name: "NewCo" },
        removed: { ticker: "OLD1", name: "OldCo" },
        reason: "Replacement",
      },
    ];
    const history = buildMembershipHistory(current, changes);
    // Two membership snapshots: pre-change and post-change (today).
    expect(history.length).toBe(2);
    // Today's set
    const todaySet = history.find((h) => h.effectiveFrom === today)!;
    expect([...todaySet.members].sort()).toEqual(["AAPL", "MSFT", "NEW1"]);
    // Pre-change (effectiveFrom = 2024-03-17 — apply reverse: NEW1 out, OLD1 in)
    const pre = history.find((h) => h.effectiveFrom === "2024-03-17")!;
    expect([...pre.members].sort()).toEqual(["AAPL", "MSFT", "OLD1"]);
  });

  it("handles asymmetric changes (only an addition or only a removal)", () => {
    const current = ["A", "B", "C"];
    const changes: IndexChange[] = [
      // 2023-01-05: A added (index expansion, no removal)
      { date: "2023-01-05", added: { ticker: "A", name: "" }, removed: null, reason: null },
      // 2022-06-01: D removed (bankruptcy, no replacement)
      { date: "2022-06-01", added: null, removed: { ticker: "D", name: "" }, reason: null },
    ];
    const history = buildMembershipHistory(current, changes);
    // After reverse:
    //   2023-01-05 reversed: A removed → {B, C}
    //   2022-06-01 reversed: D added back → {B, C, D}
    const post2023 = history.find((h) => h.effectiveFrom === "2023-01-05")!;
    expect([...post2023.members].sort()).toEqual(["B", "C"]);
    const post2022 = history.find((h) => h.effectiveFrom === "2022-06-01")!;
    expect([...post2022.members].sort()).toEqual(["B", "C", "D"]);
  });

  it("orders the output ascending by effectiveFrom", () => {
    const current = ["A"];
    const changes: IndexChange[] = [
      { date: "2024-01-01", added: null, removed: null, reason: null },
      { date: "2020-06-15", added: null, removed: null, reason: null },
      { date: "2022-09-30", added: null, removed: null, reason: null },
    ];
    const history = buildMembershipHistory(current, changes);
    const dates = history.map((h) => h.effectiveFrom);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("membersAt", () => {
  it("returns null for dates before the earliest effective entry", () => {
    const today = new Date().toISOString().slice(0, 10);
    const history = buildMembershipHistory(
      ["A", "B"],
      [
        {
          date: "2020-01-01",
          added: { ticker: "A", name: "" },
          removed: { ticker: "X", name: "" },
          reason: null,
        },
      ],
    );
    expect(membersAt(history, "1999-01-01")).toBeNull();
    // Exactly at earliest entry: returns the pre-change set
    expect([...(membersAt(history, "2020-01-01") ?? [])].sort()).toEqual([
      "B",
      "X",
    ]);
    void today;
  });

  it("returns the most recent member set for a date between change events", () => {
    const history = buildMembershipHistory(
      ["A", "B", "C"],
      [
        { date: "2020-01-01", added: null, removed: { ticker: "X", name: "" }, reason: null },
        { date: "2024-06-01", added: { ticker: "C", name: "" }, removed: null, reason: null },
      ],
    );
    // 2022-01-01 → after 2020-01-01 reversal but before 2024-06-01 reversal
    // The 2020-01-01 reversal added X back; the 2024-06-01 hasn't been
    // applied (going forward in time, C wasn't added yet either).
    // So membership at 2022-01-01: starts with [A,B,C] today,
    //   reverse 2024-06-01: C out → [A,B]
    //   reverse 2020-01-01: X in → [A,B,X]
    // The membership for 2022-01-01 should be the snapshot effective
    // FROM 2020-01-01, which is [A,B,X].
    expect([...(membersAt(history, "2022-01-01") ?? [])].sort()).toEqual([
      "A",
      "B",
      "X",
    ]);
  });

  it("returns the current constituents for today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const history = buildMembershipHistory(
      ["A", "B", "C"],
      [
        {
          date: "2020-01-01",
          added: { ticker: "A", name: "" },
          removed: { ticker: "X", name: "" },
          reason: null,
        },
      ],
    );
    expect([...(membersAt(history, today) ?? [])].sort()).toEqual([
      "A",
      "B",
      "C",
    ]);
  });
});
