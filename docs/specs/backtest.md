# Spec: Back-test framework

**Status:** Phase 1 (engine validation) and Phase 2 (forward-accuracy measurement) both implemented in `scripts/backtest.ts`. Phase 2b (point-in-time S&P 500 universe) is still deferred.

## 1. Purpose

Two distinct back-test purposes share one engine and one I/O surface:

| Purpose | Question answered | Status |
|---|---|---|
| **Engine validation** | "Given the data that would have been public at date T, does our model produce sensible numbers?" | ✓ Phase 1 |
| **Forward accuracy** | "Did the names the model identified as undervalued at date T actually recover to the projected range by T+1y / T+3y / T+5y?" | Phase 2 (this spec) |

Engine validation answers a process question (is the model self-consistent over time, are the rule's interventions stable, do the divergence/outlier defenses fire when they should). Forward accuracy answers an outcome question (does the model make money / pick winners over multi-year horizons).

These are independent — a model can be self-consistent and useless, or noisy but profitable. We need both.

## 2. Phase 1 recap (already shipped)

For each symbol over N years:
- Iterate month-end dates.
- At each date, reconstruct a `CompanySnapshot` using only data that would have been public then (annual fundamentals filtered by `period-end + 90-day reporting lag`, historical price from Yahoo `chart`).
- Recompute fair value WITH and WITHOUT the TTM-EPS outlier rule.
- Emit one CSV row per snapshot + a per-symbol Markdown timeline.

Outputs: `tmp/backtest/<SYM>.csv`, `tmp/backtest/<SYM>.md`, `tmp/backtest/summary.md`.

Used to calibrate `PEER_DIVERGE_THRESHOLD = 5.0` and verify the EPS outlier rule's pull-down behavior.

## 3. Phase 2: forward-accuracy measurement

### 3.1 Hypotheses to test

Each hypothesis maps to one or more concrete metrics in §3.4. We list them up front so we know what success looks like before we slice the data.

| ID | Hypothesis | Why it matters |
|---|---|---|
| H1 | Names with positive p25 upside at T reach p25 within 3y at a higher rate than chance (≥ 60%, say). | Validates the *floor* of our fair-value range. |
| H2 | Names with positive median upside at T reach median within 3y. | Validates the central estimate. |
| H3 | Names in the **Candidates** bucket beat SPY total return over 3y on average. | Validates the model end-to-end as an investment process, not just per-name. |
| H4 | "Outlier rule fired" snapshots have *better* forward accuracy than the same snapshots with the rule bypassed. | Validates the rule's contribution. (Tests the right thing — naive median should be more wrong, on average.) |
| H5 | High-confidence rows (`confidence: "high"`) have a tighter realized-return distribution than low-confidence rows. | Validates the confidence label. |
| H6 | Names flagged as `peerCohortDivergent` have *worse* accuracy than their non-divergent peers. | Validates the divergence rule's pull-back is the right call. |

If H1/H2/H3 don't hold, the model is broken and we should be alarmed. If H4/H5/H6 don't hold, the rules are noise and should be removed.

### 3.2 Forward window mechanics

For each Phase 1 snapshot row at date T with fair value `(p25, median, p75)` and price `P_T`:
- Look up actual price at T+1y, T+2y, T+3y, T+5y. (Use Yahoo adjusted close for total-return semantics — handles dividends and splits.)
- Window must end **on or before today**. Snapshots in the trailing N years where N < horizon are excluded from that horizon's metrics (clearly logged, not silently dropped).
- For each horizon, capture:
  - `priceAtHorizon` (adj close)
  - `peakPriceInWindow` (max adj close T → T+N) — for "did it ever reach the range?" questions
  - `troughPriceInWindow` (min adj close T → T+N) — drawdown stats
  - `realizedReturn` = (priceAtHorizon − P_T) / P_T
  - `spyReturn` over the same window (excess-return baseline)

### 3.3 Hit definitions

Two flavors of "did it hit the range" — record both, since they answer different questions:

| Definition | Meaning |
|---|---|
| **Endpoint hit** | `priceAtHorizon ≥ p25` (or median, or p75). Did the price *land* in the range? |
| **Peak hit** | `peakPriceInWindow ≥ p25`. Did the price ever *touch* the range during the window? |

Endpoint hit is the more conservative measure — it requires the recovery to stick. Peak hit reflects whether the market briefly agreed with us.

### 3.4 Per-row metrics

Add these columns to the existing per-symbol CSV (one row per snapshot per horizon, or wide format with horizon-suffixed columns — TBD in §6):

```
horizon, priceAtHorizon, peakInWindow, troughInWindow,
realizedReturn, spyReturn, excessReturn,
endpointHitP25, endpointHitMedian, endpointHitP75,
peakHitP25,     peakHitMedian,     peakHitP75,
windowComplete  // false if T+horizon > today
```

### 3.5 Aggregations

A new `tmp/backtest/accuracy.md` summary report contains:

**Headline table** — per horizon, across all symbols × snapshots where `windowComplete = true`:

| Horizon | N | Endpoint hit p25 | Endpoint hit median | Endpoint hit p75 | Mean realized | Mean excess vs SPY | Hit-rate 95% CI |
|---|---|---|---|---|---|---|---|

**Stratified tables** — same columns but bucketed by:
- Initial upside-to-p25 quartile (0–10%, 10–25%, 25–50%, 50%+) — answers "do bigger projected upsides realize bigger returns?"
- Confidence label (high / medium / low) — H5
- `outlierFired` true/false — H4
- `peerCohortDivergent` true/false — H6
- Bucket assignment at T (Candidates / Watch / Excluded) — H3, the end-to-end test

**Confidence intervals:** binomial Wilson interval on hit rates; bootstrap on mean realized returns (1000 resamples). Don't quote a hit rate without an N alongside.

### 3.6 Survivorship-bias treatment

This is the honest hard part. Today's S&P 500 list silently excludes companies that went bankrupt, got acquired, or were dropped from the index. A back-test that runs over today's list will systematically over-estimate accuracy.

**Phase 2a (this iteration):** accept the bias, document loudly. Caveat banner on every accuracy report explaining that the universe is today's S&P 500 and realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr for survivorship in S&P over multi-year windows).

**Phase 2b (separate effort):** point-in-time S&P 500 membership. Two viable sources:
- Wikipedia revision history of *List of S&P 500 companies* — has a "removed" table going back ~20 years. Scrapeable.
- iShares historical fund holdings (`IVV` constituents per quarter) — scrapeable from iShares but rate-limited.

A point-in-time universe lets us include delisted names with realized return = -100% (or whatever the takeover price was). Big lift; deferred.

### 3.7 Total-return treatment

`realizedReturn` and `spyReturn` use Yahoo's **adjusted close**, which back-adjusts for splits and dividends. This is total-return semantics if you reinvest dividends — the right baseline for comparison to a SPY hold.

For names with significant special dividends (rare in S&P 500), the adjusted close still handles them correctly. Spinoffs are messier (Yahoo's adjustment treats them inconsistently) — for v1, log warnings on names with documented spinoffs in the window (e.g., GE → GEV) and exclude those rows from accuracy aggregates.

### 3.8 Statistical hygiene

- **Multiple-testing problem.** We're slicing the data many ways (6 hypotheses × 4 horizons × N strata). Don't draw conclusions from individual slices that don't survive a Bonferroni-style correction. Headline number is "did the model beat SPY across all Candidates over 3y" — that's the one that matters.
- **Sample-size guardrails.** Don't display a hit rate when N < 30. Show "—" with an `(n=X, insufficient)` annotation.
- **Snapshot independence.** Adjacent month-end snapshots on the same symbol are highly correlated — they share most of the underlying fundamentals. For headline metrics, **deduplicate to one snapshot per symbol per (calendar) year** so we don't claim N = 6,000 when the effective sample size is 60.
- **Don't curve-fit.** If H1–H6 don't hit, that's a finding, not a bug to tune away. The whole point is honest measurement.

## 4. Out of scope (this spec)

- **Options-strategy P&L back-test** — covered-call / cash-secured-put returns over time. Different mechanics (need historical option chains, which Yahoo doesn't expose). Separate spec if/when we build it.
- **Ranking-model attribution** — "which factor explains the most realized return?" Useful but bigger. Phase 3.
- **Industry / sector heatmaps** — visual nice-to-haves on top of the aggregate report. Cheap once the metrics exist.

## 5. CLI surface

Extend the existing `npm run backtest` rather than add a separate command.

```bash
# Engine-validation only:
npm run backtest -- --symbols EIX,INCY,TGT --years 6

# Phase 2 accuracy on a named subset:
npm run backtest -- --symbols EIX,INCY,TGT --years 6 --accuracy
npm run backtest -- --symbols EIX,INCY,TGT --years 6 --accuracy --horizons 1,2,3,5

# Full S&P 500 universe:
npm run backtest -- --all-sp500 --years 8 --accuracy --horizons 1,2,3

# With hypothetical options overlay:
npm run backtest -- --all-sp500 --accuracy --options-overlay-pct 4

# Persist to docs/:
npm run backtest -- --all-sp500 --accuracy --archive
```

`--accuracy` is opt-in; without it Phase 1 output stays unchanged.

### Disk cache

Yahoo response bodies are cached under `tmp/backtest-cache/<SYMBOL>/{fundamentals,chart,profile}.json` so analysis-side iteration doesn't trigger re-fetches. Cache is **read-through** by default — present files are reused, missing files trigger a fetch and write. The cache is keyed on symbol only (chart pulls always use a fixed 15-year window so different `--years` settings can share the cache).

- `--refresh-cache` — ignore cached data, force re-fetch, **overwrite** the cache. Use after a Yahoo schema change breaks the mapping.
- `--merge-cache` — fetch fresh **but union with existing cache**, preserving dates that have aged out of Yahoo's rolling window. Used by `npm run refresh-all` to keep the long-tail historical data intact across refreshes. Mutually exclusive with `--refresh-cache`.
- `--cache-dir PATH` — override the cache root (default `tmp/backtest-cache/`).

Cache hits skip the rate-limit sleep entirely; on cold run a full S&P 500 takes ~10 minutes, on warm run the same backtest finishes in seconds. Cache size is ~700KB per symbol, ~350MB for the full S&P 500.

### Pipeline-level command

`npm run refresh-all` orchestrates the full data refresh in three phases:

1. `backtest --all-sp500 --merge-cache` — append-only refresh of the back-test cache.
2. `compute-fv-trend` — regenerate `public/data/fv-trend.json` from the updated CSVs.
3. `refresh` — the existing daily ingest + tests + commit + push pipeline.

The single commit produced by phase 3 captures every changed file from all three phases. Use `npm run refresh` for the daily lighter-weight version that skips phases 1-2.

## 6. Open decisions before coding

1. **CSV schema:** ~~wide vs long~~ → **Decided: long throughout.** One row per snapshot × horizon, both in per-symbol CSV and inside the aggregation report. Humans aren't the consumer — the aggregation engine is — so the format that's natural for `groupBy(horizon)` wins. (User decision, 2026-04-22.)
2. **SPY baseline source:** ~~`^GSPC` vs `SPY`~~ → **Decided: `SPY`.** Total-return apples-to-apples (subject's adjusted close already includes dividends), it's what the user could actually buy as the alternative, the 0.0945% expense ratio is a real cost our model has to beat. (User decision, 2026-04-22.)
3. **Universe for the headline number:** ~~monthly vs yearly dedup~~ → **Decided: both (Option C).** Headline metrics use one snapshot per (symbol, year) — the first month each symbol has a complete forward window, mechanical no-cherry-pick rule. Same metrics also computed across all monthly snapshots and shown as a sensitivity check; if monthly and yearly disagree dramatically we learn something about sampling-cadence bias. (User decision, 2026-04-22.)
4. **Historical "Candidates" without options-liquidity data:** ~~choose one proxy~~ → **Decided: Option D — two parallel bucket assignments.** Yahoo doesn't expose historical option chains, so the options-liquid gate has no honest historical value. Run the bucket classifier twice at each snapshot:
   - **Gate-off Candidates** — apply all five Candidate criteria *except* `optionsLiquid`. Tests "did the model's value picks recover?"
   - **Today-liquid Candidates** — same as gate-off, then filter to names that pass the options-liquid gate *as of today's snapshot*. Tests "would actionable covered-call targets have recovered?"

   Carry both columns through to the headline table. The gap between the two hit rates quantifies the options-liquidity gate's selection contribution — if today-liquid consistently underperforms gate-off, the gate is throwing out winners; if it outperforms, the gate is genuine signal. (User decision, 2026-04-22.)
5. **First-class output location:** ~~`tmp/` vs `docs/`~~ → **Decided: Option C — default `tmp/backtest/accuracy.md`; `--archive` flag also writes `docs/backtest-accuracy-<YYYY-MM-DD>.md`.** Casual iteration stays out of git; intentional runs get one-keystroke posterity. Matches existing precedent (`docs/backtest-findings-2026-04-21.md` was a hand-copy from a `tmp/` run). (User decision, 2026-04-22.)

## 7. Phase ordering

**Phase 2.1 — Forward-window join + per-row metrics**
- Add forward price lookup, SPY baseline pull.
- Extend `BacktestRow` with horizon-suffixed columns.
- Per-symbol CSV gains the new columns; per-symbol MD shows a "realized vs projected" mini-table.
- No aggregation logic yet. Just the raw data.

**Phase 2.2 — Aggregations + accuracy report**
- Build the headline + stratified tables in §3.5.
- Implement Wilson CIs and bootstrap.
- Snapshot-independence dedup.
- Output `accuracy.md`.

**Phase 2.3 — Hypothesis verdicts**
- For each H1–H6, declare pass/fail/inconclusive with the supporting numbers.
- Save the first run as `docs/backtest-accuracy-<date>.md` for posterity (per `feedback_spec_driven` and the existing `docs/backtest-findings-2026-04-21.md` precedent).

**Phase 2b (separately) — Point-in-time universe**
- Wikipedia-revision scraper for historical S&P 500 membership.
- Mark delisted names; capture takeover/bankruptcy outcome where possible.
- Re-run accuracy with the un-biased universe; compare to the biased baseline.

## 8. Done criteria

- `npm run backtest -- --symbols EIX,INCY,TGT,NVO,INTC --accuracy` produces `tmp/backtest/accuracy.md` with the headline table and at least the `outlierFired` + `confidence` strata.
- For each horizon, hit rates and mean returns include N and CIs.
- Survivorship-bias caveat is the first thing in the report, not a footnote.
- A first-pass accuracy run is committed under `docs/backtest-accuracy-<date>.md` with one paragraph per hypothesis (verdict + supporting number).
