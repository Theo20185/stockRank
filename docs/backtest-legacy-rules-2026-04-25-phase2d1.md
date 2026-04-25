# Legacy-rule audit — 2026-04-25

**Snapshot range:** 2018-04-30 → 2023-03-31

Each legacy rule (Quality floor, Turnaround watchlist) gets the same evidence bar that new factors get under H7-H9. A rule that fails its hypothesis is queued for v2 weakening or removal — no rule, old or new, gets a free pass.

## H11 — Quality floor (per-rule + combined)

**Hypothesis:** Names excluded by the §4 Quality floor underperform the included set on 3y forward excess return

**Verdict:** **pass** — passed cohort 3y excess -6.37% vs failed -10.70% — gap 4.33% (floor justified)

| Rule | Classification | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|---|
| profitable-3of5 | passed | 1y | 22289 | -1.27% | [-1.67%, -0.87%] |
| profitable-3of5 | failed | 1y | 5146 | -0.59% | [-1.50%, 0.29%] |
| profitable-3of5 | passed | 3y | 22289 | -9.81% | [-10.68%, -8.83%] |
| profitable-3of5 | failed | 3y | 5146 | -2.23% | [-4.42%, -0.06%] |
| sector-relative-roic | passed | 1y | 17687 | -0.20% | [-0.63%, 0.26%] |
| sector-relative-roic | failed | 1y | 8427 | -2.88% | [-3.59%, -2.17%] |
| sector-relative-roic | passed | 3y | 17687 | -5.07% | [-6.15%, -3.98%] |
| sector-relative-roic | failed | 3y | 8427 | -15.33% | [-16.81%, -13.85%] |
| interest-coverage | passed | 1y | 21675 | -1.19% | [-1.59%, -0.76%] |
| interest-coverage | failed | 1y | 2241 | 0.17% | [-1.41%, 1.71%] |
| interest-coverage | passed | 3y | 21675 | -9.33% | [-10.24%, -8.35%] |
| interest-coverage | failed | 3y | 2241 | -1.23% | [-5.24%, 2.76%] |
| combined | passed | 1y | 15071 | -0.63% | [-1.07%, -0.17%] |
| combined | failed | 1y | 12484 | -1.73% | [-2.28%, -1.19%] |
| combined | passed | 3y | 15071 | -6.37% | [-7.51%, -5.25%] |
| combined | failed | 3y | 12484 | -10.70% | [-11.90%, -9.42%] |

## H12 — Turnaround watchlist criteria (§7)

**Hypothesis:** Turnaround watchlist names beat the broader §4-excluded set on 3y forward return

**Verdict:** **pass** — watchlist 3y excess 29.36% vs excluded-not-watchlist -10.94% — gap 40.30% (criteria pick real signal)

| Cohort | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| watchlist | 1y | 73 | 7.09% | [-7.80%, 22.56%] |
| excluded-not-watchlist | 1y | 12411 | -1.78% | [-2.34%, -1.23%] |
| spy | 1y | 0 | 0.00% | — |
| watchlist | 3y | 73 | 29.36% | [9.73%, 49.55%] |
| excluded-not-watchlist | 3y | 12411 | -10.94% | [-12.15%, -9.70%] |
| spy | 3y | 0 | 0.00% | — |

## H10 — FV-trend demotion (DEFERRED)

_Backtest-side FV-trend reconstruction is not yet built. H10 stratifies the universe by `fvTrend = declining` vs `stable`/`improving` at T, but the FV-trend artifact is currently only computed for live snapshots, not reconstructed at past dates. Defer until a Phase 4 backtest-side FV-trend computer is built._