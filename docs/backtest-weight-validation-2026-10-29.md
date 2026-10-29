# Weight validation — 2026-10-29

**Train period:** 2011-10-31 → 2021-10-29
**Test period:** 2021-10-29 → 2023-09-30

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | -0.40% | [-3.10%, 2.37%] |
| default | default | 3y | 18 | -0.71% | [-3.23%, 1.99%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | -0.86% | [-3.91%, 2.15%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 18 | -1.37% | [-4.32%, 1.42%] |
| equal-weight | academic-prior | 1y | 24 | -2.57% | [-5.27%, 0.65%] |
| equal-weight | academic-prior | 3y | 18 | -9.58% | [-13.70%, -5.34%] |
| quality-tilt | academic-prior | 1y | 24 | -1.55% | [-5.22%, 1.93%] |
| quality-tilt | academic-prior | 3y | 18 | -4.19% | [-6.56%, -1.33%] |
| momentum-on | academic-prior | 1y | 24 | -0.85% | [-3.28%, 1.86%] |
| momentum-on | academic-prior | 3y | 18 | -5.10% | [-9.65%, -0.80%] |
| value-deep-evtilt | ic-derived | 1y | 24 | -0.98% | [-4.12%, 2.00%] |
| value-deep-evtilt | ic-derived | 3y | 18 | -2.53% | [-5.45%, 0.00%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 24 | -4.43% | [-7.93%, -0.81%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 18 | -5.46% | [-9.05%, -1.45%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | -0.40% | -2.42% | 2.02 pp |
| default | 3y | -0.71% | -17.60% | 16.89 pp |
| value-tilted-defensive-legacy | 1y | -0.86% | -3.50% | 2.64 pp |
| value-tilted-defensive-legacy | 3y | -1.37% | -17.70% | 16.33 pp |
| equal-weight | 1y | -2.57% | -2.42% | -0.15 pp |
| equal-weight | 3y | -9.58% | -10.46% | 0.88 pp |
| quality-tilt | 1y | -1.55% | -4.30% | 2.75 pp |
| quality-tilt | 3y | -4.19% | -19.13% | 14.94 pp |
| momentum-on | 1y | -0.85% | -3.85% | 3.00 pp |
| momentum-on | 3y | -5.10% | -23.75% | 18.65 pp |
| value-deep-evtilt | 1y | -0.98% | -3.64% | 2.65 pp |
| value-deep-evtilt | 3y | -2.53% | -21.76% | 19.23 pp |
| value-deep-no-declining-fundamentals | 1y | -4.43% | -4.96% | 0.52 pp |
| value-deep-no-declining-fundamentals | 3y | -5.46% | -18.02% | 12.56 pp |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | -0.40% | -0.06 | -0.06 | -10.82% |
| default | 3y | -0.71% | -0.12 | -0.09 | -6.19% |
| value-tilted-defensive-legacy | 1y | -0.86% | -0.12 | -0.12 | -12.71% |
| value-tilted-defensive-legacy | 3y | -1.37% | -0.21 | -0.19 | -10.71% |
| equal-weight | 1y | -2.57% | -0.33 | -0.35 | -14.98% |
| equal-weight | 3y | -9.58% | -1.05 | -0.65 | -11.84% |
| quality-tilt | 1y | -1.55% | -0.18 | -0.20 | -16.45% |
| quality-tilt | 3y | -4.19% | -0.74 | -0.62 | -5.49% |
| momentum-on | 1y | -0.85% | -0.13 | -0.14 | -10.81% |
| momentum-on | 3y | -5.10% | -0.53 | -0.43 | -14.00% |
| value-deep-evtilt | 1y | -0.98% | -0.13 | -0.12 | -13.81% |
| value-deep-evtilt | 3y | -2.53% | -0.43 | -0.33 | -8.59% |
| value-deep-no-declining-fundamentals | 1y | -4.43% | -0.50 | -0.41 | -13.12% |
| value-deep-no-declining-fundamentals | 3y | -5.46% | -0.60 | -0.45 | -8.09% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -0.66% | **reject** | 3y excess vs default -0.66% — below 3.0% adoption floor |
| equal-weight | -8.88% | **reject** | 3y excess vs default -8.88% — below 3.0% adoption floor |
| quality-tilt | -3.48% | **reject** | 3y excess vs default -3.48% — below 3.0% adoption floor |
| momentum-on | -4.40% | **reject** | 3y excess vs default -4.40% — below 3.0% adoption floor |
| value-deep-evtilt | -1.83% | **reject** | 3y excess vs default -1.83% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | -4.76% | **reject** | 3y excess vs default -4.76% — below 3.0% adoption floor |

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
