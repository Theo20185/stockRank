# StockRank — Plan

> Living plan document. Specs live under `docs/specs/`. Update this file as
> decisions are made; link out to specs for the detail.

## 1. Vision

Diversification for its own sake hurts returns. The goal is **diversified
across industry groups, concentrated in the best companies within each
group** — pick the best-in-class name in each vertical rather than spreading
capital across every name.

StockRank supports that thesis by:

1. **Ingesting** fundamental + quote data for the S&P 500 on a nightly
   cadence and caching it locally.
2. **Ranking** those names — within-industry (best of group) and
   cross-industry (relative value across groups) — using a transparent
   composite score we can tune, explain, and regression-test.

## 2. Scope (v1)

**In scope**

- Nightly data pull for the S&P 500 universe (symbol list, quote, fundamental
  ratios, growth metrics).
- Local cache on disk. Append-only history so we can replay and audit.
- Ranking engine producing:
  - Per-industry ranking (best-in-group).
  - Cross-universe ranking (overall composite).
- A small app (CLI or thin UI — see §6) to explore the rankings and drill
  into a single name's drivers.

**Out of scope for v1**

- Real-time quotes / intraday.
- Brokerage integration or order placement.
- Portfolio construction, backtesting, rebalancing.
- Multi-index coverage beyond S&P 500 (NASDAQ/DJIA wiring exists in POC; we
  may keep the abstraction but won't ship UI for it).

## 3. Architecture

Two deployment surfaces, one repo:

- **Local ingest** — runs on this machine on a nightly schedule. Pulls FMP
  data, normalizes it, writes a **public snapshot** committed back to the
  repo. The FMP API key never leaves the local machine.
- **Static web UI** — built from the same repo, deployed to **GitHub
  Pages**. Reads the committed snapshot at runtime, computes rankings
  in-browser, lets the user filter, drill in, and tune scoring weights
  live. No server, no auth, no secrets.

```
stockRank/
├── PLAN.md
├── docs/
│   └── specs/                       ← all behavior specs
│       ├── financial-api.md
│       ├── ingestion.md
│       ├── ranking.md
│       ├── fair-value.md
│       ├── ui.md
│       └── validation/              ← case studies & acceptance tests
│           └── case-study-2026-04-20.md
├── packages/
│   ├── core/                        ← shared domain types (TS)
│   ├── ranking/                     ← pure scoring engine, browser-safe
│   └── data/                        ← FMP client + local ingest CLI (Node)
├── apps/
│   └── web/                         ← Vite + React static site → GH Pages
├── public/
│   └── data/
│       ├── snapshot-latest.json     ← what the UI loads by default
│       └── snapshot-YYYY-MM-DD.json ← dated history for replay/audit
└── .github/
    └── workflows/
        └── deploy-pages.yml         ← builds apps/web, publishes to gh-pages
```

### 3.1 Proposed tech stack

Static-site + local CLI sharing a ranking engine points cleanly at one
language across the whole repo:

- **Language:** **TypeScript** end-to-end. Lets the ranking engine be one
  module imported by both the local CLI (for pre-baking ranks) *and* the
  browser UI (for live weight tuning).
- **Web app:** **Vite + React + TypeScript**, deployed to GitHub Pages
  via a workflow on push to `master`.
- **Ingest CLI:** Node 20 + `tsx` (or compiled `tsc`), HTTP via native
  `fetch`. Run with `npm run ingest` from this machine.
- **Data on disk:** JSON snapshots under `public/data/` (so the deployed
  site fetches them with a relative URL). Dated files preserve history;
  `snapshot-latest.json` is overwritten each run.
- **Tests:** **Vitest** for unit tests (ranking, mappers, utilities),
  **React Testing Library** for component render tests (per the TDD rule
  on UI controls), **MSW** (Mock Service Worker) for HTTP-boundary tests
  on the FMP client.
- **Lint/format:** ESLint + Prettier, default-strict TS config.
- **Scheduling:** Windows Task Scheduler invoking `npm run ingest` from
  the repo path. (Optional later: a `commit-and-push` step so each
  nightly run also publishes the snapshot to the live site.)

**Why not Python for ingest + TS for UI?** It's the obvious split, but
the cost of two test stacks and two ranking engines (or porting the
engine across languages) is higher than the benefit. Single-language
keeps the ranking math testable in one place.

**Why GitHub Pages and not a server?** It's free, public, version-pinned
with the repo, and matches the "small app" scope. The whole UI is read-
only against a JSON snapshot, so a static host is sufficient.

### 3.2 Where ranking runs

The ranking engine is a **pure function**: `(snapshot, weights) → ranks`.
That same function runs in two places:

1. **In the browser**, on every weight change, so the user can tune the
   composite score interactively.
2. **In the ingest CLI** as a final step, producing a *baseline* ranked
   snapshot using the default weights. This means the page is useful on
   first load before any user interaction.

Same code, same tests — only the host differs.

### 3.3 Secrets

The FMP API key stays in a local `.env` file (gitignored). The ingest CLI
reads it; the web app never sees it. The committed snapshot contains only
derived data from FMP responses, no key material.

## 4. Specs

Spec-driven means every behavior has a written contract before it has code.
Initial specs:

| Spec | Status | Purpose |
|------|--------|---------|
| [financial-api.md](docs/specs/financial-api.md) | **verified 2026-04-20** | FMP `/stable/` endpoints we consume, shapes, auth, retry, tier limits. Free tier blocks `sp500-constituent`, foreign tickers, and `limit > 5` on quarterly statements. |
| [ingestion.md](docs/specs/ingestion.md) | todo | Nightly flow: pull universe → pull per-symbol → write cache → validate. Failure/partial-success behavior. |
| [ranking.md](docs/specs/ranking.md) | **draft v2** | Composite score + turnaround watchlist. Multi-year quality floor, cyclicality-aware growth, value-tilted defensive weights. |
| [fair-value.md](docs/specs/fair-value.md) | draft | Three-anchor fair value (peer-median, own-historical, normalized-earnings). Industry × cap-cohort peer set with fallback. Drives target prices and covered-call strikes. |
| [validation/case-study-2026-04-20.md](docs/specs/validation/case-study-2026-04-20.md) | reference | Three real entries (NVO/TGT/INTC) scored against the model. Source of acceptance criteria for the ranking regression tests. |
| [ui.md](docs/specs/ui.md) | todo | Static React UI on GH Pages: ranked table, industry filter, drill-down with factor contributions and fair-value range, live weight tuning. Drafted after ranking stabilizes. |

## 5. TDD Principles

All code is backed by tests. Non-negotiable.

- **Logic changes:** write a test that pins *current* behavior, confirm it
  passes, then write a test for the *new* expected behavior, watch it fail,
  implement, watch it pass. No exceptions for "obvious" changes.
- **Data pipeline / mapping:** every field on a domain object that's
  populated from an API response has a mapping test. Given a representative
  JSON fixture → assert the resulting domain object has the expected values
  on the expected properties. Fixtures live under `tests/**/Fixtures/`.
- **UI controls:** every rendered control has a render test — the control
  appears when expected, shows the expected bound value, and wires its
  action to the expected command. New or changed controls require new or
  updated tests in the same commit.
- **HTTP client:** no live-network calls in unit tests. A mocked handler
  returns canned JSON; live contract tests (tagged, opt-in) run separately
  and can be skipped if FMP is down.

Coverage target: we don't chase a percentage number. The rule is simpler —
**if you can break a behavior without a test failing, the test suite has a
gap and we fix it before shipping.**

## 6. Roadmap

### Phase 0 — Foundations
- [x] Verify the FMP API key works and map current-tier endpoints
      (done 2026-04-20; fixtures in `tests/fixtures/fmp/probe/`).
- [ ] Confirm tech stack (§3.1).
- [ ] Source the S&P 500 universe (Wikipedia → committed JSON) since
      `sp500-constituent` is paid.
- [ ] Scaffold the TS monorepo (`packages/` + `apps/web/`), wire Vitest
      and React Testing Library, get a "hello world" GH Pages deploy
      green.

### Phase 1 — Ingestion MVP (local)
- [ ] Implement `FmpClient` in `packages/data` with retry + typed models
      (TDD with MSW). DTOs match the verified `/stable/` shapes.
- [ ] Implement snapshot writer (TDD).
- [ ] Ingest CLI: walks the S&P 500 list → per-symbol profile / quote /
      ratios-ttm / key-metrics-ttm / 5Y annual statements / 1Y price
      history → writes `public/data/snapshot-latest.json` and the dated
      file.
- [ ] Doc: how to register the nightly job in Windows Task Scheduler;
      decide whether the job auto-commits the snapshot.

### Phase 2 — Ranking v1
- [x] Finalize `ranking.md` factor list, weights, bucket (draft v2 done).
- [ ] Implement `packages/ranking` as a pure module. Synthetic-fixture
      unit tests + golden-file regression. Acceptance criteria from
      `validation/case-study-2026-04-20.md` (NVO/TGT top-quartile;
      INTC on turnaround watchlist).
- [ ] Wire ranking into the ingest CLI to bake a default-weights ranking
      into the snapshot.

### Phase 2.5 — Fair Value
- [ ] Implement `packages/ranking/fairValue` per `fair-value.md`. Three
      anchors × three valuation metrics; cohort fallback rules;
      confidence flag.
- [ ] Regression: NVO median in $60–80, TGT median in $110–140, INTC
      median in $35–65 with `confidence: low`.

### Phase 3 — Web UI v1 (GH Pages)
- [ ] Layout: ranked table (sortable), industry filter, ticker drill-down
      panel showing per-factor contributions and fair-value range.
- [ ] Turnaround watchlist as a separate panel/tab.
- [ ] `% off 52w high` opportunity column on the main table.
- [ ] Live weight controls: sliders that re-rank in-browser and re-sort.
- [ ] Deploy via `.github/workflows/deploy-pages.yml`.
- [ ] Render tests for every interactive control.

### Phase 4 — Exploration & iteration
- [ ] Tune the composite score against user intuition; iterate on
      fair-value confidence calibration once we have weeks of snapshots.
- [ ] Optional: enrich with non-FMP data (Yahoo / Fidelity) through a
      dedicated enrichment step in the local ingest. Particularly
      needed for foreign-domiciled positions blocked by FMP free tier.
- [ ] Optional: snapshot history view (compare two dates).
- [ ] Optional: covered-call strike helper using fair-value targets
      (would still need an options-chain data source).

## 7. Known risks / open questions

- **FMP free-tier limits** (confirmed). `sp500-constituent` is paid, so
  the universe must come from a Wikipedia scrape committed to the repo.
  Quarterly statements are capped at 5 most-recent, so historical TTM
  reconstruction at past entry dates is not possible from FMP alone —
  acceptable for nightly forward-looking ingest, but means we can't
  re-create old snapshots.
- **Foreign-domiciled tickers** (e.g., NVO) are blocked entirely on the
  FMP free tier. Fine for the S&P 500 universe (all US-listed), but if
  the user wants non-S&P personal positions ranked, we need a secondary
  source (Fidelity export or Yahoo scrape).
- **FMP free-tier limits — two flavors, both accepted as gaps:**
  1. **Per-symbol premium gates (HTTP 402)** — LLY, PG observed;
     foreign-domiciled tickers blocked entirely.
  2. **Daily request quota (HTTP 429)** — exhausts after roughly one
     full S&P 500 ingest attempt (~5,000 requests). Retries don't help;
     the entire API returns 429 until reset.

  **Decision (2026-04-20): accept both** until we source a replacement
  API. The committed snapshot will be partial (typically the most popular
  ~50–200 names). Don't run the full ingest more than once per day.
  Worth evaluating alternative APIs (Polygon, Alpha Vantage, IEX,
  Twelve Data, EODHD) before building piecemeal fallbacks.
- **Composite design cyclicality.** The TGT validation showed naive 5Y
  CAGR penalizes any retailer measured trough-to-peak. Ranking spec now
  uses 7Y CAGR + peer-relative percentile. Re-evaluate after we have
  real data.
- **Turnaround lane scope.** INTC validated that no backward-looking
  ranker can flag a forward-looking turnaround. The watchlist surfaces
  candidates; the user does the catalyst analysis. Don't try to
  quantify what the model can't see.
- **Data from non-API sources.** Yahoo / Fidelity / Google Finance
  don't have clean public APIs. If we pull from them in Phase 4, pick
  a scraping strategy that is resilient and legal (public pages,
  reasonable rate, respect robots.txt).

## 8. How we work

- Every change lands with tests.
- Specs change first, code follows. If the code has to change but the spec
  doesn't — check whether the spec was actually complete.
- Small, focused commits. Each commit leaves the suite green.
- This PLAN.md is the index. When a section grows past one screen, split it
  into its own file under `docs/` and link from here.
