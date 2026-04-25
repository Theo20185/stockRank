# Spec: Point-in-time S&P 500 universe (Phase 2b)

**Status:** draft v1 — addresses the survivorship-bias caveat in
`backtest.md` §3.6 and the H11 re-verification trigger in
`ranking.md` §11.7.

## 1. Why

Today's S&P 500 list silently excludes companies that went
bankrupt, were acquired, or were dropped from the index. Running
the back-test over today's list inflates forward returns by an
unknown amount (literature: ~1–2% per year) and biases the
legacy-rule audit's H11 verdict — the Quality-floor-failed cohort
is artificially boosted because the worst floor failures (the ones
that *actually went bankrupt*) are invisible.

Phase 2b builds a per-date S&P 500 membership map so the back-test
universe at date T is **the constituents of the S&P 500 as of T**,
not as of today. Delisted/acquired names get their actual realized
return (often -100% or a takeover price) included in the
aggregates.

This unlocks the H11 re-verification trigger in `ranking.md` §11.7
(combined-floor decision held pending a survivorship-clean rerun).

## 2. Data source

**Wikipedia "List of S&P 500 companies"** has two relevant tables:

1. **Current constituents** — the table we already parse via
   `packages/data/src/universe/wikipedia.ts`.
2. **"Selected changes to the list"** — a structured table of
   additions and removals, typically going back ~25+ years. Each
   row has: Date, Added (ticker, security), Removed (ticker,
   security), Reason.

We use **table 2** to back-construct historical membership by
applying changes in reverse from the current constituents.
Single-fetch design — no per-date page-revision scraping needed.

### Why this approach over per-revision scraping

Two alternatives considered:

| Approach | Pros | Cons | Decision |
|---|---|---|---|
| **Scrape changes table** (chosen) | Single fetch; structured data; ~25 years of history; survives Wikipedia's HTML drift better than sub-element scraping | Depends on Wikipedia's editorial completeness — a missed change row corrupts every prior-date set | **chosen** — cheapest path that gets us to a usable v1 |
| Scrape per-revision page snapshots | Independent of editorial completeness; matches the page exactly as it appeared on each date | Hundreds of fetches; rate-limited; HTML format drift across revisions; orders of magnitude more code | rejected for v1 — revisit if changes-table approach has gaps |
| Use a vendor index history (Bloomberg, FactSet) | Authoritative, machine-validated | Expensive subscriptions; not available to a personal project | out of scope |

If the changes-table approach later shows gaps (we'll catch them in
v1 by spot-checking a few known historical events), a v2 falls
back to the per-revision approach for the gap windows only.

## 3. Algorithm

```
buildHistoricalMembership(today's constituents, changes table):
  members = set(today's constituents tickers)
  perDateMembership = { today: copy(members) }

  // Apply changes in REVERSE chronological order
  for change in changes.sortedBy(date, descending):
    // Going backward in time:
    //   if `added` was in current: it WASN'T a member before this date → remove
    //   if `removed` was NOT in current: it WAS a member before this date → add
    if change.added is non-empty:
      members.remove(change.added)
    if change.removed is non-empty:
      members.add(change.removed)
    perDateMembership[change.date - 1day] = copy(members)

  return perDateMembership
```

`perDateMembership` becomes a sorted-by-date list of
`(effectiveFrom, members)` tuples. `membersAt(date)` does a binary
search for the most recent tuple whose `effectiveFrom ≤ date`.

### Edge cases

- **Same-day add and remove** (typical: replacement of one company
  by another). Apply remove first, then add. The order matters at
  the boundary tick but not for any backtest date that's at-most
  the day before.
- **Missing add or remove** (additions list a company without a
  paired removal — index expansion or correction). Treat as
  asymmetric: add reduces membership going backward, remove
  increases it.
- **Same ticker, different company.** Wikipedia tracks ticker
  changes separately in a "Recent changes" subsection. v1 ignores
  ticker changes — a ticker is identified by its current symbol
  string. Document the limitation.
- **Companies with two share classes** (BRK.A vs BRK.B,
  GOOGL/GOOG). Wikipedia's changes table doesn't always
  distinguish; v1 treats them as separate tickers per the existing
  parser convention.

## 4. Module layout

New module: `packages/data/src/universe/wikipedia-history.ts`.

```ts
export type IndexChange = {
  /** ISO YYYY-MM-DD effective date of the change. */
  date: string;
  added: { ticker: string; name: string } | null;
  removed: { ticker: string; name: string } | null;
  reason: string | null;
};

export type Membership = {
  /** ISO date — first date this member set is in effect. */
  effectiveFrom: string;
  members: Set<string>;
};

/** Parse the "Selected changes to the list" table from the same
 * Wikipedia HTML the existing parser consumes. Stops at the first
 * row whose date format is unparseable — Wikipedia's table tail
 * sometimes includes non-row content. */
export function parseChangesTable(html: string): IndexChange[];

/** Build the per-date membership history by applying the changes
 * table in reverse to the current constituents set. */
export function buildMembershipHistory(
  currentConstituents: ReadonlyArray<string>,
  changes: ReadonlyArray<IndexChange>,
): Membership[];

/** Binary-search lookup: which members were in the index at this
 * ISO date? Returns null when the date precedes the earliest
 * recorded change (we don't know the membership before that). */
export function membersAt(
  history: ReadonlyArray<Membership>,
  date: string,
): Set<string> | null;
```

### Cache layout

```
tmp/sp500-history/
  current-constituents.json    # symbol[]
  changes.json                 # IndexChange[]
  fetched-at.txt               # ISO timestamp
```

Refresh policy: weekly TTL (Wikipedia changes are infrequent and a
stale cache is safer than re-scraping). `--refresh-history` flag
on the backtest CLI to force a re-fetch.

## 5. Backtest integration

`scripts/backtest-ic.ts` gains a flag `--point-in-time` (off by
default for backwards-compat). When enabled:

1. Load `Membership[]` from the cache (or fetch).
2. For each backtest date T in `usableDates`:
   - Resolve `members = membersAt(history, T)`.
   - Filter the universe-snapshot building loop: skip symbols not
     in `members` (they weren't in the index at T).
   - For symbols in `members` that we have no snapshot/history for
     (delisted), record them as "delisted" with realized return
     -100% (or, when known, the takeover/bankruptcy outcome — out
     of scope for v1, treat as -100% with a flag).
3. Forward-return lookups still use `priceAtOrAfter` against the
   cached chart history. For delisted names the chart simply has
   no bars past the delisting date — `priceAtOrAfter` returns null
   and the observation is dropped, BUT we add a synthetic
   observation at the delisted-cohort level so the H11 audit sees
   the bankruptcy outcomes.

### Two parallel verdicts, not one

To make the survivorship-bias delta visible, the IC pipeline runs
**twice** when `--point-in-time` is set:
- Once with today's universe (the existing biased baseline).
- Once with the point-in-time universe.

Both reports archive side-by-side. The H11/H12 verdicts get a
`bias` annotation indicating which run produced them. Comparing
the two quantifies the survivorship effect for the user — exactly
the kind of visibility `backtest.md` §3.6 promised but couldn't
deliver until now.

## 6. Test strategy

- **Unit tests** (`packages/data/src/universe/wikipedia-history.test.ts`):
  - `parseChangesTable` against a fixture HTML snippet — assert
    expected `IndexChange[]` shape, including a same-day
    add/remove pair and a row with empty-string fields.
  - `buildMembershipHistory` against a tiny synthetic input —
    e.g., 5 current constituents + 3 changes, assert the historical
    member sets match by hand-verification.
  - `membersAt` boundary cases: exact-effective-date hit, between
    two effective dates, before earliest recorded change (returns
    null), after today's date (returns the current constituents).
- **Integration test** (`packages/data/src/universe/wikipedia-history.integration.test.ts`,
  marked `it.skipIf(!process.env.RUN_INTEGRATION)`):
  - Fetch the live page; assert ≥ 200 IndexChange rows recovered;
    assert 1995-12-31 lookup returns ≥ 400 tickers (sanity check
    on coverage going back).
  - Spot-check known historical events: e.g., LEH was in the index
    on 2008-09-14, Enron was in the index on 2001-12-01, T (AT&T)
    was in the index on 2005-01-01.
- **Backtest run smoke test**: re-run the 2026-04-25 IC pipeline
  with `--point-in-time` on a 50-symbol subset. Assert that
  delisted names appear in the H11 failed-cohort with realized
  return -100%.

## 7. Phase ordering

Phase 2b lands in two PRs:

**PR 1 — Scraper + cache + tests.**
- New `wikipedia-history.ts` module.
- Per-date membership lookup.
- Unit tests + integration test.
- No changes to backtest pipeline yet — purely new infrastructure.

**PR 2 — Backtest integration + re-run.**
- `scripts/backtest-ic.ts` `--point-in-time` flag.
- Side-by-side biased / unbiased reports.
- Run on full S&P 500 with both views.
- Archive results; produce a follow-up
  `docs/specs/backtest-actions-<date>.md` comparing the two
  verdicts on the four hypotheses (especially H11).

If PR 2's results re-confirm H11=fail under the unbiased view, the
Quality-floor decision in `ranking.md` §11.7 unblocks and a
follow-up PR drops or weakens the floor. If the unbiased view
flips H11 to pass, the floor stays — that's the survivorship-bias
effect we feared, and the spec wins.

## 8. Out of scope

- **Pre-Wikipedia history.** Wikipedia's changes table goes back
  to roughly 1995–2000 depending on completeness. Earlier history
  would need a different source (CRSP, vendor data) and is not
  worth the complexity for a personal project.
- **Take-out price recovery for delisted names.** v1 treats every
  delisted name as -100% realized return. In reality some were
  acquired at a premium. A v2 that pulls actual takeout prices
  (Wikipedia footnotes, SEC filings) would be more accurate but is
  a substantial scope expansion.
- **Other indices.** This spec is S&P 500 only. The same pattern
  works for Russell 1000, NASDAQ-100 etc. but no current need.

## 9. Open questions

1. **What's the right `effectiveFrom` semantics?** When Company A
   replaces Company B on 2010-03-15, was A "in" or "out" on
   2010-03-15 itself? Wikipedia is inconsistent on this. v1
   convention: `effectiveFrom = change.date`, meaning the new
   member set takes effect at start-of-day on the change date.
   Document and move on; the edge case affects ≤ 1 snapshot per
   change.
2. **Cache-staleness alarm.** The `tmp/sp500-history/` cache has a
   weekly TTL but no built-in alarm if a fetch later reveals new
   changes that the existing membership history didn't include.
   v1 always re-builds membership from the freshest cache; v2
   could compute a checksum and warn on diff.
3. **Backtest CLI default.** `--point-in-time` is off by default
   in v1 to preserve the existing CLI behavior. Once we're
   confident in the scraper (3+ archived runs, no surprise
   regressions), promote it to default-on and add an `--allow-
   biased` opt-out for users who want the legacy behavior.
