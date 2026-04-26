# Weight validation — 2026-04-26

**Train period:** 2018-04-30 → 2021-04-26
**Test period:** 2021-04-26 → 2023-03-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | 1.08% | [-1.52%, 3.55%] |
| default | default | 3y | 24 | -2.03% | [-4.52%, 0.56%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | 0.76% | [-1.74%, 3.11%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 24 | -3.68% | [-6.45%, -0.67%] |
| equal-weight | academic-prior | 1y | 24 | -0.18% | [-2.74%, 2.56%] |
| equal-weight | academic-prior | 3y | 24 | -12.73% | [-16.25%, -9.26%] |
| quality-tilt | academic-prior | 1y | 24 | -0.18% | [-3.07%, 2.53%] |
| quality-tilt | academic-prior | 3y | 24 | -10.68% | [-14.18%, -6.52%] |
| momentum-on | academic-prior | 1y | 24 | 0.24% | [-2.35%, 2.69%] |
| momentum-on | academic-prior | 3y | 24 | -1.84% | [-4.15%, 0.70%] |
| value-deep-evtilt | ic-derived | 1y | 24 | -0.08% | [-2.80%, 2.13%] |
| value-deep-evtilt | ic-derived | 3y | 24 | -5.19% | [-7.35%, -2.91%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 24 | 1.70% | [-1.42%, 4.76%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 24 | -0.47% | [-4.33%, 3.47%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | 1.08% | -4.43% | 5.51 pp |
| default | 3y | -2.03% | -25.01% | 22.98 pp |
| value-tilted-defensive-legacy | 1y | 0.76% | -5.83% | 6.59 pp |
| value-tilted-defensive-legacy | 3y | -3.68% | -24.43% | 20.75 pp |
| equal-weight | 1y | -0.18% | -5.59% | 5.42 pp |
| equal-weight | 3y | -12.73% | -24.40% | 11.66 pp |
| quality-tilt | 1y | -0.18% | -6.40% | 6.22 pp |
| quality-tilt | 3y | -10.68% | -27.20% | 16.51 pp |
| momentum-on | 1y | 0.24% | -5.59% | 5.84 pp |
| momentum-on | 3y | -1.84% | -31.15% | 29.31 pp |
| value-deep-evtilt | 1y | -0.08% | -4.64% | 4.55 pp |
| value-deep-evtilt | 3y | -5.19% | -26.72% | 21.53 pp |
| value-deep-no-declining-fundamentals | 1y | 1.70% | -2.65% | 4.35 pp |
| value-deep-no-declining-fundamentals | 3y | -0.47% | -24.62% | 24.16 pp |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | 1.08% | 0.17 | 0.17 | -3.42% |
| default | 3y | -2.03% | -0.32 | -0.31 | -4.62% |
| value-tilted-defensive-legacy | 1y | 0.76% | 0.12 | 0.11 | -3.52% |
| value-tilted-defensive-legacy | 3y | -3.68% | -0.52 | -0.44 | -10.50% |
| equal-weight | 1y | -0.18% | -0.03 | -0.02 | -5.00% |
| equal-weight | 3y | -12.73% | -1.41 | -0.79 | -6.44% |
| quality-tilt | 1y | -0.18% | -0.03 | -0.02 | -5.34% |
| quality-tilt | 3y | -10.68% | -1.08 | -0.71 | -5.88% |
| momentum-on | 1y | 0.24% | 0.04 | 0.04 | -5.06% |
| momentum-on | 3y | -1.84% | -0.30 | -0.26 | -4.27% |
| value-deep-evtilt | 1y | -0.08% | -0.01 | -0.01 | -5.21% |
| value-deep-evtilt | 3y | -5.19% | -0.91 | -0.64 | -8.03% |
| value-deep-no-declining-fundamentals | 1y | 1.70% | 0.22 | 0.24 | -4.19% |
| value-deep-no-declining-fundamentals | 3y | -0.47% | -0.04 | -0.04 | -4.57% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -1.65% | **reject** | 3y excess vs default -1.65% — below 3.0% adoption floor |
| equal-weight | -10.70% | **reject** | 3y excess vs default -10.70% — below 3.0% adoption floor |
| quality-tilt | -8.65% | **reject** | 3y excess vs default -8.65% — below 3.0% adoption floor |
| momentum-on | 0.19% | **reject** | 3y excess vs default 0.19% — below 3.0% adoption floor |
| value-deep-evtilt | -3.16% | **reject** | 3y excess vs default -3.16% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | 1.56% | **reject** | 3y excess vs default 1.56% — below 3.0% adoption floor |

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
