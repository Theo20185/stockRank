/**
 * Phase 2b: parse the "Selected changes to the list" table from
 * Wikipedia's S&P 500 page and back-construct historical
 * membership. See `docs/specs/point-in-time-universe.md` for the
 * design.
 */

const WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";

export type IndexChange = {
  /** ISO YYYY-MM-DD effective date of the change. */
  date: string;
  added: { ticker: string; name: string } | null;
  removed: { ticker: string; name: string } | null;
  reason: string | null;
};

export type Membership = {
  /** ISO date — first date this member set is in effect (inclusive). */
  effectiveFrom: string;
  members: Set<string>;
};

/**
 * Parse the changes table out of the Wikipedia HTML. Wikipedia's
 * page convention: the SECOND wikitable is the changes table. The
 * first is current constituents (handled by `wikipedia.ts`).
 *
 * The changes table columns:
 *   Date | Added (Ticker, Security) | Removed (Ticker, Security) | Reason
 *
 * The table uses two-row headers (a top-level "Date | Added |
 * Removed | Reason" row plus a sub-row "| Ticker | Security |
 * Ticker | Security |"). After the headers come data rows with 5
 * cells: date, addedTicker, addedSecurity, removedTicker,
 * removedSecurity, reason. Some rows have empty add or remove
 * cells when a change was asymmetric.
 */
export function parseChangesTable(html: string): IndexChange[] {
  const tableMatch = html.match(/<table[^>]*class=["'][^"']*wikitable[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi);
  if (!tableMatch || tableMatch.length < 2) {
    throw new Error(
      "Wikipedia changes parser: changes table not found (expected ≥ 2 wikitables on page)",
    );
  }
  // Per spec — second wikitable is the changes table.
  const tableHtml = tableMatch[1]!;

  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const changes: IndexChange[] = [];

  for (const row of rowMatches) {
    const cells = [...row[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (c) => stripHtml(c[1]!),
    );
    // Data rows have either 5 or 6 cells (some have a Reason cell, some don't).
    // Skip header rows (typically have <th> tags only — those become "Date",
    // "Added" etc. as text cells which we filter by date-parse).
    if (cells.length < 5) continue;

    const dateIso = parseWikiDate(cells[0]!);
    if (dateIso === null) continue;

    const addedTicker = cells[1]!.trim();
    const addedName = cells[2]!.trim();
    const removedTicker = cells[3]!.trim();
    const removedName = cells[4]!.trim();
    const reason = cells.length >= 6 ? cells[5]!.trim() : null;

    changes.push({
      date: dateIso,
      added: addedTicker
        ? { ticker: addedTicker, name: addedName }
        : null,
      removed: removedTicker
        ? { ticker: removedTicker, name: removedName }
        : null,
      reason: reason && reason.length > 0 ? reason : null,
    });
  }

  if (changes.length === 0) {
    throw new Error(
      "Wikipedia changes parser: no rows extracted; table layout may have changed",
    );
  }
  return changes;
}

/**
 * Build the per-date membership history by applying the changes
 * table IN REVERSE to the current constituents.
 *
 * Going backward in time across change C with date D:
 *   - If C.added is non-empty, that ticker WASN'T in the index before
 *     D, so remove it from the running set.
 *   - If C.removed is non-empty, that ticker WAS in the index before
 *     D, so add it back to the running set.
 *
 * Output is sorted ascending by `effectiveFrom`, suitable for
 * `membersAt` binary search.
 */
export function buildMembershipHistory(
  currentConstituents: ReadonlyArray<string>,
  changes: ReadonlyArray<IndexChange>,
): Membership[] {
  const today = new Date().toISOString().slice(0, 10);
  const members = new Set<string>(currentConstituents);
  const history: Membership[] = [
    { effectiveFrom: today, members: new Set(members) },
  ];

  // Reverse-chronological iteration; the result is built in
  // descending order then reversed at the end for ascending.
  const sortedDesc = [...changes].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  for (const change of sortedDesc) {
    if (change.added) members.delete(change.added.ticker);
    if (change.removed) members.add(change.removed.ticker);
    // The reverted set was effective AT START OF DAY on `change.date`
    // (technically the day before, but for backtest purposes the day
    // of the change is the right boundary — see spec §9 open
    // question 1).
    history.push({
      effectiveFrom: change.date,
      members: new Set(members),
    });
  }

  history.sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  );
  return history;
}

/**
 * Binary-search lookup: which members were in the index at this
 * ISO date? Returns null when the date precedes the earliest
 * recorded membership snapshot — we don't know what the index
 * looked like before then.
 */
export function membersAt(
  history: ReadonlyArray<Membership>,
  date: string,
): Set<string> | null {
  if (history.length === 0) return null;
  if (date < history[0]!.effectiveFrom) return null;
  // Find the latest entry whose effectiveFrom ≤ date
  let lo = 0;
  let hi = history.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (history[mid]!.effectiveFrom <= date) lo = mid;
    else hi = mid - 1;
  }
  return history[lo]!.members;
}

/**
 * Fetch the live Wikipedia page and return the parsed changes
 * table. Single shared fetch with the existing
 * `parseSp500FromWikipedia` would be more efficient; left as a v2
 * optimization.
 */
export async function fetchChangesFromWikipedia(
  fetchImpl: typeof fetch = fetch,
): Promise<IndexChange[]> {
  const response = await fetchImpl(WIKIPEDIA_URL, {
    headers: {
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
  return parseChangesTable(html);
}

// ─── Helpers ─────────────────────────────────────────────────────

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

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04",
  jun: "06", jul: "07", aug: "08", sep: "09", sept: "09",
  oct: "10", nov: "11", dec: "12",
};

/**
 * Parse Wikipedia's varied date formats:
 *   "March 17, 2024"
 *   "Mar 17, 2024"
 *   "2024-03-17"
 *   "17 March 2024"
 *
 * Returns ISO YYYY-MM-DD or null when the input doesn't look like
 * a date — the caller skips non-date rows (header rows, etc.) on
 * a null return.
 */
export function parseWikiDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO format
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;

  // "Month DD, YYYY"
  const usMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (usMatch) {
    const month = MONTHS[usMatch[1]!.toLowerCase()];
    if (!month) return null;
    return `${usMatch[3]}-${month}-${usMatch[2]!.padStart(2, "0")}`;
  }

  // "DD Month YYYY"
  const euMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (euMatch) {
    const month = MONTHS[euMatch[2]!.toLowerCase()];
    if (!month) return null;
    return `${euMatch[3]}-${month}-${euMatch[1]!.padStart(2, "0")}`;
  }

  return null;
}
