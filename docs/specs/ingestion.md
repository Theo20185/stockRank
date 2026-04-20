# Spec: Ingestion

**Status:** draft v1. Implements the nightly local pipeline that
populates `public/data/snapshot-*.json` for the static UI.

## 1. Purpose

Pull all FMP data the ranking + fair-value modules need, normalize it
into our domain `Snapshot` shape, and write it to disk in a form the
web UI can fetch directly.

The pipeline is **local only**. The FMP API key never leaves this
machine; the committed snapshot contains only derived data.

## 2. Snapshot schema

Domain types live in `@stockrank/core`. The on-disk JSON exactly
mirrors these types.

```ts
type Snapshot = {
  schemaVersion: 1;
  snapshotDate: string;           // ISO date "YYYY-MM-DD"
  generatedAt: string;            // ISO datetime
  source: "fmp-stable";
  universeName: "sp500";
  companies: CompanySnapshot[];
  errors: SnapshotError[];        // per-symbol failures, never throw the whole run
};

type CompanySnapshot = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  exchange: string;
  marketCap: number;

  quote: {
    price: number;
    yearHigh: number;
    yearLow: number;
    volume: number;
    averageVolume: number;
  };

  ttm: {
    peRatio: number | null;
    evToEbitda: number | null;
    priceToFcf: number | null;
    priceToBook: number | null;
    dividendYield: number | null;
    currentRatio: number | null;
    netDebtToEbitda: number | null;
    roic: number | null;
    earningsYield: number | null;
    fcfYield: number | null;
    enterpriseValue: number | null;
    investedCapital: number | null;
  };

  annual: AnnualPeriod[];          // most recent first; up to 5 years

  // Convenience derivation, computed at ingest time so the UI doesn't need
  // to recompute it on every weight change. % below the trailing 12-month
  // high closing price.
  pctOffYearHigh: number;
};

type AnnualPeriod = {
  fiscalYear: string;              // "2025"
  periodEndDate: string;           // ISO "2025-12-27"
  filingDate: string | null;
  reportedCurrency: string;

  income: {
    revenue: number | null;
    grossProfit: number | null;
    operatingIncome: number | null;
    ebit: number | null;
    ebitda: number | null;
    interestExpense: number | null;
    netIncome: number | null;
    epsDiluted: number | null;
    sharesDiluted: number | null;
  };

  balance: {
    cash: number | null;
    totalCurrentAssets: number | null;
    totalCurrentLiabilities: number | null;
    totalDebt: number | null;
    totalEquity: number | null;
  };

  cashFlow: {
    operatingCashFlow: number | null;
    capex: number | null;
    freeCashFlow: number | null;
    dividendsPaid: number | null;
    buybacks: number | null;
  };

  ratios: {
    roic: number | null;
    netDebtToEbitda: number | null;
    currentRatio: number | null;
  };
};

type SnapshotError = {
  symbol: string;
  endpoint: string;                // which FMP call failed
  message: string;
};
```

Numeric fields are nullable because FMP can return `null`/`--` for
missing data, and our parser surfaces that rather than coercing to 0
(which would silently distort downstream math).

## 3. Pipeline

```
load universe (committed JSON)
  └─► for each symbol (sequential, throttled):
        └─► fetch profile, quote, ratios-ttm, key-metrics-ttm,
            income-annual, balance-annual, cashflow-annual,
            ratios-annual, key-metrics-annual,
            historical-price (last 365d)
        └─► map to CompanySnapshot
        └─► on per-call failure: record error, continue with what we have;
            if profile or quote fails, skip the symbol (no name → no row)
└─► write snapshot to public/data/snapshot-YYYY-MM-DD.json
└─► overwrite public/data/snapshot-latest.json
```

**Throttling:** sequential, 250ms between requests = 4 req/s. For 500
symbols × ~7 calls each = 3500 requests ≈ 15 minutes. Acceptable for
nightly.

**Error policy:**
- Network/5xx errors: 3 retries with exponential backoff (per
  `financial-api.md` §4 — though §4 says 5; we'll use 3 for v1
  ingest since one nightly retry can pick up persistent failures).
- 4xx errors (404, 402 paid endpoint): no retry. Record in `errors`,
  move on.
- Per-symbol failure: record, continue. Snapshot is always written
  even with partial coverage.
- Total run failure (filesystem write fails, universe missing): exit
  non-zero. The Task Scheduler entry should alert on non-zero exit.

## 4. Universe source

**v1:** committed JSON at `packages/data/src/universe/sp500.json`.
Hand-curated subset for initial verification; will grow to the full
~503 names. The file is a simple list:

```json
[
  { "symbol": "INTC", "name": "Intel Corporation" },
  { "symbol": "TGT",  "name": "Target Corporation" }
]
```

**Follow-up (Phase 4 or earlier if needed):** scrape Wikipedia's S&P
500 list and refresh this file monthly via a separate utility script
(no changes to the nightly path; the universe is just an input file).

## 5. CLI

```
npm run ingest                     # full universe
npm run ingest -- --limit 5        # first N symbols (smoke testing)
npm run ingest -- --symbols INTC,TGT,MSFT
npm run ingest -- --out ./tmp      # alternate output dir
```

Reads `FMP_API_KEY` from `.env` at the repo root. The `.env` file is
gitignored; presence is required at runtime, not at install time.

Exit codes:
- 0: snapshot written (possibly with per-symbol errors recorded)
- 1: fatal error (no API key, universe missing, all symbols failed,
  filesystem write failure)

Logs to stdout: progress per symbol, summary at end (count succeeded,
count failed, output path).

## 6. Test strategy

- **FmpClient method tests:** MSW returns the captured probe fixtures
  from `tests/fixtures/fmp/probe/` for each endpoint; assert mapping
  to typed DTOs.
- **Mapper tests:** raw FMP DTO → CompanySnapshot. Pure functions,
  fast, exhaustive on null handling.
- **Writer tests:** writes correct files to correct paths; atomic
  (temp file + rename) so a crashed run doesn't leave partial
  snapshots; idempotent (running twice on the same date overwrites).
- **Orchestrator tests:** mocked FmpClient, synthetic 3-symbol
  universe; assert: success path, partial failure (one symbol throws,
  others succeed and end up in snapshot), throttle delay observed.
- **Live verification (manual, not in CI):** run the CLI against ~5
  real symbols, eyeball the output JSON.

## 7. Open questions

1. Should the nightly job auto-commit and push the snapshot? Convenient
   but commits a large file daily. Alternative: only refresh if the
   snapshot's content diff is meaningful. Defer; user runs manually
   in v1.
2. Snapshot retention. After a few months we'll have ~90+ dated files.
   Compress old ones? Move to a separate branch or release artifacts?
   Defer until it's actually a size problem.
