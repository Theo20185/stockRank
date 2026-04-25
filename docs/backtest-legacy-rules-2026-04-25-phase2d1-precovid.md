# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2011-01-31 → 2018-12-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **pass** — passed cohort 3y excess 0.64% vs failed -1.94% — gap 2.58% (floor justified)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 31351 | 1.06% | [0.82%, 1.32%] |
| profitable-3of5 | failed | 1y | 5172 | 1.00% | [0.20%, 1.87%] |
| profitable-3of5 | passed | 3y | 31351 | 0.12% | [-0.55%, 0.78%] |
| profitable-3of5 | failed | 3y | 5172 | -4.23% | [-6.03%, -2.45%] |
| sector-relative-roic | passed | 1y | 23325 | 1.22% | [0.92%, 1.52%] |
| sector-relative-roic | failed | 1y | 11134 | 0.56% | [0.08%, 1.11%] |
| sector-relative-roic | passed | 3y | 23325 | -0.28% | [-1.01%, 0.45%] |
| sector-relative-roic | failed | 3y | 11134 | -0.81% | [-2.32%, 0.67%] |
| interest-coverage | passed | 1y | 30511 | 1.19% | [0.91%, 1.48%] |
| interest-coverage | failed | 1y | 2080 | 4.34% | [2.78%, 5.98%] |
| interest-coverage | passed | 3y | 30511 | 0.72% | [0.04%, 1.48%] |
| interest-coverage | failed | 3y | 2080 | 4.22% | [0.90%, 7.94%] |
| combined | passed | 1y | 20951 | 1.17% | [0.84%, 1.49%] |
| combined | failed | 1y | 16004 | 1.04% | [0.59%, 1.53%] |
| combined | passed | 3y | 20951 | 0.64% | [-0.11%, 1.42%] |
| combined | failed | 3y | 16004 | -1.94% | [-3.05%, -0.88%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **fail** — watchlist 3y excess -21.99% vs excluded-not-watchlist -1.71% — watchlist UNDERPERFORMED by 20.29%

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 185 | 2.05% | [-5.40%, 10.10%] |
| excluded-not-watchlist | 1y | 15819 | 1.03% | [0.61%, 1.51%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 185 | -21.99% | [-31.14%, -12.32%] |
| excluded-not-watchlist | 3y | 15819 | -1.71% | [-2.79%, -0.54%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._