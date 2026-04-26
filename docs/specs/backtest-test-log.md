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
| **WeightVal-no-declining-fundamentals-PIT-2018to2023** | Phase 2B: value-deep + filter excluding fundamentalsDirection=declining beats unfiltered? | 8y, PIT, --mc-iter 100 | **noise (rejected)** | +0.20 pp 3y vs default — within bootstrap noise | `docs/backtest-weight-validation-2026-04-25.md` (overwritten by Phase 2B) | None — filter doesn't add signal | 12-18 months OR with backtest-side fvTrend reconstruction |
| **WeightVal-no-declining-fundamentals-PIT-2010to2018** | Same, pre-COVID | 8y, PIT, --max 2018-12-31, --test-start 2016-01-01 | **noise (rejected, REGIME-STABLE rejection)** | -5.36 pp 3y vs default — substantially worse. Filter HARMS in recovery regimes (kicks out names emerging from troughs that value-deep wants to buy). | `docs/backtest-weight-validation-2026-04-25-phase2b-pre-covid.md` | None — regime-stable rejection | Same |
| **H11-PIT-2018to2023-with-delisted** | Phase 2D.1: with cikFor SEC fallback, can we now properly include delisted names in the H11 audit? | 8y, PIT, --include-delisted, 503+127=630 symbols | **PASS — wider gap than survivor-only PIT** | passed cohort 3y -6.37% vs failed -10.70%; gap +4.33 pp (was +2.95 pp without delisted). FDR shifted from "noise" to "marginal." | `docs/backtest-legacy-rules-2026-04-25-phase2d1.md` | §4 floor decision unblocked. HOLD lifted. | 12-18 months OR with v3 historical-filer index |
| **H11-PIT-2010to2018-with-delisted** | Same, pre-COVID regime | 8y, PIT, pre-COVID, --include-delisted | **PASS — FLIPPED from earlier fail** | passed cohort 3y +0.64% vs failed -1.94%; gap +2.58 pp (was -2.32 pp survivor-only). The earlier regime-dependence reading was a survivorship-bias artifact. | `docs/backtest-legacy-rules-2026-04-25-phase2d1-precovid.md` | Same — confirms regime-stability of the floor's value | Same |
| **H12-PIT-2010to2018-with-delisted** | Same setup, H12 watchlist 3y | pre-COVID, with delisted | **fail — WIDER gap than survivor-only** | watchlist 3y -21.99% vs excluded -1.71%; gap -20.29 pp (was -13.15 pp without delisted). | `docs/backtest-legacy-rules-2026-04-25-phase2d1-precovid.md` | H12 verdict downgraded to "regime-dependent at 1y, regime-dependent and negative outside COVID at 3y" | Same |
| **DelistedRecovery-2026-04-25** | Phase 2D: how many of the 345 delisted S&P 500 symbols can we fetch EDGAR + chart data for? | --include-delisted, PIT, all symbols from Wikipedia changes table | **infrastructure-built / recovery 0% on EDGAR (PRE-FIX)** | chart 143/345 (41.4%); EDGAR 0/345 (0.0%); both 0/345. Local CIK lookup excludes delisted tickers. SUPERSEDED by Phase 2D.1 fix. | `docs/backtest-actions-2026-04-25-phase2.md` §2 | Phase 2D.1 fixed via SEC cikFor fallback (commit c9dbf95) | n/a |
| **DelistedRecovery-Phase2D1-2026-04-25** | Phase 2D.1 with CIK fallback: recovery rate on delisted symbols | --include-delisted, PIT, with SEC fallback | **EDGAR 36.8% (127/345)** | chart 143 + EDGAR 127 = 127 usable for snapshot building. 218 still-missing are mostly older bankruptcies / pre-2009 inactive filers. | `docs/specs/backtest-actions-2026-04-25-phase2d1.md` §3 | Universe now 630 symbols; H11/H12 audits properly include bankruptcies | After v3 historical-filer index (lower priority now §4 settled) |
| **PSG-utilities-health-tilt** | Phase 3: utilities preset (Health 30%) beats default in utilities cohort? | --super-group-presets, PIT+delisted, both regimes | **noise (rejected, 0/2 regimes)** | PIT 2018-23: -1.77 pp; PIT 2010-18: +1.19 pp (sub-threshold). N≈3.4-4.9k per cohort. | `docs/backtest-per-super-group-2026-04-26.md` + `-precovid.md` | None — preset stays empty | After IC heatmap rerun on a different methodology |
| **PSG-semis-hardware-quality-tilt** | Phase 3: Quality 25% beats default in semis-hardware cohort? | same | **mixed — won COVID big, flat pre-COVID; rejected by cross-regime rule** | PIT 2018-23: **+13.24 pp** (single-regime adopt); PIT 2010-18: +0.00 pp; only 1/2 → REJECT | same | None — but the COVID-era win is interesting for future regime-conditional preset design | Same |
| **PSG-consumer-discretionary-deep-value** | Phase 3: Valuation 55% beats default in consumer-discretionary cohort? | same | **mixed — won pre-COVID, tiny COVID; rejected by cross-regime rule** | PIT 2018-23: +0.78 pp; PIT 2010-18: **+6.44 pp** (single-regime adopt); only 1/2 → REJECT | same | None | Same |
| **PSG-consumer-staples-shareholder-return-tilt** | Phase 3: Shareholder Return 25% beats default in consumer-staples cohort? | same | **noise (rejected; 0/2 by adoption rule)** | PIT 2018-23: -3.40 pp; PIT 2010-18: +4.17 pp (CI crosses zero) | same | None | Same |
| **PSG-transport-autos-health-tilt** | Phase 3: Health 30% beats default in transport-autos cohort? | same | **noise (rejected, 0/2 regimes)** | PIT 2018-23: -2.46 pp; PIT 2010-18: -5.83 pp | same | None | Same |
| **WeightVal-evtilt-PIT-2018to2023** | Phase 1A: value-deep with EV/EBITDA-tilted Valuation (60/20/10/10) beats plain value-deep at 3y? | 8y, PIT, --mc-iter 100 | **noise (rejected)** | -1.95 pp 3y vs default (CI [-0.33%, +3.22%] crosses zero); ev-tilt UNDERPERFORMS equal-weighted value-deep | `docs/backtest-weight-validation-2026-04-25.md` (overwritten by Phase 1A run) | None — equal-weight-within-Valuation convention stays | Don't re-run identical setup — verdict 0/2 PIT regimes |
| **WeightVal-evtilt-PIT-2010to2018** | Same hypothesis, pre-COVID regime | 8y, PIT, pre-COVID | **noise (rejected, consistent w/ PIT 2018-2023)** | -2.90 pp 3y vs default | (same overwritten file) | None — second of two regimes both rejecting | Same |
| **UserPicks-INTC-2025-08-22** | Phase 1C: does value-deep surface INTC at the rank user bought? | 8y, PIT, --user-picks INTC:2025-08-22 | **strong signal** | SG rank 1/36 in Semis & Hardware; universe rank 42/484 (top 8.7%). Engine surfaces it at the very top — confirms user instinct. | `docs/backtest-user-picks-2026-04-25.md` | None — engine WORKS for this case | Re-run in 2028+ when 3y forward window closes to add realized-return validation |
| **UserPicks-TGT-2026-04-09** | Same, TGT | 8y, PIT, --user-picks | **mixed (engine lukewarm)** | SG rank 11/35 in Consumer Staples; universe rank 200/500. Five branded-beverage / packaged-food names ranked higher (TAP, STZ, KDP, GIS, CPB). | `docs/backtest-user-picks-2026-04-25.md` | None — not WRONG, just sees more value elsewhere | Re-run in 2029 when 3y forward window closes to compare engine's preferred names vs user's pick |
| **UserPicks-NVO-2026-03-06** | Same, NVO | 8y, PIT, --user-picks | **inconclusive — universe gap** | NVO is a Danish ADR not in S&P 500 list; engine can't see it. Documented as a real engine gap to address with v2 "extended universe" feature. | `docs/backtest-user-picks-2026-04-25.md` | None in v1; v2 follow-up "extended universe for non-S&P 500 personal holdings" added to roadmap | After v2 extended-universe ships |
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
| 2026-04-25 (PIT, intended crisis collapsed to 2011-only) | 2011-01 → 2011-12 (12 snapshots) | --max-snapshot-date 2011-12-31, --years 18 | 200 | same | `1948a4d` |
| 2026-04-25 (PIT, Phase 1A evtilt) | 2018-04 → 2023-03 + 2011-01 → 2018-12 | --weight-test only, value-deep-evtilt candidate | 100 | same | `4053f15` |
| 2026-04-25 (PIT, Phase 1C user-picks) | 2018-04 → 2023-03 + force-included pick dates | --user-picks NVO:2026-03-06,TGT:2026-04-09,INTC:2025-08-22 | 50 | same; emitSnapshotOnlyForMissing for open-window dates | `c84bd24` |
| 2026-04-25 (PIT, Phase 2B no-declining-fundamentals) | both regimes | new value-deep-no-declining-fundamentals candidate w/ PreDecileFilter | 100 | new fundamentalsDirection field on IcObservation | `3744bab` |
| 2026-04-25 (PIT, Phase 2D delisted attempt) | 2018-04 → 2023-03 | --include-delisted, 345 delisted symbols attempted | 100 | delisted-symbols module, EDGAR 0% recovery (CIK lookup excludes delisted) | `3744bab` |
| 2026-04-25 (PIT, Phase 2D.1 with CIK fallback) | 2018-04 → 2023-03 (also pre-COVID rerun) | --include-delisted, --node-options=--max-old-space-size=8192 | 100 | cikFor SEC fallback added 127 EDGAR-recovered delisted symbols; universe 503→630 | `c9dbf95` |
| 2026-04-26 (Phase 3 PSG validation) | both PIT regimes + delisted | --super-group-presets, 5 IC-derived candidates | 50 | per-super-group cohort filter on validation engine | `fbbfeee` |

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
