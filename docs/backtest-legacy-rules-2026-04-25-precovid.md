# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2011-01-31 → 2018-12-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **fail** — passed cohort 3y excess 4.99% vs failed 7.31% — failed cohort OUTPERFORMED by 2.32% (floor harmful)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 27051 | 2.54% | [2.28%, 2.83%] |
| profitable-3of5 | failed | 1y | 4277 | 2.79% | [1.95%, 3.58%] |
| profitable-3of5 | passed | 3y | 27051 | 6.35% | [5.69%, 7.08%] |
| profitable-3of5 | failed | 3y | 4277 | 3.18% | [1.28%, 5.07%] |
| sector-relative-roic | passed | 1y | 20061 | 2.21% | [1.91%, 2.52%] |
| sector-relative-roic | failed | 1y | 9474 | 3.52% | [2.96%, 4.07%] |
| sector-relative-roic | passed | 3y | 20061 | 4.10% | [3.34%, 4.91%] |
| sector-relative-roic | failed | 3y | 9474 | 10.58% | [9.13%, 12.22%] |
| interest-coverage | passed | 1y | 26164 | 2.77% | [2.48%, 3.07%] |
| interest-coverage | failed | 1y | 1734 | 4.78% | [3.53%, 6.23%] |
| interest-coverage | passed | 3y | 26164 | 7.35% | [6.63%, 8.13%] |
| interest-coverage | failed | 3y | 1734 | 9.63% | [5.98%, 13.34%] |
| combined | passed | 1y | 17974 | 2.14% | [1.81%, 2.45%] |
| combined | failed | 1y | 13682 | 3.31% | [2.86%, 3.78%] |
| combined | passed | 3y | 17974 | 4.99% | [4.22%, 5.88%] |
| combined | failed | 3y | 13682 | 7.31% | [6.13%, 8.50%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **fail** — watchlist 3y excess -5.76% vs excluded-not-watchlist 7.38% — watchlist UNDERPERFORMED by 13.15%

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 79 | 22.99% | [9.31%, 37.74%] |
| excluded-not-watchlist | 1y | 13603 | 3.19% | [2.78%, 3.62%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 79 | -5.76% | [-20.04%, 8.59%] |
| excluded-not-watchlist | 3y | 13603 | 7.38% | [6.20%, 8.48%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._