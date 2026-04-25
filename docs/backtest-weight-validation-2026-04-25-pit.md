# Weight validation — 2026-04-25

**Train period:** 2018-04-30 → 2021-04-25
**Test period:** 2021-04-25 → 2023-03-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | 2.91% | [-0.04%, 5.61%] |
| default | default | 3y | 24 | 3.29% | [0.93%, 5.72%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 24 | 2.06% | [-0.62%, 4.49%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 24 | -0.75% | [-3.41%, 2.14%] |
| equal-weight | academic-prior | 1y | 24 | 1.16% | [-1.49%, 3.93%] |
| equal-weight | academic-prior | 3y | 24 | -8.58% | [-11.71%, -5.39%] |
| quality-tilt | academic-prior | 1y | 24 | 0.75% | [-2.32%, 3.60%] |
| quality-tilt | academic-prior | 3y | 24 | -8.06% | [-11.32%, -4.23%] |
| momentum-on | academic-prior | 1y | 24 | 1.92% | [-0.71%, 4.42%] |
| momentum-on | academic-prior | 3y | 24 | 0.92% | [-1.69%, 3.66%] |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -4.05% | **reject** | 3y excess vs default -4.05% — below 3.0% adoption floor |
| equal-weight | -11.87% | **reject** | 3y excess vs default -11.87% — below 3.0% adoption floor |
| quality-tilt | -11.35% | **reject** | 3y excess vs default -11.35% — below 3.0% adoption floor |
| momentum-on | -2.37% | **reject** | 3y excess vs default -2.37% — below 3.0% adoption floor |

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
