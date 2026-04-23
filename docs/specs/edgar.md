# Spec: EDGAR XBRL — fundamentals data source

**Status:** active. Replaces Yahoo's `fundamentalsTimeSeries` as the
authoritative source for annual + quarterly fundamentals. Validated
against AAPL FY2025: 17 of 18 fields match the prior Yahoo snapshot to
the cent (the 18th, interest expense, is missing on both sides — Apple
stopped breaking it out as a line item post-2023).

## 1. Why EDGAR

Yahoo's free `fundamentalsTimeSeries` returns at most ~6 quarters of
historical fundamentals — far too shallow for proper TTM
reconstruction at past dates (you can derive only ~1-2 historical TTM
points from 6 quarters). This made the FV-trend sparkline diverge
from the production FV bar by 30%+ on a meaningful tail of names
(SO, AEE, TKO, KHC, WBD).

EDGAR is the source of truth that Yahoo and FMP both repackage:
companies file 10-Q and 10-K reports directly with the SEC, tagged in
XBRL using standardized US-GAAP concepts. The `companyfacts` endpoint
returns every value a company has ever filed for every concept, going
back to ~2009 when XBRL tagging was mandated.

For AAPL specifically, EDGAR returns:

| Concept                   | Annual depth | Quarterly depth |
|---------------------------|--------------|-----------------|
| EPS, NetIncome, OpIncome  | ~18 years    | ~53 quarters    |
| Cash, Equity              | ~18 years    | ~50+ quarters   |
| OCF, Capex                | ~12 years    | ~26 quarters    |
| D&A (for EBITDA recon)    | ~10 years    | ~14 quarters    |

That's ~50 historical TTM points vs Yahoo's ~2 — enough to support a
real multi-year sparkline using the same TTM derivation production
uses today.

## 2. API

- **Endpoint:** `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`
  - `{cik}` is the 10-digit zero-padded CIK (e.g. `CIK0000320193` for AAPL)
- **Auth:** none — but **a User-Agent header is required** by the SEC's
  fair-access policy. Format: `<App> <contact-email>`. Without it,
  EDGAR returns 403.
- **Rate limit:** 10 requests / second per source IP. We throttle to
  one request every ~110 ms with a small jitter buffer.
- **Response size:** ~1-5 MB per company (full historical XBRL panel).
  AAPL is ~3.6 MB.
- **Cost:** $0.

## 3. Concept extraction

Each XBRL fact has shape:

```json
{
  "end":   "2025-09-27",     // period-end date (ISO)
  "start": "2024-09-29",     // period-start date (only for flow concepts)
  "val":   416161000000,     // raw numeric value
  "fy":    2025,
  "fp":    "FY",             // "FY" | "Q1" | "Q2" | "Q3" | "Q4" | null
  "form":  "10-K",
  "filed": "2025-11-03"
}
```

A concept's `units` map keys by unit (e.g., `USD`, `USD/shares`, `shares`).

### 3.1 Direct GAAP tags (single concept)

| Engine field             | XBRL concept                                         |
|--------------------------|------------------------------------------------------|
| `epsDiluted`             | `EarningsPerShareDiluted` (unit `USD/shares`)        |
| `netIncome`              | `NetIncomeLoss`                                      |
| `sharesDiluted`          | `WeightedAverageNumberOfDilutedSharesOutstanding`    |
| `operatingIncome` / `ebit` | `OperatingIncomeLoss`                              |
| `interestExpense`        | `InterestExpense`                                    |
| `grossProfit`            | `GrossProfit` (or compute from revenue − COGS)       |
| `cash`                   | `CashAndCashEquivalentsAtCarryingValue`              |
| `totalCurrentAssets`     | `AssetsCurrent`                                      |
| `totalCurrentLiabilities`| `LiabilitiesCurrent`                                 |
| `totalEquity`            | `StockholdersEquity`                                 |
| `operatingCashFlow`      | `NetCashProvidedByUsedInOperatingActivities`         |
| `capex`                  | `PaymentsToAcquirePropertyPlantAndEquipment`         |
| `buybacks`               | `PaymentsForRepurchaseOfCommonStock`                 |

### 3.2 Fallback chains (try concepts in order)

| Engine field    | Chain                                                                                         |
|-----------------|----------------------------------------------------------------------------------------------|
| `revenue`       | `RevenueFromContractWithCustomerExcludingAssessedTax` (post-2018) → `Revenues` → `SalesRevenueNet` |
| `dividendsPaid` | `PaymentsOfDividends` → `PaymentsOfDividendsCommonStock` (the latter is a narrower / partially-deprecated variant for some filers) |
| `costOfRevenue` (for grossProfit fallback) | `CostOfRevenue` → `CostOfGoodsAndServicesSold`                  |

### 3.3 Reconstructed metrics

| Engine field     | Construction                                                                                                            |
|------------------|------------------------------------------------------------------------------------------------------------------------|
| `ebitda`         | `OperatingIncomeLoss + DepreciationDepletionAndAmortization` (D&A chain: `DepreciationDepletionAndAmortization` → `DepreciationAndAmortization` → `Depreciation`) |
| `freeCashFlow`   | `OperatingCashFlow − abs(Capex)`                                                                                        |
| `totalDebt`      | `LongTermDebt` if present (already total of current + noncurrent), else `LongTermDebtNoncurrent + LongTermDebtCurrent`. Plus `CommercialPaper` (or `ShortTermBorrowings` fallback) for short-term debt. |

### 3.4 Sign-convention normalization

EDGAR reports `PaymentsToAcquirePropertyPlantAndEquipment` as a
positive number (the magnitude of cash spent). Our snapshot schema
treats `capex` as a cash-flow outflow (negative). Mapper flips the
sign: `capex = -abs(edgar.capex)`.

### 3.5 Period selection (dedupe)

A single (concept, period-end) pair can have multiple facts —
restatements, 10-K/A amendments, or facts that appear in both a
10-Q and the subsequent 10-K. The mapper keeps the **latest filed**
fact per `(concept, end-date, fp)` triple. This matches what
production engines like Yahoo/FMP report.

## 4. CIK lookup

SEC publishes `https://www.sec.gov/files/company_tickers.json` —
flat ticker → CIK table for every SEC-registered entity. We bake
the S&P 500 subset into `packages/data/src/edgar/cik-lookup.json`
at refresh time. Refresh CLI: `npm run refresh-cik`.

Ticker normalization rules:
- Class shares like `BRK.B` → SEC reports as `BRK-B`. Try both.
- Dual-class issuers (`GOOG` + `GOOGL`) share a CIK; both map to
  Alphabet (1652044).
- Some S&P 500 names have no CIK (foreign-domiciled). For those we
  fall back to the prior Yahoo path or accept a missing-fundamentals
  error.

## 5. Cache layout

```
tmp/edgar-cache/
  AAPL/
    facts.json         # raw EDGAR companyfacts response
    fetched-at.txt     # ISO timestamp of the fetch
```

**Refresh policy:** the fetcher reads from cache when the cache is
≤ `EDGAR_CACHE_TTL_HOURS` (24h by default). Older than that → re-fetch.
The `--refresh` flag bypasses cache entirely.

The cache is in `tmp/` (gitignored) — local only, rebuilt on demand.

## 6. Division of labor with Yahoo

EDGAR replaces Yahoo's `fundamentalsTimeSeries`. Yahoo continues to
serve everything else:

| Need                          | Source       | Why                                                |
|-------------------------------|--------------|----------------------------------------------------|
| Current quote (price, volume) | Yahoo        | Real-time market data, not in 10-Q filings         |
| 52-week high / low            | Yahoo        | Market data                                        |
| Period-end / FY-range prices  | Yahoo `chart`| Market data — used for `priceAtYearEnd`, etc.      |
| Industry / sector             | Yahoo profile| Not in filings (SIC code is, but Yahoo's mapping is friendlier) |
| Forward EPS                   | Yahoo        | Analyst consensus, not a filing                    |
| TTM ratios (PE, EV/EBITDA…)   | Yahoo        | Authoritative current TTM from quoteSummary        |
| Annual + quarterly fundamentals | **EDGAR**  | Goes back to ~2009 vs Yahoo's 6 quarters           |

## 7. Failure modes

| Failure                          | Engine behavior                                                       |
|----------------------------------|----------------------------------------------------------------------|
| EDGAR 403 (no User-Agent)        | Throw — programmer error, configuration must include the header       |
| EDGAR 404 (CIK not found)        | Report through `ErrorReporter`, skip symbol's fundamentals; engine still gets quote/profile from Yahoo |
| EDGAR 429 (rate limit)           | Retry with backoff up to 3 times, then surface error                  |
| Missing concept (e.g., no D&A reported) | EBITDA stays null; downstream engine falls back to OpIncome-as-EBITDA proxy or simply has fewer anchors |
| Cache write failure              | Log + continue (cache is best-effort)                                 |

## 8. Historical reconstruction (FV-trend sparkline)

The FV-trend sparkline on the stock-detail page reads
`public/data/fv-trend.json`, regenerated by `npm run fv-trend` after
each ingest. Each per-symbol entry's `quarterly` array carries
historical (date, price, fvP25, fvMedian, fvP75) samples.

Two data sources feed it:

| Source | Window | Used for |
|---|---|---|
| **EDGAR + Yahoo monthly chart cache** | Past `HISTORICAL_RECONSTRUCTION_YEARS = 3` years, sampled at quarter ends | Historical depth |
| **Daily snapshot archive** (`public/data/snapshot-YYYY-MM-DD.json`) | Each refresh appends one sample | Most-recent fidelity |

### 8.1 Historical reconstruction

`packages/data/src/edgar/historical.ts` exposes `synthesizeSnapshotAt(facts, bars, date, profile)` — pure function that builds a `CompanySnapshot` as it would have looked on `date`:

1. Filter EDGAR annuals to those public as-of `date − ANNUAL_FILING_LAG_DAYS (90)`.
2. Filter EDGAR quarterlies to those public as-of `date − QUARTERLY_FILING_LAG_DAYS (45)`.
3. Sum the trailing 4 quarterly values (revenue, net income, EPS, EBITDA, FCF, …) → reconstructed TTM.
4. Take the most recent quarterly balance-sheet snapshot (cash, debt, equity).
5. Read price at-or-before `date` from the cached monthly chart bars; derive market cap, EV, TTM ratios.
6. Compute trailing-365d high/low for `quote.yearHigh` / `yearLow`.
7. Apply the same shares-magnitude rescale heuristic the live ingest uses.

`compute-fv-trend` walks every quarter end in (today − 3y, today], synthesizes a snapshot for every S&P 500 symbol at each date, and runs `fairValueFor(subject, syntheticUniverse)` to produce one FV sample per (symbol, date) pair. Same engine code, same data shape — historical samples are byte-comparable to what production *would have* computed at that date.

### 8.2 Snapshot archive supplement

The most recent days come from `public/data/snapshot-YYYY-MM-DD.json` (one per refresh). These supersede any historical reconstruction sample on the same date because they use Yahoo's authoritative current TTM directly rather than reconstructing.

### 8.3 Chart-bar cache

The Yahoo provider already fetches 6 years of monthly chart bars (close + high + low) per symbol on every ingest. `chart-cache.ts` persists those bars to `tmp/chart-cache/{SYMBOL}/monthly.json` so `compute-fv-trend` can read them without re-hitting Yahoo. Cache layout mirrors the EDGAR cache (gitignored, rebuilt on demand).

## 9. Validation

The `tmp/edgar/reconstruct.ts` exploration script (run during the
2026-04-22 design pass) produced the AAPL FY2025 parity result that
motivates this swap. To re-validate at scale, an equivalent script can
walk the full S&P 500 and report per-field, per-symbol diffs against
`public/data/snapshot-latest.json`.
