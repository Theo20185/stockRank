import { describe, it, expect } from "vitest";
import { parseSp500FromWikipedia } from "./wikipedia.js";

// A structural snapshot of the constituents table. Real Wikipedia pages have
// ~503 rows; we use a stand-in with the three named-test rows plus enough
// padding rows to satisfy the >100-row guard.
function buildTableHtml(): string {
  const namedRows = `
    <tr>
      <td><a href="/wiki/MMM">MMM</a></td>
      <td><a href="/wiki/3M">3M</a></td>
      <td>Industrials</td>
    </tr>
    <tr>
      <td><a href="/wiki/AOS">AOS</a></td>
      <td><a href="/wiki/A._O._Smith">A.&nbsp;O.&nbsp;Smith</a></td>
      <td>Industrials</td>
    </tr>
    <tr>
      <td><a href="/wiki/AAPL">AAPL</a></td>
      <td><a href="/wiki/Apple_Inc.">Apple Inc.</a></td>
      <td>Information Technology</td>
    </tr>
  `;
  const paddingRows = Array.from({ length: 200 }, (_, i) =>
    `<tr><td>SYM${i}</td><td>Padding ${i}</td><td>X</td></tr>`,
  ).join("");

  return `
    <html><body>
      <table id="constituents" class="wikitable sortable">
        <tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>
        ${namedRows}
        ${paddingRows}
      </table>
    </body></html>
  `;
}

const wikipediaTableHtml = buildTableHtml();

describe("parseSp500FromWikipedia", () => {
  it("extracts symbol and name from the constituents table", () => {
    const entries = parseSp500FromWikipedia(wikipediaTableHtml);
    const aapl = entries.find((e) => e.symbol === "AAPL");
    expect(aapl).toBeDefined();
    expect(aapl!.name).toBe("Apple Inc.");
  });

  it("decodes common HTML entities in names", () => {
    const entries = parseSp500FromWikipedia(wikipediaTableHtml);
    const aos = entries.find((e) => e.symbol === "AOS");
    expect(aos!.name).toBe("A. O. Smith");
  });

  it("strips inner anchor tags and other markup", () => {
    const entries = parseSp500FromWikipedia(wikipediaTableHtml);
    const mmm = entries.find((e) => e.symbol === "MMM");
    expect(mmm!.name).toBe("3M");
  });

  it("throws when no constituents table is present", () => {
    expect(() => parseSp500FromWikipedia("<html><body><p>nope</p></body></html>")).toThrow(
      /constituents table not found/,
    );
  });

  it("throws if the row count is suspiciously low (likely a layout change)", () => {
    const tooFew = `
      <table id="constituents">
        <tr><th>Symbol</th><th>Security</th></tr>
        <tr><td>AAPL</td><td>Apple Inc.</td></tr>
      </table>
    `;
    expect(() => parseSp500FromWikipedia(tooFew)).toThrow(/layout likely changed/);
  });

  it("ignores the header row even when it lacks <th>", () => {
    const allTd = `
      <table id="constituents">
        ${"<tr><td>Symbol</td><td>Security</td></tr>".concat(
          Array.from({ length: 200 })
            .map((_, i) => `<tr><td>SYM${i}</td><td>Name${i}</td></tr>`)
            .join(""),
        )}
      </table>
    `;
    const entries = parseSp500FromWikipedia(allTd);
    expect(entries.find((e) => e.symbol === "Symbol")).toBeUndefined();
    expect(entries.length).toBe(200);
  });
});
