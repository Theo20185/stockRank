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
| **H11-PIT-2018to2023** | Quality floor exclusion improves 3y forward excess return | 8y, PIT, EDGAR, 503 syms | **signal** | passed cohort 3y -1.70% [-2.99%, -0.45%] vs failed -4.65% [-6.00%, -3.31%]; gap +2.95 pp | `docs/backtest-legacy-rules-2026-04-25-pit.md` | None — keep §4 floor as-is | Re-run with delisted-name v2 (would push gap wider); pre-COVID window for regime check |
| **H11-biased-2018to2023** | Same as above, biased universe | 8y, biased, EDGAR | **noise** (verdict superseded by PIT version) | passed +6.07% vs failed +17.45% (false flip) | `docs/backtest-legacy-rules-2026-04-25.md` | Held the floor decision (good call) | Don't re-run biased — superseded |
| **H11-per-rule-PIT-2018to2023** | Each floor sub-rule individually predictive? | 8y, PIT | **mixed** | sector-roic gap +7.18 pp (signal); profitable-3of5 -7.87 pp; interest-cov -11.12 pp (both individually noise) | same as H11-PIT | Recorded for audit trail; v2 may simplify floor to sector-roic alone | Run after ≥ 2 more PIT runs to confirm sub-rule stability |
| **H12-PIT-2018to2023** | Turnaround watchlist criteria (10Y ROIC + TTM trough + 40% drawdown) outperform broader excluded set | 8y, PIT | **strong signal** | watchlist 3y +45.96% [+21.98%, +72.83%] vs broader excluded -4.88% [-6.25%, -3.56%]; gap +50.84 pp; N=50 | `docs/backtest-legacy-rules-2026-04-25-pit.md` | None — keep §7 as-is | 12-18 months |
| **H12-biased-2018to2023** | Same as above, biased | 8y, biased | **signal** (consistent with PIT) | watchlist 3y +32.77% vs +17.38%; gap +15.39 pp | `docs/backtest-legacy-rules-2026-04-25.md` | None | Don't re-run biased — superseded |
| **WeightVal-default-vs-legacy-PIT** | Does value-deep (50/20/10/10/10) beat legacy 35/25/15/15/10 at 3y? | 8y, PIT, top-decile | **signal** | value-deep 3y +3.29% [+0.93%, +5.72%] vs legacy -0.75% [-3.41%, +2.14%]; +4.05 pp gap, legacy CI crosses zero | `docs/backtest-weight-validation-2026-04-25-pit.md` | Migrated DEFAULT_WEIGHTS to value-deep (commit 5e1d2f7) | Re-test on pre-COVID window |
| **WeightVal-equal-weight-PIT** | Equal-weight (20/20/20/20/20) beats default? | 8y, PIT | **noise (negative)** | -8.58% 3y excess vs default — clearly underperforms | `docs/backtest-weight-validation-2026-04-25-pit.md` | Rejected | Don't re-run unless test window changes substantially |
| **WeightVal-quality-tilt-PIT** | quality-tilt (30/20/30/10/10) beats default? | 8y, PIT | **noise (negative)** | -8.06% 3y excess vs default | same | Rejected | Same |
| **WeightVal-momentum-on-PIT** | momentum-on (40/20/10/10/10/10) beats default? | 8y, PIT | **noise (slightly negative)** | +0.92% 3y excess (equivalent to default within bootstrap noise) | same | Rejected; momentum stays at 0% | Re-test if IC pipeline finds passing momentum cells in any super-group |
| **IC-cells-PIT-2018to2023** | Per-(super-group, factor, horizon) IC predictive? | 8y, PIT, 3-gate filter, 200 MC iter | **15 cells passed; FDR ratio "noise"** | 15 of 544 cells passed; FDR check 1.85× expected (noise verdict) | `docs/backtest-ic-2026-04-25-pit.md` | None in v1 (per-super-group preset adoption blocked on validation step 2) | Re-run when test window shifts or methodology improves |
| **H10-FV-trend** | fvTrend=declining demotes correctly? | n/a | **deferred** | Backtest-side FV-trend reconstruction not yet built | n/a | Pending Phase 4 backtest-side FV-trend computer | When Phase 4 ships |
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
