# Weight validation — 2026-04-26

**Train period:** 2011-01-31 → 2016-01-01
**Test period:** 2016-01-01 → 2018-12-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 36 | 0.96% | [-0.97%, 3.06%] |
| default | default | 3y | 36 | -0.86% | [-4.58%, 3.03%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 36 | 0.52% | [-1.20%, 2.54%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 36 | -4.19% | [-8.92%, 0.44%] |
| equal-weight | academic-prior | 1y | 36 | -1.47% | [-3.01%, 0.31%] |
| equal-weight | academic-prior | 3y | 36 | -7.36% | [-12.38%, -2.32%] |
| quality-tilt | academic-prior | 1y | 36 | -0.72% | [-2.47%, 1.32%] |
| quality-tilt | academic-prior | 3y | 36 | -7.25% | [-11.61%, -2.99%] |
| momentum-on | academic-prior | 1y | 36 | 1.60% | [0.15%, 3.36%] |
| momentum-on | academic-prior | 3y | 36 | 2.47% | [-1.83%, 7.10%] |
| value-deep-evtilt | ic-derived | 1y | 36 | 0.35% | [-1.28%, 2.41%] |
| value-deep-evtilt | ic-derived | 3y | 36 | -4.19% | [-8.21%, -0.61%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 36 | 0.27% | [-2.32%, 2.94%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 36 | -0.98% | [-5.57%, 3.95%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | 0.96% | -0.09% | 1.05 pp |
| default | 3y | -0.86% | 5.03% | -5.88 pp |
| value-tilted-defensive-legacy | 1y | 0.52% | 0.42% | 0.10 pp |
| value-tilted-defensive-legacy | 3y | -4.19% | 6.59% | -10.78 pp |
| equal-weight | 1y | -1.47% | -0.63% | -0.84 pp |
| equal-weight | 3y | -7.36% | 2.50% | -9.86 pp |
| quality-tilt | 1y | -0.72% | 0.95% | -1.67 pp |
| quality-tilt | 3y | -7.25% | 8.27% | -15.52 pp |
| momentum-on | 1y | 1.60% | 0.26% | 1.34 pp |
| momentum-on | 3y | 2.47% | 2.18% | 0.29 pp |
| value-deep-evtilt | 1y | 0.35% | -1.21% | 1.55 pp |
| value-deep-evtilt | 3y | -4.19% | 2.99% | -7.19 pp |
| value-deep-no-declining-fundamentals | 1y | 0.27% | 0.07% | 0.21 pp |
| value-deep-no-declining-fundamentals | 3y | -0.98% | 11.64% | -12.62 pp |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | 0.96% | 0.14 | 0.31 | -25.02% |
| default | 3y | -0.86% | -0.07 | -0.08 | -24.65% |
| value-tilted-defensive-legacy | 1y | 0.52% | 0.09 | 0.16 | -22.81% |
| value-tilted-defensive-legacy | 3y | -4.19% | -0.30 | -0.26 | -27.51% |
| equal-weight | 1y | -1.47% | -0.28 | -0.34 | -19.79% |
| equal-weight | 3y | -7.36% | -0.48 | -0.41 | -33.38% |
| quality-tilt | 1y | -0.72% | -0.12 | -0.16 | -22.77% |
| quality-tilt | 3y | -7.25% | -0.56 | -0.46 | -29.94% |
| momentum-on | 1y | 1.60% | 0.32 | 0.51 | -21.00% |
| momentum-on | 3y | 2.47% | 0.19 | 0.22 | -20.67% |
| value-deep-evtilt | 1y | 0.35% | 0.06 | 0.11 | -26.45% |
| value-deep-evtilt | 3y | -4.19% | -0.35 | -0.33 | -27.23% |
| value-deep-no-declining-fundamentals | 1y | 0.27% | 0.03 | 0.04 | -23.33% |
| value-deep-no-declining-fundamentals | 3y | -0.98% | -0.07 | -0.07 | -34.21% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -3.33% | **reject** | 3y excess vs default -3.33% — below 3.0% adoption floor |
| equal-weight | -6.50% | **reject** | 3y excess vs default -6.50% — below 3.0% adoption floor |
| quality-tilt | -6.39% | **reject** | 3y excess vs default -6.39% — below 3.0% adoption floor |
| momentum-on | 3.32% | **reject** | candidate's 3y excess CI crosses zero — outperformance not statistically distinguishable from zero |
| value-deep-evtilt | -3.34% | **reject** | 3y excess vs default -3.34% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | -0.13% | **reject** | 3y excess vs default -0.13% — below 3.0% adoption floor |

## Candidate weight vectors

### default
_ranking.md §8.1 current default (value-deep, 50/20/10/10/10/0 since 2026-04-25)_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### value-tilted-defensive-legacy
_Prior default before the 2026-04-25 migration (35/25/15/15/10/0)_

| Category | Weight |
|---|---|
| valuation | 35.0% |
| health | 25.0% |
| quality | 15.0% |
| shareholderReturn | 15.0% |
| growth | 10.0% |
| momentum | 0.0% |

### equal-weight
_Academic prior — all categories weighted equally (excluding momentum)_

| Category | Weight |
|---|---|
| valuation | 20.0% |
| health | 20.0% |
| quality | 20.0% |
| shareholderReturn | 20.0% |
| growth | 20.0% |
| momentum | 0.0% |

### quality-tilt
_Boosts Quality from 15% to 30% (academic prior favoring profitability)_

| Category | Weight |
|---|---|
| valuation | 30.0% |
| health | 20.0% |
| quality | 30.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### momentum-on
_Default + 10% Momentum (testing whether the IC pipeline's marginal momentum signal earns its keep)_

| Category | Weight |
|---|---|
| valuation | 40.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 10.0% |

### value-deep-evtilt
_value-deep with EV/EBITDA-tilted Valuation (60% EV/EBITDA, 20% P/FCF, 10% P/E, 10% P/B)_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### value-deep-no-declining-fundamentals
_value-deep + pre-decile filter excluding fundamentalsDirection='declining'_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |
