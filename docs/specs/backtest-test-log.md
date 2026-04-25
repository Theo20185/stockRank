# Spec: Backtest test log — what's been tested, with verdicts

**Status:** living document. Append to it after every backtest run.
The point is to **stop re-running tests we've already settled** and
to make the audit trail of what's **signal** vs **noise** explicit.

## How to use this file

Every distinct test (a hypothesis evaluated under a specific
universe + window + cohort) appears as a single row in §3 with
columns:

- **Test ID** — stable identifier, e.g., `H11-PIT-2018to2023`
- **Hypothesis** — what we were trying to learn
- **Setup** — universe + date window + horizons + any other
  conditions
- **Verdict** — `signal` / `noise` / `inconclusive`
- **Headline number** — the single most important statistic with
  CI
- **Evidence file** — pointer to the archived report
- **Action taken** — engine change made (or "none — no action
  needed")
- **Re-test trigger** — under what conditions to re-run this test
  in the future

A row only gets removed when it's been superseded by a newer test
on a wider/cleaner sample.

## When to add a row

After every `npm run backtest-ic` run, append rows for each
hypothesis evaluated. If a run re-tests an existing hypothesis,
**append a new row** rather than mutating the old — the history
matters for tracking how verdicts change with regime / data depth /
methodology.

## What NOT to re-test (without good reason)

A test in the table marked `signal` with a defensible setup is
**done**. Re-running it on the same setup wastes time. Re-run only
when:
- A fundamental data source improves (e.g., Phase 2c for IVV
  cross-validation)
- The methodology changes (e.g., a better calibration approach)
- Time has elapsed and the underlying market regime may have
  shifted (rule of thumb: rerun every 12-18 months)

A test marked `noise` is the same — `noise` is a real finding, not
a "didn't try hard enough" placeholder. Re-running with bigger N or
narrower windows is acceptable; running the identical setup again
expecting a different result is curve-fitting.

## 3. Test history

Most-recent first. Setup column uses shorthand: `8y` = 8-year
backtest window; `PIT` = `--point-in-time` enabled; `biased` =
default (today's S&P 500 only).

| Test ID | Hypothesis | Setup | Verdict | Headline | Evidence | Action | Re-test trigger |
|---|---|---|---|---|---|---|---|
| **H11-PIT-2011only** | Quality floor exclusion improves 3y forward excess return (intended 2008-2011 crisis, EDGAR sparsity collapsed it to 2011 only) | --max-snapshot-date 2011-12-31, --years 18, PIT | **noise (failed) — small sample** | passed +10.91% [+8.51%, +13.55%] vs failed +13.57% [+10.66%, +16.66%]; gap -2.66 pp; only 12 snapshots | `docs/backtest-legacy-rules-2026-04-25-crisis.md` | None — H11 now failed 2-of-3 PIT regimes; v2 delisted-name handling is the blocking item per `backtest-actions-2026-04-25-crisis.md` §4.1 Option C | After v2 delisted-name handling ships |
| **H11-PIT-2010to2018** | Quality floor exclusion improves 3y forward excess return (pre-COVID regime) | 8y, PIT, --max-snapshot-date 2018-12-31 | **noise (failed)** | passed +4.99% [+4.22%, +5.88%] vs failed +7.31% [+6.13%, +8.50%]; gap -2.32 pp (floor harmful) | `docs/backtest-legacy-rules-2026-04-25-precovid.md` | None — combined with H11-PIT-2018to2023 reveals regime dependence | After v2 delisted-name handling |
| **H11-PIT-2018to2023** | Quality floor exclusion improves 3y forward excess return (COVID regime) | 8y, PIT, EDGAR, 503 syms | **signal — but NOT regime-stable** | passed cohort 3y -1.70% [-2.99%, -0.45%] vs failed -4.65% [-6.00%, -3.31%]; gap +2.95 pp | `docs/backtest-legacy-rules-2026-04-25-pit.md` | None — verdict superseded by combined regime-dependence reading | Re-test in 12-18 months OR after delisted-name v2 |
| **H11-biased-2018to2023** | Same as above, biased universe | 8y, biased, EDGAR | **noise** (verdict superseded by PIT version) | passed +6.07% vs failed +17.45% (false flip) | `docs/backtest-legacy-rules-2026-04-25.md` | Held the floor decision (good call) | Don't re-run biased — superseded |
| **H11-per-rule-PIT-2011only** | Each floor sub-rule individually predictive? (2011 single-year) | --max 2011-12-31, PIT, 12 snapshots | **mixed — partial directional consistency w/ 2010-2018** | sector-roic -11.80 pp (now strongly harmful, consistent w/ 2010-2018 sign); profitable-3of5 +9.34 pp (helpful, consistent w/ 2010-2018); interest-cov +0.64 pp (neutral) | `docs/backtest-legacy-rules-2026-04-25-crisis.md` | None — sector-roic + profitable-3of5 directions stable in 2 of 3 regimes (the COVID one is the outlier) | After v2 delisted-name handling |
| **H11-per-rule-PIT-2010to2018** | Each floor sub-rule individually predictive? (pre-COVID) | 8y, PIT, pre-COVID | **all flipped sign vs 2018-2023** | sector-roic -6.48 pp (was +7.18); profitable-3of5 +3.17 pp (was -7.87); interest-cov -2.28 pp (was -11.12) | `docs/backtest-legacy-rules-2026-04-25-precovid.md` | None — confirms regime dependence of all 3 sub-rules | Same |
| **H11-per-rule-PIT-2018to2023** | Each floor sub-rule individually predictive? (COVID) | 8y, PIT | **mixed — superseded** | sector-roic +7.18 pp; profitable-3of5 -7.87 pp; interest-cov -11.12 pp | `docs/backtest-legacy-rules-2026-04-25-pit.md` | None — verdict superseded by regime-dependence finding | Don't re-run identical setup |
| **H12-PIT-2010to2018** | Turnaround watchlist outperforms broader excluded set (pre-COVID) | 8y, PIT, pre-COVID | **mixed — 1y signal, 3y noise/negative** | 1y +22.99% vs +3.19% (gap +19.8 pp, signal); **3y -5.76% [-20.04%, +8.59%] vs +7.38%** (gap -13.15 pp, watchlist UNDERPERFORMED long term) | `docs/backtest-legacy-rules-2026-04-25-precovid.md` | Annotate §7 as short-horizon signal, not 3y hold thesis | Run a 3rd regime window to confirm 1y signal stability |
| **H12-PIT-2018to2023** | Turnaround watchlist outperforms broader excluded set (COVID) | 8y, PIT | **strong signal — but driven by COVID recovery** | watchlist 3y +45.96% vs +0; gap +50.84 pp | `docs/backtest-legacy-rules-2026-04-25-pit.md` | None — verdict context-shifted by pre-COVID finding | Don't re-run identical setup |
| **H12-biased-2018to2023** | Same as above, biased | 8y, biased | **signal** (consistent with PIT) | watchlist 3y +32.77% vs +17.38%; gap +15.39 pp | `docs/backtest-legacy-rules-2026-04-25.md` | None | Don't re-run biased — superseded |
| **WeightVal-default-vs-legacy-PIT-2011only** | Does value-deep beat legacy at 3y? (2011 single-year) | --max 2011-12-31, PIT, 12 snapshots | **noise — sign FLIPPED, sub-threshold** | legacy beats value-deep by +2.30 pp (legacy 3y > value-deep 3y); does NOT clear the +3 pp adoption floor so legacy stays rejected | `docs/backtest-weight-validation-2026-04-25-crisis.md` | None — value-deep wins 2 of 3 PIT regimes; the recovery-window result is sub-threshold | 12-18 months |
| **WeightVal-default-vs-legacy-PIT-2010to2018** | Does value-deep beat legacy 35/25/15/15/10 at 3y? (pre-COVID) | 8y, PIT, pre-COVID | **signal — REGIME-STABLE** | value-deep 3y +8.29% [+4.91%, +11.86%] vs legacy +2.56% [-1.74%, +6.87%]; +5.72 pp gap; legacy CI crosses zero | `docs/backtest-weight-validation-2026-04-25-precovid.md` | None — re-confirms the 2026-04-25 default migration | 12-18 months OR regime change |
| **WeightVal-default-vs-legacy-PIT-2018to2023** | Same question, COVID regime | 8y, PIT | **signal** | value-deep 3y +3.29% vs legacy -0.75%; +4.05 pp gap | `docs/backtest-weight-validation-2026-04-25-pit.md` | DEFAULT_WEIGHTS migrated (commit 5e1d2f7) | Same |
| **WeightVal-equal-weight-PIT** | Equal-weight (20/20/20/20/20) beats default? | 8y, PIT | **noise (negative)** | -8.58% 3y excess vs default — clearly underperforms | `docs/backtest-weight-validation-2026-04-25-pit.md` | Rejected | Don't re-run unless test window changes substantially |
| **WeightVal-quality-tilt-PIT** | quality-tilt (30/20/30/10/10) beats default? | 8y, PIT | **noise (negative)** | -8.06% 3y excess vs default | same | Rejected | Same |
| **WeightVal-momentum-on-PIT** | momentum-on (40/20/10/10/10/10) beats default? | 8y, PIT | **noise (slightly negative)** | +0.92% 3y excess (equivalent to default within bootstrap noise) | same | Rejected; momentum stays at 0% | Re-test if IC pipeline finds passing momentum cells in any super-group |
| **IC-cells-PIT-2018to2023** | Per-(super-group, factor, horizon) IC predictive? | 8y, PIT, 3-gate filter, 200 MC iter | **15 cells passed; FDR ratio "noise"** | 15 of 544 cells passed; FDR check 1.85× expected (noise verdict) | `docs/backtest-ic-2026-04-25-pit.md` | None in v1 (per-super-group preset adoption blocked on validation step 2) | Re-run when test window shifts or methodology improves |
| **H10-FV-trend** | fvTrend=declining demotes correctly? | n/a | **deferred** | Backtest-side FV-trend reconstruction not yet built | n/a | Pending Phase 4 backtest-side FV-trend computer | When Phase 4 ships |
| **WeightVal-momentum-on-PIT-2010to2018** | momentum-on (40/20/10/10/10/10) beats default? (pre-COVID) | 8y, PIT, pre-COVID | **noise (essentially tied)** | +0.22% 3y excess vs default — within bootstrap noise. Same as 2018-2023 result. | `docs/backtest-weight-validation-2026-04-25-precovid.md` | None — momentum stays at 0% default | Re-test if IC pipeline finds passing momentum cells |
| **WeightVal-equal-weight-PIT-2010to2018** | equal-weight beats default? (pre-COVID) | 8y, PIT, pre-COVID | **noise (negative, regime-stable)** | -8.42% 3y vs default | `docs/backtest-weight-validation-2026-04-25-precovid.md` | Confirmed rejected | Don't re-run |
| **WeightVal-quality-tilt-PIT-2010to2018** | quality-tilt beats default? (pre-COVID) | 8y, PIT, pre-COVID | **noise (negative, regime-stable)** | -8.22% 3y vs default | `docs/backtest-weight-validation-2026-04-25-precovid.md` | Confirmed rejected | Don't re-run |
| **IC-cells-PIT-2010to2018** | Per-(super-group, factor, horizon) IC predictive? (pre-COVID) | 8y, PIT, 3-gate filter, 200 MC iter | **10 cells passed; FDR ratio "marginal" (3.5×)** | 10 of 544 cells passed; 19 surviving / 5.4 expected = 3.5× (was 1.85× in COVID regime) | `docs/backtest-ic-2026-04-25-precovid.md` | None in v1 — but signal density is HIGHER than in COVID window, supporting the regime-stability of factor-level signal | Re-run on 3rd regime |
| **GrowthWindow-sweep** | 5Y vs 7Y vs 10Y CAGR for growth factor — which best? | not yet run | **not run** | — | — | — | After Phase 2c or methodology change |
| **CohortFallbackN-sweep** | N=5 vs 8 vs 12 vs 15 for industry → sector fallback threshold | not yet run | **not run** | — | — | — | Same |

## 4. Survivorship-bias size — recorded for posterity

| Metric | Biased | PIT | Inflation |
|---|---|---|---|
| Default 3y excess vs SPY | +26.96% | +3.29% | **+23.67 pp** |
| Excluded-not-watchlist 3y | +17.38% | -4.88% | +22.26 pp |
| value-deep 3y absolute (top decile) | +35.77% | +3.29% (now=default) | — |

Survivorship inflation in this 8-year window is **~22-24 pp at 3y**
— far above the literature's "1–2 %/yr." COVID-era distressed-name
recovery in the test window amplifies it.

**Implication:** absolute return claims based on biased data should
be discounted by ~20 pp per 3-year window. Relative comparisons
(candidate vs default, watchlist vs excluded) survive across the
two views.

## 5. Methodology snapshots — what was used per run

Each row links to a specific commit in case methodology drifted.

| Run date | Snapshot range | Universe | Calibration MC iters | Three-gate floor | Commit |
|---|---|---|---|---|---|
| 2026-04-25 (biased) | 2018-04 → 2023-03 | 503 today S&P, EDGAR-deep | 200 | IC ≥ 0.05 econ floor; sign-stable ≥ 2/3 | `7553897` |
| 2026-04-25 (PIT) | 2018-04 → 2023-03 | 503 today S&P filtered by Wikipedia membership history | 200 | same | `19b119d` |
| 2026-04-25 (PIT, with legacy candidate) | same | same | 200 | same | `d9ea6d0` |
| 2026-04-25 (PIT, pre-COVID) | 2011-01 → 2018-12 (96 snapshots) | same, --max-snapshot-date 2018-12-31 | 200 | same | `4b83bd3` |
| 2026-04-25 (PIT, intended crisis collapsed to 2011-only) | 2011-01 → 2011-12 (12 snapshots) | --max-snapshot-date 2011-12-31, --years 18 | 200 | same | (this commit) |

When you do a new run, append a row here so we can trace back to
the exact code state.

## 6. Hypotheses worth testing but not yet planned

Recorded so we don't forget:

1. **value-deep with EV/EBITDA-tilted in-Valuation reweighting**
   — boost the EV/EBITDA factor inside the Valuation category
   based on its strong cross-super-group IC. Candidate against the
   universe-wide value-deep default.
2. **"sector-relative-ROIC alone" floor variant** — drop
   profitable-3of5 + interest-coverage and see if the gap holds.
   Defer until ≥ 3 PIT runs confirm per-rule stability.
3. **Pre-COVID window check** — re-run all of H11/H12/weight-
   validation/IC on a 2010-2018 window. One CLI flag once a
   `--max-snapshot-date` flag exists. Confirms results aren't
   COVID-recovery artifacts.
4. **v2 delisted-name handling** — recover LEH/ENRN/etc. with -100%
   returns (or actual takeout prices). Would push H11 gap wider.
5. **Quarterly snapshot cadence** — current backtest uses month-end;
   try quarterly to test sampling-cadence sensitivity.
