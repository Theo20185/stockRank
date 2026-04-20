# StockRank

A personal S&P 500 ranking + fair-value explorer for a value-tilted defensive
strategy: diversified across industry groups, concentrated in best-in-class
names within them.

**Live:** https://theo20185.github.io/stockRank/

---

## What it does

1. **Nightly ingest** pulls fundamental + quote data for the S&P 500 from
   Yahoo Finance, normalizes it (FX-converts foreign reporting currencies),
   and writes a single JSON snapshot.
2. **Ranking engine** runs against the snapshot — quality-floor eligibility,
   per-factor percentile within industry group, weighted-category composite,
   plus a separate turnaround watchlist for fallen blue-chips that no
   backward-looking ranker would surface.
3. **Fair-value module** computes a peer-cohort fair-value range (three
   anchors × three valuation metrics) with a confidence flag, useful as
   exit-target and covered-call-strike anchors.
4. **Static web UI** loads the snapshot, shows the ranked table with industry
   filter and drill-down, and lets you tune the category weights live in
   the browser to see how the ranks change.

The detailed methodology lives in [`docs/specs/`](./docs/specs/) — start with
[PLAN.md](./PLAN.md) for the index.

## Architecture

```
stockRank/
├── PLAN.md                         project index
├── docs/specs/                     methodology specs
│   ├── financial-api.md            FMP API surface (legacy provider)
│   ├── ingestion.md                snapshot schema + orchestrator
│   ├── ranking.md                  composite + turnaround
│   ├── fair-value.md               three-anchor fair-value method
│   └── validation/                 case-study acceptance tests
├── packages/
│   ├── core/                       domain types
│   ├── ranking/                    pure ranking + fair-value engine
│   └── data/                       providers + ingest CLI
│       ├── fmp/                    FMP /stable/ provider
│       ├── yahoo/                  Yahoo provider (default)
│       ├── universe/               S&P 500 list + Wikipedia refresh
│       └── ingest/                 orchestrator + CLI
├── apps/web/                       Vite + React static site → GH Pages
├── public/data/                    committed snapshots (UI loads these)
├── tests/fixtures/                 captured API fixtures
└── .github/workflows/              CI: test + build + deploy on push
```

The web app is provider-agnostic — it consumes only the snapshot JSON.
Adding a new provider means implementing `MarketDataProvider` in
`packages/data/`; nothing in the ranking engine or UI changes.

## Quick start

```bash
# Install
npm install

# Run all tests
npm test

# Run an ingest (default: Yahoo, full S&P 500, ~10 minutes)
npm run ingest

# Smaller smoke test
npm run ingest -- --symbols INTC,TGT,MSFT,AAPL --throttle 500

# Use FMP instead (requires FMP_API_KEY in .env)
npm run ingest -- --provider fmp

# Refresh the S&P 500 universe from Wikipedia
npm run universe:refresh --workspace=@stockrank/data

# Run the web app locally against the latest committed snapshot
npm run dev --workspace=@stockrank/web
# → http://localhost:5173/stockRank/
```

## Test discipline

Every change ships with tests — see [PLAN.md §5](./PLAN.md). Currently
**118 tests across 20 files** (Vitest + React Testing Library + MSW).
Acceptance criteria for the ranking engine are pinned to three real
historical entries (NVO, TGT, INTC) in
[`docs/specs/validation/case-study-2026-04-20.md`](./docs/specs/validation/case-study-2026-04-20.md).

## Deployment

Push to `master` triggers
[`deploy-pages.yml`](./.github/workflows/deploy-pages.yml):

1. `npm ci`
2. `npm test`
3. `npm run build --workspace=@stockrank/web`
4. Upload `apps/web/dist` (which includes the snapshot from `public/data/`)
5. Deploy to GitHub Pages

The site is served at https://theo20185.github.io/stockRank/. The Vite
`base` is `/stockRank/` for project-pages routing.

## Known limitations

- **Yahoo's ToS**: the public Yahoo Finance endpoints we consume aren't
  officially licensed for commercial use; this repo is for personal
  research only. See the project memory on API coverage gaps for context.
- **FMP free tier**: per-day request quota is exhausted by ~one full S&P
  500 ingest. Yahoo is the default provider for that reason.
- **Foreign tickers in the index**: the S&P 500 itself is all
  US-domiciled; foreign ADRs you ingest manually (e.g., NVO via
  `--symbols NVO`) get FX-converted from country-inferred reporting
  currency to the listing's quote currency at ingest time.
- **`FISV` ticker**: was renamed to `FI`; the Wikipedia universe still
  shows the stale ticker. Re-running `npm run universe:refresh` will pick
  up the rename whenever Wikipedia updates.

## License

MIT — see [LICENSE](./LICENSE).
