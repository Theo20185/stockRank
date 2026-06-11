# Weight validation — 2026-06-11

**Train period:** 2018-06-30 → 2021-06-11
**Test period:** 2021-06-11 → 2023-05-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | 0.97% | [-1.57%, 3.59%] |
| default | default | 3y | 22 | -1.85% | [-4.37%, 0.78%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | 0.68% | [-1.64%, 2.98%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 22 | -4.41% | [-7.33%, -1.44%] |
| equal-weight | academic-prior | 1y | 24 | -0.16% | [-2.97%, 2.68%] |
| equal-weight | academic-prior | 3y | 22 | -12.80% | [-16.69%, -8.68%] |
| quality-tilt | academic-prior | 1y | 24 | -0.09% | [-3.06%, 2.63%] |
| quality-tilt | academic-prior | 3y | 22 | -10.85% | [-14.76%, -6.51%] |
| momentum-on | academic-prior | 1y | 24 | 0.33% | [-2.28%, 2.93%] |
| momentum-on | academic-prior | 3y | 22 | -1.33% | [-4.25%, 1.50%] |
| value-deep-evtilt | ic-derived | 1y | 24 | 0.03% | [-2.45%, 2.52%] |
| value-deep-evtilt | ic-derived | 3y | 22 | -4.82% | [-7.37%, -2.21%] |
| value-deep-no-declining-fundamentals | screen-stack | 1y | 24 | 1.71% | [-1.31%, 4.76%] |
| value-deep-no-declining-fundamentals | screen-stack | 3y | 22 | -0.88% | [-5.51%, 3.35%] |
| voo-buy-and-hold | static-baseline | 1y | 24 | 0.00% | [0.00%, 0.00%] |
| voo-buy-and-hold | static-baseline | 3y | 22 | 0.00% | [0.00%, 0.00%] |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | static-barbell | 1y | 24 | 0.70% | [-2.65%, 3.82%] |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | static-barbell | 3y | 22 | -14.98% | [-19.68%, -10.28%] |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | static-barbell | 1y | 24 | 2.20% | [-0.83%, 5.51%] |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | static-barbell | 3y | 22 | -9.63% | [-13.90%, -5.03%] |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | static-barbell | 1y | 24 | 3.70% | [0.69%, 6.62%] |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | static-barbell | 3y | 22 | -3.99% | [-8.52%, 0.53%] |
| voo-csp-100 (coll 4.5% + put 6.0%) | static-csp | 1y | 24 | 4.40% | [-2.36%, 10.54%] |
| voo-csp-100 (coll 4.5% + put 6.0%) | static-csp | 3y | 22 | -19.27% | [-28.98%, -10.60%] |

## Long/short factor isolation (Phase 4A)

Top decile = the candidate's buy list. Bottom decile = the candidate's avoid list. Long/short = top − bottom — when positive, the candidate's ranking has signal in BOTH tails (top is good AND bottom is bad). When ≈ 0, the edge is one-sided.

| Candidate | Horizon | Top mean | Bottom mean | Long/short Δ |
|---|---|---|---|---|
| default | 1y | 0.97% | -5.00% | 5.97 pp |
| default | 3y | -1.85% | -26.19% | 24.34 pp |
| value-tilted-defensive-legacy | 1y | 0.68% | -6.75% | 7.43 pp |
| value-tilted-defensive-legacy | 3y | -4.41% | -25.53% | 21.13 pp |
| equal-weight | 1y | -0.16% | -5.88% | 5.72 pp |
| equal-weight | 3y | -12.80% | -24.59% | 11.79 pp |
| quality-tilt | 1y | -0.09% | -6.76% | 6.67 pp |
| quality-tilt | 3y | -10.85% | -28.21% | 17.36 pp |
| momentum-on | 1y | 0.33% | -6.29% | 6.62 pp |
| momentum-on | 3y | -1.33% | -32.86% | 31.53 pp |
| value-deep-evtilt | 1y | 0.03% | -5.27% | 5.30 pp |
| value-deep-evtilt | 3y | -4.82% | -27.49% | 22.67 pp |
| value-deep-no-declining-fundamentals | 1y | 1.71% | -3.75% | 5.46 pp |
| value-deep-no-declining-fundamentals | 3y | -0.88% | -26.47% | 25.59 pp |
| voo-buy-and-hold | 1y | 0.00% | — | — |
| voo-buy-and-hold | 3y | 0.00% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 1y | 0.70% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 3y | -14.98% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 1y | 2.20% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 3y | -9.63% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 1y | 3.70% | — | — |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 3y | -3.99% | — | — |
| voo-csp-100 (coll 4.5% + put 6.0%) | 1y | 4.40% | — | — |
| voo-csp-100 (coll 4.5% + put 6.0%) | 3y | -19.27% | — | — |

## Risk-adjusted comparison (Phase 4B)

Sharpe-like = mean / stddev of per-snapshot excess. Sortino-like = mean / downside-stddev (variance of negative excess only — matches value-tilted-defensive preference for asymmetric returns). Max DD = worst drawdown of the running mean of per-snapshot excess across the test window. Higher Sharpe/Sortino = better risk-adjusted; less-negative max DD = smoother ride.

| Candidate | Horizon | Mean excess | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|---|
| default | 1y | 0.97% | 0.15 | 0.15 | -3.81% |
| default | 3y | -1.85% | -0.29 | -0.30 | -2.09% |
| value-tilted-defensive-legacy | 1y | 0.68% | 0.11 | 0.10 | -4.60% |
| value-tilted-defensive-legacy | 3y | -4.41% | -0.62 | -0.51 | -3.88% |
| equal-weight | 1y | -0.16% | -0.02 | -0.02 | -6.59% |
| equal-weight | 3y | -12.80% | -1.32 | -0.75 | -8.20% |
| quality-tilt | 1y | -0.09% | -0.01 | -0.01 | -6.57% |
| quality-tilt | 3y | -10.85% | -1.09 | -0.73 | -7.50% |
| momentum-on | 1y | 0.33% | 0.05 | 0.05 | -4.60% |
| momentum-on | 3y | -1.33% | -0.20 | -0.17 | -2.01% |
| value-deep-evtilt | 1y | 0.03% | 0.00 | 0.00 | -4.06% |
| value-deep-evtilt | 3y | -4.82% | -0.76 | -0.60 | -4.43% |
| value-deep-no-declining-fundamentals | 1y | 1.71% | 0.22 | 0.22 | -5.51% |
| value-deep-no-declining-fundamentals | 3y | -0.88% | -0.08 | -0.07 | -6.53% |
| voo-buy-and-hold | 1y | 0.00% | — | — | — |
| voo-buy-and-hold | 3y | 0.00% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 1y | 0.70% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 3y | -14.98% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 1y | 2.20% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 3y | -9.63% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 1y | 3.70% | — | — | — |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 3y | -3.99% | — | — | — |
| voo-csp-100 (coll 4.5% + put 6.0%) | 1y | 4.40% | — | — | — |
| voo-csp-100 (coll 4.5% + put 6.0%) | 3y | -19.27% | — | — | — |

## After-cost / after-tax (frictions overlay)

Cumulative realized return at the horizon, with the candidate's implied turnover applied as a per-trade-cost drag, then taxed under three regimes. **Tax-free** is `afterFriction` (use for IRA/401k). **LTCG** taxes the whole gain at the combined 37.1% rate (20% Fed + 13.3% CA + 3.8% NIIT). **Blended** splits the candidate's `incomeShare` portion at STCG (54.1% combined) and the remainder at LTCG when held > 1y, else STCG on the whole thing.

| Candidate | Horizon | Mean realized | After friction | After tax (LTCG) | After tax (blended) |
|---|---|---|---|---|---|
| default | 1y | 0.97% | 6.67% | 4.20% | 3.06% |
| default | 3y | -1.85% | 51.94% | 32.67% | 32.67% |
| value-tilted-defensive-legacy | 1y | 0.68% | 6.38% | 4.02% | 2.93% |
| value-tilted-defensive-legacy | 3y | -4.41% | 49.38% | 31.06% | 31.06% |
| equal-weight | 1y | -0.16% | 5.54% | 3.49% | 2.54% |
| equal-weight | 3y | -12.80% | 40.99% | 25.78% | 25.78% |
| quality-tilt | 1y | -0.09% | 5.61% | 3.53% | 2.58% |
| quality-tilt | 3y | -10.85% | 42.94% | 27.01% | 27.01% |
| momentum-on | 1y | 0.33% | 6.03% | 3.80% | 2.77% |
| momentum-on | 3y | -1.33% | 52.46% | 33.00% | 33.00% |
| value-deep-evtilt | 1y | 0.03% | 5.73% | 3.61% | 2.63% |
| value-deep-evtilt | 3y | -4.82% | 48.97% | 30.80% | 30.80% |
| value-deep-no-declining-fundamentals | 1y | 1.71% | 7.42% | 4.67% | 3.40% |
| value-deep-no-declining-fundamentals | 3y | -0.88% | 52.91% | 33.28% | 33.28% |
| voo-buy-and-hold | 1y | 6.10% | 6.10% | 3.84% | 2.80% |
| voo-buy-and-hold | 3y | 54.19% | 54.19% | 34.09% | 34.09% |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 1y | 6.80% | 6.60% | 4.15% | 3.03% |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | 3y | 39.21% | 38.61% | 24.29% | 21.00% |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 1y | 8.30% | 8.10% | 5.10% | 3.72% |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | 3y | 44.56% | 43.96% | 27.65% | 23.91% |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 1y | 9.80% | 9.60% | 6.04% | 4.41% |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | 3y | 50.20% | 49.60% | 31.20% | 26.98% |
| voo-csp-100 (coll 4.5% + put 6.0%) | 1y | 10.50% | 10.10% | 6.35% | 4.64% |
| voo-csp-100 (coll 4.5% + put 6.0%) | 3y | 34.92% | 33.72% | 21.21% | 15.48% |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -2.56% | **reject** | 3y excess vs default -2.56% — below 3.0% adoption floor |
| equal-weight | -10.95% | **reject** | 3y excess vs default -10.95% — below 3.0% adoption floor |
| quality-tilt | -9.01% | **reject** | 3y excess vs default -9.01% — below 3.0% adoption floor |
| momentum-on | 0.52% | **reject** | 3y excess vs default 0.52% — below 3.0% adoption floor |
| value-deep-evtilt | -2.97% | **reject** | 3y excess vs default -2.97% — below 3.0% adoption floor |
| value-deep-no-declining-fundamentals | 0.97% | **reject** | 3y excess vs default 0.97% — below 3.0% adoption floor |
| voo-buy-and-hold | 1.85% | **reject** | 3y excess vs default 1.85% — below 3.0% adoption floor |
| voo-barbell-50/50 (coll 4.5% + put 3.0%) | -13.13% | **reject** | 3y excess vs default -13.13% — below 3.0% adoption floor |
| voo-barbell-50/50 (coll 4.5% + put 6.0%) | -7.79% | **reject** | 3y excess vs default -7.79% — below 3.0% adoption floor |
| voo-barbell-50/50 (coll 4.5% + put 9.0%) | -2.14% | **reject** | 3y excess vs default -2.14% — below 3.0% adoption floor |
| voo-csp-100 (coll 4.5% + put 6.0%) | -17.42% | **reject** | 3y excess vs default -17.42% — below 3.0% adoption floor |

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

### voo-buy-and-hold
_100% VOO bought once, held — captures the full SPY total return_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### voo-barbell-50/50 (coll 4.5% + put 3.0%)
_50% VOO outright + 50% as VOO CSP collateral — captures half of SPY plus half of the collateral+premium yield_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### voo-barbell-50/50 (coll 4.5% + put 6.0%)
_50% VOO outright + 50% as VOO CSP collateral — captures half of SPY plus half of the collateral+premium yield_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### voo-barbell-50/50 (coll 4.5% + put 9.0%)
_50% VOO outright + 50% as VOO CSP collateral — captures half of SPY plus half of the collateral+premium yield_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### voo-csp-100 (coll 4.5% + put 6.0%)
_100% of capital sits as VOO CSP collateral — collateral interest + put premium income, no SPY exposure except on assignment_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |
