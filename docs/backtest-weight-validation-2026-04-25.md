# Weight validation — 2026-04-25

**Train period:** 2018-04-30 → 2021-04-25
**Test period:** 2021-04-25 → 2023-03-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 24 | 5.24% | [2.77%, 7.80%] |
| default | default | 3y | 24 | 26.96% | [21.09%, 32.99%] |
| equal-weight | academic-prior | 1y | 24 | 4.00% | [1.45%, 6.47%] |
| equal-weight | academic-prior | 3y | 24 | 17.94% | [11.97%, 25.82%] |
| quality-tilt | academic-prior | 1y | 24 | 3.65% | [1.14%, 6.30%] |
| quality-tilt | academic-prior | 3y | 24 | 14.89% | [10.10%, 19.98%] |
| value-deep | manual | 1y | 24 | 7.01% | [4.38%, 9.88%] |
| value-deep | manual | 3y | 24 | 35.77% | [30.84%, 40.99%] |
| momentum-on | academic-prior | 1y | 24 | 5.03% | [2.40%, 7.92%] |
| momentum-on | academic-prior | 3y | 24 | 27.43% | [20.80%, 33.95%] |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| equal-weight | -9.01% | **reject** | 3y excess vs default -9.01% — below 3.0% adoption floor |
| quality-tilt | -12.07% | **reject** | 3y excess vs default -12.07% — below 3.0% adoption floor |
| value-deep | 8.81% | **adopt** | 3y excess 35.77% vs default 26.96%; CI [30.84%, 40.99%] |
| momentum-on | 0.47% | **reject** | 3y excess vs default 0.47% — below 3.0% adoption floor |

## Candidate weight vectors

### default
_ranking.md §8.1 default value-tilted defensive weights_

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

### value-deep
_Heavy value tilt — 50% Valuation_

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

### momentum-on
_Default + 10% Momentum (testing whether the IC pipeline's marginal momentum signal earns its keep)_

| Category | Weight |
|---|---|
| valuation | 30.0% |
| health | 25.0% |
| quality | 15.0% |
| shareholderReturn | 15.0% |
| growth | 5.0% |
| momentum | 10.0% |
