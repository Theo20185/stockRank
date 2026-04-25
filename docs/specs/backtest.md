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
| H7 | At least one factor in the §5 ranking model carries IC ≥ 0.05 in at least one super-group at the 1y or 3y horizon (per `super-groups.md`), passing all three gates of §3.10. | Validates that the composite has *any* per-super-group signal worth conditioning weights on. |
| H8 | Per-super-group weight presets derived from H7 evidence beat the universal default weight vector on top-decile composite forward return, out-of-sample. | Validates that knowing per-super-group IC translates into a usable ranking improvement, not just an academic measurement. |
| H9 | The Momentum factor (introduced at default weight 0% per `ranking.md` §11.6) carries IC ≥ 0.05 in at least one super-group at 1y or 3y, passing all three gates. | Decides whether Momentum's default weight rises above 0 in v2 or whether the factor is removed as noise in this universe. |
| H10 | Names demoted to Watch by `fvTrend = "declining"` (per `ranking.md` FV-trend signal; 5%/yr slope over 2-year window) underperform their non-demoted same-bucket peers on 1y and 3y forward excess return. | Validates the demotion rule is genuine signal, not a false alarm that costs us upside. If H10 fails, the demotion threshold widens or the rule is dropped. |
| H11 | Names excluded by the §4 Quality floor (3-of-5 profitable + sector-relative ROIC + interest coverage) underperform the included set on forward 3y excess return, **net of survivorship**. Tested per-rule independently (one rule on at a time) and as the combined gate. | Validates the floor is a filter rather than a baby-with-bathwater problem. The floor's whole job is to remove names that hurt returns; if removal doesn't hurt, the floor is unjustified work and the names should rejoin the main composite. Tested per-rule because the combined gate could pass while one rule alone is dead weight. |
| H12 | Turnaround watchlist names (the §7 three-criterion gate: 10Y avg ROIC > 12%, TTM trough, 40% off 52w high) beat the broader §4-excluded set on 3y forward return by a meaningful margin. | Validates the §7 criteria are picking real fallen-angel signal, not just curiosities. The watchlist's job is to be more useful than "everything we excluded" — if it isn't, the criteria collapse to the excluded list itself. |

If H1/H2/H3 don't hold, the model is broken and we should be alarmed. If H4/H5/H6 don't hold, the rules are noise and should be removed. If H7 fails, we have no per-super-group signal and the §11.5 preset machinery is shelved. H8 and H9 are conditional on H7 / on the IC pipeline finding any momentum signal at all. **H10–H12 apply the same evidence bar to legacy rules that H7–H9 apply to new factors** — no rule, old or new, gets a free pass.

### 3.1.1 Parameter sweeps (not hypotheses)

A handful of legacy parameters are *design choices* rather than rules with up-or-down verdicts. They get the same Phase 3 IC pipeline run multiple times with the parameter swept, and the version with the highest stable per-cell IC wins:

| Parameter | Spec ref | Sweep range |
|---|---|---|
| Growth window | `ranking.md` §6 | 5Y / 7Y / 10Y CAGR |
| Cohort fallback N threshold | `ranking.md` §3.2 | N ∈ {5, 8, 12, 15} |
| Intra-category weighting | `ranking.md` §8 step 3 | Equal-weight vs IC-weighted vs single-best-factor per category |
| Winsorization bounds | `ranking.md` §8 step 2 | (5/95) vs (10/90) vs (1/99) |

Sweep results land in `docs/backtest-parameter-sweep-<date>.md`. Adoption rule: change the default only if the new parameter beats current on top-decile excess return at 3y, with bootstrap CI not crossing zero (same bar as §3.11.1 weight-validation).

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

**Phase 2a:** accept the bias, document loudly. Caveat banner on every accuracy report explaining that the universe is today's S&P 500 and realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr for survivorship in S&P over multi-year windows).

**Phase 2b — OPERATIONAL as of 2026-04-25.** Implemented per
`docs/specs/point-in-time-universe.md`. Wikipedia "Selected changes
to the list" table on the same page as the constituents is parsed
and reverse-applied to back-construct historical membership; cached
at `tmp/sp500-history/` with a 7-day TTL. The backtest CLI gains
`--point-in-time` which restricts the per-date universe to S&P 500
members as of that date.

The first PIT rerun (2026-04-25,
`docs/specs/backtest-actions-2026-04-25-pit.md`) revealed
survivorship bias was inflating absolute 3y excess-return numbers
by ~22 pp on this universe — far above the literature's 1-2%/yr
rule of thumb, driven by COVID-era distressed-name recovery.
Relative comparisons (candidate vs default, watchlist vs
excluded) were largely preserved. The H11 Quality-floor verdict
flipped from `fail` (biased) to `pass` (PIT) — the floor is doing
real work that the biased view was hiding.

v1 PIT limitation: today's symbols are filtered by historical
membership, but historically-included-but-now-delisted names
(LEH, ENRN, etc.) are NOT yet added back into the universe — we
don't have EDGAR or chart data for those names.

**v2 delisted-name handling — OPERATIONAL as of 2026-04-25
(Phase 2D.1).** `cikFor` now falls back to SEC's broader
`company_tickers.json` on local-lookup miss. Recovery rates on
the 345 delisted symbols identified from the Wikipedia changes
table:
- Yahoo chart: 41.4% (143/345)
- EDGAR (with fallback): **36.8% (127/345)** — was 0% before fix
- Both (usable for snapshot building): 36.8%

127 delisted symbols are now properly added to the backtest
universe at past dates where they were S&P 500 members. Their
post-delisting forward returns naturally extend the
forward-return curves (chart data covers post-delisting trading
where available; for fully-bankrupt symbols Yahoo returns no
chart and the observation drops out — the H11 audit still picks
this up via the floor classification).

**Result:** the §4 Quality floor decision in `ranking.md` §11.7
unblocks. H11 passes regime-stably (+4.33 pp PIT 2018-2023, +2.58
pp PIT 2010-2018) when delisted names are included. The earlier
PIT-only fail in pre-COVID was a survivorship-bias artifact.

**v3 ambition (not blocking):** the 218 still-missing names are
mostly older bankruptcies and pre-2009 acquisitions (SEC's active
table doesn't include long-inactive filers). A hand-curated
historical-filer index would push recovery higher; deferred.

**Phase 2c (separate effort):** the secondary `IVV` fund-holdings
source remains a future option for cross-validating the Wikipedia-
derived membership history.

### 3.7 Total-return treatment

`realizedReturn` and `spyReturn` use Yahoo's **adjusted close**, which back-adjusts for splits and dividends. This is total-return semantics if you reinvest dividends — the right baseline for comparison to a SPY hold.

For names with significant special dividends (rare in S&P 500), the adjusted close still handles them correctly. Spinoffs are messier (Yahoo's adjustment treats them inconsistently) — for v1, log warnings on names with documented spinoffs in the window (e.g., GE → GEV) and exclude those rows from accuracy aggregates.

### 3.8 Statistical hygiene

- **Multiple-testing problem.** We're slicing the data many ways (9 hypotheses × 4 horizons × N strata, plus a ~17 super-group × ~16 factor heatmap in §3.9). Don't draw conclusions from individual slices that don't survive an FDR correction. Headline number is "did the model beat SPY across all Candidates over 3y" — that's the one that matters. The IC heatmap has its own purpose-built three-gate filter — see §3.10.
- **Sample-size guardrails.** Don't display a hit rate when N < 30. Show "—" with an `(n=X, insufficient)` annotation.
- **Snapshot independence.** Adjacent month-end snapshots on the same symbol are highly correlated — they share most of the underlying fundamentals. For headline metrics, **deduplicate to one snapshot per symbol per (calendar) year** so we don't claim N = 6,000 when the effective sample size is 60.
- **Don't curve-fit.** If H1–H9 don't hit, that's a finding, not a bug to tune away. The whole point is honest measurement.

## 3.9 IC analysis by super-group

Goal: measure how much each ranking factor (§5 of `ranking.md`)
predicts forward return *within each super-group* (per
`super-groups.md`), so that per-super-group weight presets
(`ranking.md` §11.5) and the Momentum factor inclusion decision
(`ranking.md` §11.6) rest on evidence rather than priors.

### 3.9.1 What we compute

For each `(superGroup, factor, horizon)` cell, across all snapshots
where `windowComplete = true` and the company's industry maps to
`superGroup` per `INDUSTRY_TO_SUPER_GROUP`:

```
IC(superGroup, factor, horizon) =
    Spearman correlation between
        factor.percentile (computed at snapshot date T using only
            data public at T, exactly as ranking.md does it)
    and
        excessReturn at T+horizon (realizedReturn − spyReturn)
```

Excess return is the right target — we care about predicting
*outperformance vs SPY*, not absolute return that's dominated by
beta.

The output is a heatmap: rows = ~17 super-groups, columns = the ~16
factors in `ranking.md` §5 (across all categories, including the new
Accruals, Net Issuance, and Momentum factors), one heatmap per
horizon (1y / 2y / 3y / 5y).

### 3.9.2 Per-cell drill-down

A cell that passes §3.10's filter is clickable in the rendered
report (Markdown table cells are not, but the per-cell detail file
generated alongside is). The drill-down shows:
- N effective observations
- IC point estimate and bootstrap 95% CI
- Per-rolling-window IC values (sign-stability evidence)
- Top 5 / bottom 5 contributing snapshots (highest absolute residual
  after IC fit) — sanity-check that the IC isn't driven by 2 outlier
  observations
- Per-industry IC within the super-group (e.g., for Banks & Lending
  super-group, separate IC for Banks-Regional, Banks-Diversified,
  Credit Services). Surfaces intra-super-group divergence that would
  motivate a `super-groups.md` v2 split.

### 3.9.3 Effective N accounting

Snapshot autocorrelation (monthly snapshots on the same symbol share
most of the underlying fundamentals) inflates raw N badly. Effective
N for IC follows the same yearly-dedup rule as headline metrics
(§3.8): **at most one snapshot per (symbol, calendar year)** enters
the IC computation per cell. The cell's reported N is this effective
count, not the raw snapshot count.

A cell whose effective N falls below the per-cell N threshold from
the §3.10 Phase 0 calibration renders as "—" in the heatmap.

## 3.10 Three-gate filter for IC cells (Monte Carlo Phase 0)

A cell shows a colored IC value in the heatmap only when **all three
gates pass**. Otherwise it renders as "—" with a tooltip explaining
which gate failed.

### Gate 1: Statistical (Monte Carlo derived)

The IC magnitude must exceed the 99th percentile of the cell's own
**null distribution under shuffled returns**. Per-cell, not global,
because Banks-3y at N=2000 effective obs has a very different noise
floor than Tobacco-1y at N=80 effective obs.

The null distribution comes from the Phase 0 calibration described
in §3.10.1. Each cell gets its own derived threshold; the calibration
output is a lookup table indexed by `(superGroup, horizon)` →
`{ic_99th_null: number, ic_99_5th_null: number, n_effective: number}`.

### Gate 2: Economic (hand-set floor)

Cell IC must be ≥ **0.05 in absolute value**, regardless of the
statistical threshold. Below 0.05, transaction costs and slippage
typically eat the edge in a long-only portfolio (literature
consensus, defensible without further calibration). A cell that
passes Gate 1 (above noise) but fails Gate 2 (too small to act on)
is real-but-useless — we don't want to act on it.

This is the only hand-set number in the filter; everything else is
data-derived. We tag it explicitly so it's tunable in one place if
the user's transaction-cost assumptions change.

### Gate 3: Sign-stability (rolling windows)

Compute IC in three rolling windows: typically `[T−15y, T−10y]`,
`[T−10y, T−5y]`, `[T−5y, T]` (exact windows depend on data
availability per `super-groups.md` membership history). The cell's
sign must agree in **at least 2 of 3 windows**.

A cell with full-sample IC = +0.13 made up of `+0.30 / −0.10 / +0.20`
is flagged as regime-dependent and renders as "—" with a tooltip
"sign unstable across windows."

### 3.10.1 Phase 0 — Monte Carlo calibration

Run **before** any IC heatmap is published. One-time per spec /
universe / horizon-set; results archived to
`docs/backtest-ic-calibration-<date>.md` so every IC report can
reference the calibration that derived its thresholds.

**Procedure** (purpose: destroy the signal while preserving every
other structural feature of our data):

1. Take the real Phase 1 backtest dataset (all snapshots × all
   symbols × forward returns).
2. For each `(snapshot date, super-group)` cell, **randomly permute
   which forward-return value is paired with which symbol within
   the cell**. This breaks any genuine factor → return relationship
   while keeping intact: real return distributions per super-group,
   real industry sizes, real snapshot autocorrelation, real
   cross-sectional return correlation, real survivorship pattern.
3. Run the full §3.9 IC computation on the shuffled data.
4. Record IC values per cell.
5. Repeat steps 2–4 for **N = 1,000 iterations**.
6. For each `(superGroup, horizon)` cell, sort the 1,000 |IC| values
   and record the 99th and 99.5th percentiles. These are the
   per-cell statistical thresholds for Gate 1.

**N-vs-noise curve.** As a byproduct, plot
`null_99th_percentile_IC` vs `n_effective` across all cells. This
curve answers "at what N does the noise floor drop below the 0.05
economic threshold?" — that's the honest minimum-N gate, derived
not guessed. Cells below that N are "—" in the heatmap regardless
of measured IC.

**False-discovery sanity check.** With per-cell thresholds in hand,
run the *real* (unshuffled) data through the §3.9 pipeline. Count
surviving cells. The Monte Carlo predicts ~1% of cells survive Gate
1 alone by chance; if ~30% survive on real data, that's a real
signal-density story. If ~1.5% survive, the heatmap is mostly noise
and we should not build presets on top of it.

**Calibration archival.** The calibration output (per-cell
thresholds + N-vs-noise curve + FDR sanity check) is committed under
`docs/backtest-ic-calibration-<YYYY-MM-DD>.md`. Re-run the
calibration when:
- The super-group mapping changes (super-groups.md mutation)
- A new factor is added to the §5 ranking model
- The horizon set changes
- The S&P 500 universe drifts materially (annual refresh is fine)

The active calibration file's path is hard-coded in
`packages/ranking/src/backtest/ic-calibration.ts`; mismatches
between the calibration and the current spec produce a hard error,
not a silent fallback.

## 3.11 Weight-validation backtest mode

Goal: before any per-super-group preset (or any change to the
universal default weights) is adopted into `ranking.md` §8.1 / §11.5,
prove out-of-sample that it actually improves top-decile composite
forward return.

### 3.11.1 Procedure

1. **Train/test split by date**, not by symbol. Train on
   `[T−15y, T−5y]` snapshots; test on `[T−5y, T]` snapshots. (Train
   period is when IC is measured and presets proposed; test period
   is what validates them.)
2. For each candidate weight vector (default weights, IC-derived
   per-super-group preset, momentum-on alternative, etc.):
   a. Recompute composite scores at every test-period snapshot using
      that weight vector.
   b. Take the top decile by composite at each snapshot.
   c. Compute equal-weight forward return of that top decile at
      T+1y, T+3y, T+5y.
   d. Compute excess return vs SPY for the same windows.
3. Bootstrap (1,000 resamples) to get 95% CI on mean excess return
   per horizon per weight vector.
4. Adoption rule: **a candidate weight vector is adopted only if its
   mean excess return at the 3y horizon is at least 1%/yr higher
   than the default's, with bootstrap CI not crossing zero.**

The 1%/yr threshold is the same hand-set economic floor as Gate 2
in §3.10 — coherent with our transaction-cost / slippage
assumptions for long-only.

### 3.11.2 Honest reporting

Report **all** candidate weight vectors evaluated, not just the ones
that pass. The headline table in
`docs/backtest-weight-validation-<date>.md` contains:

| Weight vector | Source | 1y excess (CI) | 3y excess (CI) | 5y excess (CI) | Adopted? |
|---|---|---|---|---|---|

A vector that fails validation is logged as "rejected" with the
underlying numbers, so we can't selectively re-run until something
sticks. The Phase 0 / IC / weight-validation chain is a single
auditable pipeline, not a fishing expedition.

### 3.11.3 What we explicitly do *not* do

- **No grid search over weights to maximize backtest excess return.**
  This is the canonical curve-fit. Candidate vectors come from §3.9
  IC evidence (a small handful per super-group) plus a few academic-
  prior alternatives (equal-weight, quality-tilt). Not from
  optimization over thousands of combinations.
- **No re-running validation with tweaked weights after seeing the
  result.** If a proposed preset fails, the next iteration starts
  from new IC evidence on a refreshed snapshot, not from
  hill-climbing the validation output.

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

# Phase 0 — Monte Carlo IC threshold calibration (run before --ic):
npm run backtest -- --all-sp500 --ic-calibrate --iterations 1000 --archive

# §3.9 IC analysis by super-group (requires fresh calibration):
npm run backtest -- --all-sp500 --ic --horizons 1,2,3,5 --archive

# §3.11 weight-validation (compares one or more candidate weight vectors
# to the default). Vectors are loaded from the named JSON file; one entry
# per candidate. Train/test split per §3.11.1 is automatic.
npm run backtest -- --all-sp500 --weight-test config/candidate-weights.json --archive

# Convenience: full pipeline (calibration + IC + weight-test) in one shot,
# used after a snapshot refresh that materially changes the universe:
npm run backtest -- --all-sp500 --full-ic-pipeline --archive

# Legacy-rule audit (H10–H12 + §3.1.1 parameter sweeps):
npm run backtest -- --all-sp500 --legacy-rule-audit --archive
npm run backtest -- --all-sp500 --parameter-sweep --archive
```

`--accuracy`, `--ic-calibrate`, `--ic`, and `--weight-test` are
independently opt-in; without any of them Phase 1 output stays
unchanged. `--ic` errors out if no calibration archive exists or if
the calibration's super-group / factor signature doesn't match the
current spec — never silently uses stale thresholds.

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
4. **Historical "Candidates" without options-liquidity data:** ~~choose one proxy~~ → **Originally decided: Option D — two parallel bucket assignments** (gate-off vs today-liquid). **Superseded 2026-04-25**: the options-liquid bucket gate was removed entirely (see `ranking.md` §11.7 / `buckets.ts` `classifyRow`). Stocks without an active options market now appear in Ranked as share-purchase candidates; the OptionsPanel UI just hides the CSP/buy-write/covered-call panels for them. Backtest no longer needs the parallel bucket assignment — there's only one bucket assignment now, and `optionsLiquid` is informational metadata.
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

**Phase 3 — IC analysis and weight presets** (this iteration)

- **3.0 Monte Carlo calibration (§3.10.1).** Implement the shuffle-
  and-rerun pipeline. Output: per-cell statistical thresholds,
  N-vs-noise curve, FDR sanity check. Archive as
  `docs/backtest-ic-calibration-<date>.md`. Block §3.1+ until this
  exists.
- **3.1 IC computation (§3.9).** Compute per-cell Spearman IC,
  bootstrap CIs, rolling-window sign-stability flags. Apply the
  three-gate filter from §3.10.
- **3.2 IC heatmap report.** Markdown heatmap (one per horizon),
  per-cell drill-down files, intra-super-group divergence flags.
  Archive as `docs/backtest-ic-<date>.md`. Hypothesis verdicts for
  H7 and H9 written here.
- **3.3 Weight-validation mode (§3.11).** Load candidate weight
  vectors from JSON, run train/test split, bootstrap excess-return
  CIs, output adoption verdicts. Archive as
  `docs/backtest-weight-validation-<date>.md`. Hypothesis verdict
  for H8 written here.
- **3.4 Adopted presets.** For each candidate that passes §3.11.1
  adoption rules, append an entry to
  `packages/ranking/src/presets/super-group-weights.ts` with the
  archived `evidenceRef`. The Momentum default weight in
  `ranking.md` §8.1 is updated only via this same evidence chain
  (per `ranking.md` §11.6).
- **3.5 Legacy-rule audit (H10–H12 + §3.1.1 sweeps).** Run the
  legacy-rule hypothesis tests and parameter sweeps using the same
  three-gate filter and bootstrap CIs as the new-factor work. Each
  legacy rule that fails its hypothesis is either weakened (move
  threshold to where the data supports it) or removed in v2 with the
  archived report as justification. Each parameter sweep that
  surfaces a clearly better default updates `ranking.md` in the same
  PR that publishes the sweep report.
  - **H10 (fvTrend demotion):** stratify all snapshots by `fvTrend`
    label at T; compare 1y/3y forward excess return of `declining`
    vs `stable`/`improving` *within the same composite-bucket*
    (Candidates → Watch demotion is the rule under test, so the
    comparison must hold composite quality constant).
  - **H11 (Quality floor):** run the ranker twice per snapshot —
    once with the §4 floor applied (current behavior), once with the
    floor disabled. Compare 3y forward excess return of names the
    floor *would have excluded* to the included set's same-decile
    return. Report per-rule: 3-of-5 profitable alone, sector-ROIC
    alone, interest-coverage alone, and combined.
  - **H12 (Turnaround):** identify the §7 watchlist set at each
    snapshot, compare its mean 3y forward return to (a) the
    broader §4-excluded set, (b) SPY. If (a) gap fails, the §7
    criteria aren't doing useful work above the floor.

## 8. Done criteria

- `npm run backtest -- --symbols EIX,INCY,TGT,NVO,INTC --accuracy` produces `tmp/backtest/accuracy.md` with the headline table and at least the `outlierFired` + `confidence` strata.
- For each horizon, hit rates and mean returns include N and CIs.
- Survivorship-bias caveat is the first thing in the report, not a footnote.
- A first-pass accuracy run is committed under `docs/backtest-accuracy-<date>.md` with one paragraph per hypothesis (verdict + supporting number).
- `npm run backtest -- --all-sp500 --ic-calibrate --archive` produces `docs/backtest-ic-calibration-<date>.md` with per-cell thresholds, N-vs-noise plot, and FDR sanity check.
- `npm run backtest -- --all-sp500 --ic --archive` produces `docs/backtest-ic-<date>.md` with the heatmap (cells filtered by §3.10's three gates), per-cell drill-downs, and H7 / H9 verdicts.
- `npm run backtest -- --all-sp500 --weight-test config/candidate-weights.json --archive` produces `docs/backtest-weight-validation-<date>.md` with the candidate-vs-default table, all candidates listed (passing and failing), and H8 verdict.
- Any preset adopted into `super-group-weights.ts` carries an `evidenceRef` pointing at the specific archived calibration / IC / validation files that justified it.
- `npm run backtest -- --all-sp500 --legacy-rule-audit --archive` produces `docs/backtest-legacy-rules-<date>.md` with H10/H11/H12 verdicts and per-rule numbers. Any rule that fails its hypothesis is queued for a v2 weakening or removal PR with the report as justification.
- `npm run backtest -- --all-sp500 --parameter-sweep --archive` produces `docs/backtest-parameter-sweep-<date>.md` with per-parameter sweep results (growth window, fallback N, intra-category weighting, winsorization). Any parameter where the data clearly favors a different default updates `ranking.md` in the same PR.
