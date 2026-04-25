# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2018-04-30 → 2023-03-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **pass** — passed cohort 3y excess -1.70% vs failed -4.65% — gap 2.95% (floor justified)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 20118 | 0.12% | [-0.32%, 0.52%] |
| profitable-3of5 | failed | 1y | 4635 | 1.74% | [0.79%, 2.74%] |
| profitable-3of5 | passed | 3y | 20118 | -4.66% | [-5.50%, -3.82%] |
| profitable-3of5 | failed | 3y | 4635 | 3.21% | [1.03%, 5.57%] |
| sector-relative-roic | passed | 1y | 15976 | 1.22% | [0.76%, 1.66%] |
| sector-relative-roic | failed | 1y | 7513 | -0.84% | [-1.53%, -0.17%] |
| sector-relative-roic | passed | 3y | 15976 | -0.73% | [-1.86%, 0.34%] |
| sector-relative-roic | failed | 3y | 7513 | -7.91% | [-9.46%, -6.45%] |
| interest-coverage | passed | 1y | 19429 | 0.39% | [-0.01%, 0.82%] |
| interest-coverage | failed | 1y | 1987 | 2.35% | [0.81%, 3.96%] |
| interest-coverage | passed | 3y | 19429 | -4.09% | [-5.09%, -3.15%] |
| interest-coverage | failed | 3y | 1987 | 7.03% | [2.88%, 11.53%] |
| combined | passed | 1y | 13555 | 0.72% | [0.24%, 1.25%] |
| combined | failed | 1y | 11279 | 0.16% | [-0.39%, 0.72%] |
| combined | passed | 3y | 13555 | -1.70% | [-2.99%, -0.45%] |
| combined | failed | 3y | 11279 | -4.65% | [-6.00%, -3.31%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **pass** — watchlist 3y excess 45.96% vs excluded-not-watchlist -4.88% — gap 50.84% (criteria pick real signal)

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 50 | 18.54% | [5.68%, 31.94%] |
| excluded-not-watchlist | 1y | 11229 | 0.08% | [-0.49%, 0.65%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 50 | 45.96% | [21.98%, 72.83%] |
| excluded-not-watchlist | 3y | 11229 | -4.88% | [-6.25%, -3.56%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._