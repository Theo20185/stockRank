# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2018-04-30 → 2023-03-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **fail** — passed cohort 3y excess 6.07% vs failed 17.45% — failed cohort OUTPERFORMED by 11.38% (floor harmful)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 22823 | 2.10% | [1.72%, 2.51%] |
| profitable-3of5 | failed | 1y | 5883 | 8.57% | [7.22%, 9.99%] |
| profitable-3of5 | passed | 3y | 22823 | 2.63% | [1.58%, 3.68%] |
| profitable-3of5 | failed | 3y | 5883 | 43.47% | [36.26%, 50.76%] |
| sector-relative-roic | passed | 1y | 18299 | 3.65% | [3.15%, 4.15%] |
| sector-relative-roic | failed | 1y | 8992 | 3.42% | [2.48%, 4.47%] |
| sector-relative-roic | passed | 3y | 18299 | 9.34% | [7.99%, 10.81%] |
| sector-relative-roic | failed | 3y | 8992 | 15.55% | [11.26%, 20.39%] |
| interest-coverage | passed | 1y | 22492 | 3.29% | [2.81%, 3.82%] |
| interest-coverage | failed | 1y | 2575 | 7.49% | [5.59%, 9.39%] |
| interest-coverage | passed | 3y | 22492 | 8.70% | [7.01%, 10.45%] |
| interest-coverage | failed | 3y | 2575 | 37.73% | [30.07%, 46.68%] |
| combined | passed | 1y | 15593 | 3.17% | [2.65%, 3.66%] |
| combined | failed | 1y | 13343 | 3.80% | [3.02%, 4.55%] |
| combined | passed | 3y | 15593 | 6.07% | [4.75%, 7.47%] |
| combined | failed | 3y | 13343 | 17.45% | [14.37%, 21.04%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **pass** — watchlist 3y excess 32.77% vs excluded-not-watchlist 17.38% — gap 15.39% (criteria pick real signal)

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 61 | 22.30% | [10.65%, 36.77%] |
| excluded-not-watchlist | 1y | 13282 | 3.72% | [2.95%, 4.52%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 61 | 32.77% | [12.38%, 54.78%] |
| excluded-not-watchlist | 3y | 13282 | 17.38% | [14.08%, 20.87%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._