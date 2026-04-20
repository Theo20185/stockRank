# Spec: Financial Data API (FinancialModelingPrep)

**Status:** verified against the live API on 2026-04-20 using the POC
key. The API was restructured since the POC was written — `/api/v3` is
now **legacy** (requires a subscription predating 2025-08-31), and the
current API lives at `/stable/`. Fixtures from the verification run live
at `tests/fixtures/fmp/probe/`.

## 1. Provider

- **Name:** FinancialModelingPrep
- **Home:** https://financialmodelingprep.com
- **Base URL:** `https://financialmodelingprep.com/stable`
- **Auth:** query-string API key — `?apikey=<KEY>`
- **API key:** `24a34947d96f9db6f9aaf190f9700fdf` (stored in `.env` as
  `FMP_API_KEY` for the ingest CLI; never committed in code; never
  reaches the browser)
- **Convention change from POC:** path param `/ratios-ttm/{symbol}`
  became query param `/ratios-ttm?symbol={symbol}`. Applies across all
  endpoints.

## 2. Tier capabilities (current free tier)

Probed 2026-04-20 with the key above. Captured JSON under
`tests/fixtures/fmp/probe/`.

### 2.1 What works

| Endpoint | Notes |
|---|---|
| `GET /stable/quote?symbol={sym}` | Current quote: price, market cap, day/year range, volume, exchange |
| `GET /stable/profile?symbol={sym}` | Company metadata: name, sector, industry, exchange, beta, last dividend, ISIN/CUSIP |
| `GET /stable/ratios-ttm?symbol={sym}` | Current TTM ratios (margins, turnover, liquidity, valuation) |
| `GET /stable/key-metrics-ttm?symbol={sym}` | Current TTM derived metrics (EV, ROIC, FCF yield, net debt / EBITDA) |
| `GET /stable/income-statement?symbol={sym}&period=annual&limit=5` | **Up to 5 years** of annual IS |
| `GET /stable/balance-sheet-statement?symbol={sym}&period=annual&limit=5` | **Up to 5 years** of annual BS |
| `GET /stable/cash-flow-statement?symbol={sym}&period=annual&limit=5` | **Up to 5 years** of annual CF |
| `GET /stable/ratios?symbol={sym}&period=annual&limit=5` | Historical annual ratios (5 years) |
| `GET /stable/key-metrics?symbol={sym}&period=annual&limit=5` | Historical annual key metrics (5 years) |
| `GET /stable/historical-price-eod/full?symbol={sym}&from={d}&to={d}` | EOD OHLCV over date range |

### 2.2 What's restricted on the free tier

| Endpoint | Status | Impact | Workaround |
|---|---|---|---|
| `/stable/sp500-constituent` | 402 Premium | Can't get the universe from FMP | Scrape Wikipedia's S&P 500 list (public, stable) and commit as `packages/data/src/universe/sp500.json` |
| Quarterly statements with `limit > 5` | 402 Premium | Can't retrieve more than 5 recent quarters | Accept the limit for v1; rely on annual for multi-year analysis |
| Foreign-domiciled tickers (e.g., NVO, TM, SHEL) | 402 Premium on *every* endpoint | Can't get NVO from FMP at all | Out of scope for S&P 500 (all US-domiciled). For user's personal positions held outside the index, accept manual data entry or a secondary source |
| `/api/v3/*` legacy paths | 403 Legacy Endpoint | — | Use `/stable/` |

### 2.3 Observed quirks

- Responses are always arrays. For single-entity endpoints (quote,
  profile, TTM ratios) the array has one element.
- Fiscal periods vary: INTC's FY2025 ended 2025-12-27, TGT's FY2025
  ended 2026-01-31. Always key off the `date` field, not a calendar
  year.
- Tax expense is missing (`--`) for some foreign entities in Fidelity
  data; FMP appears to handle US filers consistently.
- The POC key-name typo `dividendYielTTM` (no 'd') is **fixed** in the
  current API — field is spelled `dividendYieldTTM`. Any mapping code
  must use the corrected name.

## 3. Domain mapping (v1)

For each S&P 500 symbol, the nightly ingest pulls:

| Pull | Endpoint | Cached as |
|---|---|---|
| Profile | `/profile` | `companies.{symbol}.profile` — sector, industry, market cap, exchange |
| Current quote | `/quote` | `companies.{symbol}.quote` — price, 52w range, volume |
| TTM ratios | `/ratios-ttm`, `/key-metrics-ttm` | `companies.{symbol}.ttm` |
| 5Y annual IS/BS/CF | `/income-statement`, `/balance-sheet-statement`, `/cash-flow-statement` (`period=annual&limit=5`) | `companies.{symbol}.annual[]` |
| 5Y annual ratios | `/ratios`, `/key-metrics` (`period=annual&limit=5`) | `companies.{symbol}.annualRatios[]` |
| 1Y price history | `/historical-price-eod/full` (last 365d) | `companies.{symbol}.priceHistory[]` |

Written to `public/data/snapshot-YYYY-MM-DD.json` and
`public/data/snapshot-latest.json`. See `ingestion.md` (todo) for the
full schema.

## 4. Client behavior (v1 implementation)

- **Retry:** up to 5 attempts with exponential backoff (250ms / 500ms /
  1s / 2s / 4s), on 5xx or network errors only. 4xx propagates.
- **Timeout:** 15s per attempt, bounding total attempt cost at ~23s.
- **Rate limiting:** conservative 1 request per 250ms (4 req/s) to stay
  well under any undocumented ceiling. For ~500 symbols × 7 endpoints
  ≈ 3500 requests per run → ~15 min ingest time. Acceptable for nightly.
- **Error signaling:** typed discriminated union
  `Result<T, FmpError>` where `FmpError` distinguishes `PremiumRequired`,
  `NotFound`, `TransientNetwork`, `RateLimited`, `ParseFailure`,
  `Unknown`. Ingest logs and continues on per-symbol failures — one bad
  ticker can't poison the run.
- **Serialization:** typed DTOs per endpoint with strict parsing. Unknown
  fields allowed (FMP adds fields over time); missing known fields
  surface as `undefined` rather than crash.

## 5. Fixtures and testing

- **Probe fixtures** (committed): `tests/fixtures/fmp/probe/` — the
  initial verification run from 2026-04-20. Used to pin DTO shapes.
- **Canonical fixtures** (per test suite): representative responses for
  each endpoint under `packages/data/tests/fixtures/fmp/`. Tests use
  MSW (Mock Service Worker) to serve these fixtures — no live calls
  from unit tests.
- **Live contract tests** (tagged `@live`, opt-in): one test per
  endpoint hitting the real API; runs separately so FMP being down
  doesn't break the normal suite.

## 6. Open questions

1. Universe source — commit a Wikipedia-derived S&P 500 list as a JSON
   file in-repo, or scrape it at ingest time? (Lean toward committed
   file; re-scrape monthly in a separate job.)
2. How often does FMP revise historical statements? If they do,
   snapshot history drifts. Worth spot-checking on a handful of names
   a month into production.
3. Symbol normalization for changed tickers (e.g., `FB` → `META`). Out
   of scope for v1 but noted.
