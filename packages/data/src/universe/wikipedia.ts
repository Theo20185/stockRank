import type { UniverseEntry } from "./loader.js";

const WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";

/**
 * Parses the S&P 500 constituents table out of Wikipedia HTML.
 *
 * Wikipedia pages are stable in shape: the constituents table is the first
 * `<table id="constituents">` (or first sortable wikitable), with columns
 * Symbol, Security, GICS Sector, GICS Sub-Industry, Headquarters, Date added,
 * CIK, Founded.
 *
 * We use a tolerant regex parser rather than a full HTML library; the only
 * fields we extract are Symbol (col 1) and Security/Name (col 2). If
 * Wikipedia restructures, this will surface as a low row count and the caller
 * can compare against the prior committed file before overwriting.
 */
export function parseSp500FromWikipedia(html: string): UniverseEntry[] {
  const tableMatch = html.match(
    /<table[^>]*id=["']constituents["'][^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tableMatch) {
    throw new Error("Wikipedia parser: constituents table not found in HTML");
  }
  const tableHtml = tableMatch[1]!;

  const rowMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  const entries: UniverseEntry[] = [];

  for (const row of rowMatches) {
    const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length < 2) continue;

    const symbol = stripHtml(cells[0]![1]!);
    const name = stripHtml(cells[1]![1]!);

    if (!symbol || !name) continue;
    if (symbol.toLowerCase() === "symbol") continue; // header row

    entries.push({ symbol, name });
  }

  if (entries.length < 100) {
    throw new Error(
      `Wikipedia parser: only ${entries.length} rows extracted; table layout likely changed`,
    );
  }
  return entries;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSp500FromWikipedia(
  fetchImpl: typeof fetch = fetch,
): Promise<UniverseEntry[]> {
  const response = await fetchImpl(WIKIPEDIA_URL, {
    headers: {
      // Wikipedia is sensitive to scrapers; identify ourselves politely.
      "user-agent":
        "stockRank-universe-scraper/0.1 (https://github.com/-/stockRank)",
      accept: "text/html",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Wikipedia fetch failed: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const html = await response.text();
  return parseSp500FromWikipedia(html);
}
