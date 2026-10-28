# Weight validation — 2026-10-28

**Train period:** 2011-10-31 → 2021-10-28
**Test period:** 2021-10-28 → 2023-09-30

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | -0.98% | [-3.46%, 1.35%] |
| default | default | 3y | 18 | -0.98% | [-4.23%, 2.20%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | -0.99% | [-3.96%, 2.05%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 18 | -1.87% | [-5.52%, 1.53%] |
| equal-weight | academic-prior | 1y | 24 | -2.99% | [-5.69%, 0.29%] |
| equal-weight | academic-prior | 3y | 18 | -11.01% | [-15.27%, -6.46%] |
| quality-tilt | academic-prior | 1y | 24 | -2.08% | [-5.73%, 1.46%] |
| quality-tilt | academic-prior | 3y | 18 | -4.56% | [-7.29%, -1.41%] |
| momentum-on | academic-prior | 1y | 24 | -1.39% | [-4.09%, 1.57%] |
| momentum-on | academic-prior | 3y | 18 | -6.35% | [-10.85%, -1.68%] |
| value-deep-evtilt | ic-derived | 1y | 24 | -1.72% | [-4.74%, 1.13%] |
| value-deep-evtilt | ic-derived | 3y | 18 | -4.84% | [-7.73%, -2.18%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 24 | -5.35% | [-8.82%, -1.79%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 18 | -5.92% | [-10.40%, -1.39%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | -0.98% | -2.55% | 1.57 pp |
| default | 3y | -0.98% | -17.66% | 16.68 pp |
| value-tilted-defensive-legacy | 1y | -0.99% | -3.41% | 2.41 pp |
| value-tilted-defensive-legacy | 3y | -1.87% | -17.91% | 16.04 pp |
| equal-weight | 1y | -2.99% | -2.90% | -0.09 pp |
| equal-weight | 3y | -11.01% | -11.22% | 0.21 pp |
| quality-tilt | 1y | -2.08% | -4.15% | 2.07 pp |
| quality-tilt | 3y | -4.56% | -19.37% | 14.80 pp |
| momentum-on | 1y | -1.39% | -3.97% | 2.58 pp |
| momentum-on | 3y | -6.35% | -23.38% | 17.04 pp |
| value-deep-evtilt | 1y | -1.72% | -3.64% | 1.92 pp |
| value-deep-evtilt | 3y | -4.84% | -20.11% | 15.27 pp |
| value-deep-no-declining-fundamentals | 1y | -5.35% | -6.22% | 0.86 pp |
| value-deep-no-declining-fundamentals | 3y | -5.92% | -21.34% | 15.41 pp |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | -0.98% | -0.15 | -0.14 | -8.53% |
| default | 3y | -0.98% | -0.14 | -0.13 | -6.57% |
| value-tilted-defensive-legacy | 1y | -0.99% | -0.14 | -0.14 | -11.93% |
| value-tilted-defensive-legacy | 3y | -1.87% | -0.25 | -0.20 | -11.63% |
| equal-weight | 1y | -2.99% | -0.39 | -0.39 | -14.91% |
| equal-weight | 3y | -11.01% | -1.11 | -0.66 | -12.61% |
| quality-tilt | 1y | -2.08% | -0.24 | -0.25 | -16.54% |
| quality-tilt | 3y | -4.56% | -0.70 | -0.62 | -7.52% |
| momentum-on | 1y | -1.39% | -0.19 | -0.20 | -11.78% |
| momentum-on | 3y | -6.35% | -0.64 | -0.51 | -13.04% |
| value-deep-evtilt | 1y | -1.72% | -0.23 | -0.21 | -11.30% |
| value-deep-evtilt | 3y | -4.84% | -0.79 | -0.56 | -8.20% |
| value-deep-no-declining-fundamentals | 1y | -5.35% | -0.60 | -0.48 | -13.29% |
| value-deep-no-declining-fundamentals | 3y | -5.92% | -0.54 | -0.42 | -10.61% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -0.89% | **reject** | 3y excess vs default -0.89% — below 3.0% adoption floor |
| equal-weight | -10.03% | **reject** | 3y excess vs default -10.03% — below 3.0% adoption floor |
| quality-tilt | -3.59% | **reject** | 3y excess vs default -3.59% — below 3.0% adoption floor |
| momentum-on | -5.37% | **reject** | 3y excess vs default -5.37% — below 3.0% adoption floor |
| value-deep-evtilt | -3.86% | **reject** | 3y excess vs default -3.86% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | -4.95% | **reject** | 3y excess vs default -4.95% — below 3.0% adoption floor |

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
