# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2011-01-31 → 2011-12-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **fail** — passed cohort 3y excess 10.91% vs failed 13.57% — failed cohort OUTPERFORMED by 2.66% (floor harmful)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 2879 | 1.01% | [0.18%, 1.80%] |
| profitable-3of5 | failed | 1y | 467 | 3.00% | [0.25%, 5.72%] |
| profitable-3of5 | passed | 3y | 2879 | 14.08% | [11.91%, 16.28%] |
| profitable-3of5 | failed | 3y | 467 | 4.74% | [0.55%, 9.14%] |
| sector-relative-roic | passed | 1y | 2180 | 0.79% | [-0.11%, 1.69%] |
| sector-relative-roic | failed | 1y | 1026 | 2.00% | [0.42%, 3.71%] |
| sector-relative-roic | passed | 3y | 2180 | 9.03% | [6.76%, 11.23%] |
| sector-relative-roic | failed | 3y | 1026 | 20.83% | [16.98%, 24.63%] |
| interest-coverage | passed | 1y | 2762 | 1.51% | [0.63%, 2.42%] |
| interest-coverage | failed | 1y | 201 | -0.88% | [-4.17%, 2.52%] |
| interest-coverage | passed | 3y | 2762 | 13.16% | [11.02%, 15.68%] |
| interest-coverage | failed | 3y | 201 | 12.52% | [5.28%, 19.38%] |
| combined | passed | 1y | 1930 | 0.66% | [-0.24%, 1.65%] |
| combined | failed | 1y | 1513 | 2.34% | [1.09%, 3.65%] |
| combined | passed | 3y | 1930 | 10.91% | [8.51%, 13.55%] |
| combined | failed | 3y | 1513 | 13.57% | [10.66%, 16.66%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **inconclusive** — watchlist N=1 too small for verdict

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 1 | 6.53% | — |
| excluded-not-watchlist | 1y | 1512 | 2.34% | [1.07%, 3.67%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 1 | -16.22% | — |
| excluded-not-watchlist | 3y | 1512 | 13.59% | [10.64%, 16.63%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._