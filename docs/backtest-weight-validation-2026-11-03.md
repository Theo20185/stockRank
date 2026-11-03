# Weight validation — 2026-11-03

**Train period:** 2011-11-30 → 2021-11-03
**Test period:** 2021-11-03 → 2023-10-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | -0.25% | [-2.86%, 2.74%] |
| default | default | 3y | 17 | -4.63% | [-9.60%, 0.55%] |
| default-normalized | normalization-candidate | 1y | 24 | -1.28% | [-4.67%, 1.92%] |
| default-normalized | normalization-candidate | 3y | 17 | -5.78% | [-8.44%, -3.31%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | -1.44% | [-3.96%, 1.29%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 17 | -11.97% | [-15.94%, -7.47%] |
| equal-weight | academic-prior | 1y | 24 | -3.31% | [-5.97%, -0.25%] |
| equal-weight | academic-prior | 3y | 17 | -15.49% | [-21.23%, -9.35%] |
| quality-tilt | academic-prior | 1y | 24 | -2.31% | [-5.66%, 0.57%] |
| quality-tilt | academic-prior | 3y | 17 | -10.84% | [-14.33%, -6.96%] |
| momentum-on | academic-prior | 1y | 24 | -1.24% | [-3.83%, 1.54%] |
| momentum-on | academic-prior | 3y | 17 | -13.31% | [-18.86%, -8.27%] |
| value-deep-evtilt | ic-derived | 1y | 24 | -1.58% | [-4.30%, 1.27%] |
| value-deep-evtilt | ic-derived | 3y | 17 | -7.79% | [-11.51%, -4.18%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 24 | -3.79% | [-7.24%, -0.32%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 17 | -10.40% | [-15.57%, -5.02%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | -0.25% | -1.91% | 1.66 pp |
| default | 3y | -4.63% | -16.19% | 11.56 pp |
| default-normalized | 1y | -1.28% | 0.70% | -1.98 pp |
| default-normalized | 3y | -5.78% | 0.12% | -5.90 pp |
| value-tilted-defensive-legacy | 1y | -1.44% | -3.24% | 1.80 pp |
| value-tilted-defensive-legacy | 3y | -11.97% | -16.18% | 4.21 pp |
| equal-weight | 1y | -3.31% | -2.61% | -0.69 pp |
| equal-weight | 3y | -15.49% | -7.60% | -7.89 pp |
| quality-tilt | 1y | -2.31% | -3.15% | 0.83 pp |
| quality-tilt | 3y | -10.84% | -11.57% | 0.73 pp |
| momentum-on | 1y | -1.24% | -3.69% | 2.46 pp |
| momentum-on | 3y | -13.31% | -23.06% | 9.74 pp |
| value-deep-evtilt | 1y | -1.58% | -4.59% | 3.01 pp |
| value-deep-evtilt | 3y | -7.79% | -23.30% | 15.51 pp |
| value-deep-no-declining-fundamentals | 1y | -3.79% | -4.69% | 0.91 pp |
| value-deep-no-declining-fundamentals | 3y | -10.40% | -14.40% | 4.00 pp |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | -0.25% | -0.04 | -0.04 | -15.98% |
| default | 3y | -4.63% | -0.43 | -0.34 | -14.98% |
| default-normalized | 1y | -1.28% | -0.16 | -0.17 | -16.31% |
| default-normalized | 3y | -5.78% | -1.05 | -0.67 | -6.84% |
| value-tilted-defensive-legacy | 1y | -1.44% | -0.21 | -0.23 | -17.34% |
| value-tilted-defensive-legacy | 3y | -11.97% | -1.32 | -0.79 | -20.42% |
| equal-weight | 1y | -3.31% | -0.44 | -0.43 | -18.46% |
| equal-weight | 3y | -15.49% | -1.23 | -0.77 | -27.39% |
| quality-tilt | 1y | -2.31% | -0.29 | -0.28 | -17.91% |
| quality-tilt | 3y | -10.84% | -1.38 | -0.80 | -12.11% |
| momentum-on | 1y | -1.24% | -0.19 | -0.22 | -13.40% |
| momentum-on | 3y | -13.31% | -1.15 | -0.73 | -25.87% |
| value-deep-evtilt | 1y | -1.58% | -0.21 | -0.19 | -13.72% |
| value-deep-evtilt | 3y | -7.79% | -0.93 | -0.65 | -12.26% |
| value-deep-no-declining-fundamentals | 1y | -3.79% | -0.43 | -0.35 | -17.90% |
| value-deep-no-declining-fundamentals | 3y | -10.40% | -0.94 | -0.64 | -20.94% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| default-normalized | -1.15% | **reject** | 3y excess vs default -1.15% — below 3.0% adoption floor |
| value-tilted-defensive-legacy | -7.34% | **reject** | 3y excess vs default -7.34% — below 3.0% adoption floor |
| equal-weight | -10.86% | **reject** | 3y excess vs default -10.86% — below 3.0% adoption floor |
| quality-tilt | -6.21% | **reject** | 3y excess vs default -6.21% — below 3.0% adoption floor |
| momentum-on | -8.68% | **reject** | 3y excess vs default -8.68% — below 3.0% adoption floor |
| value-deep-evtilt | -3.16% | **reject** | 3y excess vs default -3.16% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | -5.77% | **reject** | 3y excess vs default -5.77% — below 3.0% adoption floor |

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

### default-normalized
_Default category weights with spike-guarded variants replacing the raw contaminated factors (peRatio, evToEbitda, interestCoverage, debtToEbitda, roic, epsGrowth7Y) — adoption per ranking.md candidate-factors rules (non-inferiority)_

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
