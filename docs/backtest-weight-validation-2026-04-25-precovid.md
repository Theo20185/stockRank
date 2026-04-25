# Weight validation — 2026-04-25

**Train period:** 2011-01-31 → 2016-01-01
**Test period:** 2016-01-01 → 2018-12-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 36 | 3.40% | [1.70%, 5.22%] |
| default | default | 3y | 36 | 8.29% | [4.91%, 11.86%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 36 | 2.27% | [0.92%, 3.82%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 36 | 2.56% | [-1.74%, 6.87%] |
| equal-weight | academic-prior | 1y | 36 | 1.28% | [-0.34%, 3.16%] |
| equal-weight | academic-prior | 3y | 36 | -0.13% | [-4.55%, 4.85%] |
| quality-tilt | academic-prior | 1y | 36 | 1.48% | [-0.24%, 3.35%] |
| quality-tilt | academic-prior | 3y | 36 | 0.07% | [-3.67%, 3.64%] |
| momentum-on | academic-prior | 1y | 36 | 3.30% | [1.79%, 5.09%] |
| momentum-on | academic-prior | 3y | 36 | 8.51% | [4.56%, 12.88%] |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | -5.72% | **reject** | 3y excess vs default -5.72% — below 3.0% adoption floor |
| equal-weight | -8.42% | **reject** | 3y excess vs default -8.42% — below 3.0% adoption floor |
| quality-tilt | -8.22% | **reject** | 3y excess vs default -8.22% — below 3.0% adoption floor |
| momentum-on | 0.22% | **reject** | 3y excess vs default 0.22% — below 3.0% adoption floor |

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
