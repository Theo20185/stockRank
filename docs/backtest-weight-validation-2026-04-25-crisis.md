# Weight validation — 2026-04-25

**Train period:** 2011-01-31 → 2009-01-01
**Test period:** 2009-01-01 → 2011-12-31

Top decile per snapshot under each weight vector; equal-weighted forward excess return vs SPY at each horizon, averaged across snapshots; bootstrap 95% CI on the mean excess.

**Adoption rule (§3.11.1):** candidate beats default by ≥ 1%/yr at 3y AND its CI does not cross zero. All evaluated candidates listed below — passing and failing — to keep the audit trail honest.

## Per-candidate per-horizon excess return

| Candidate | Source | Horizon | N | Excess (mean) | CI (95%) |
|---|---|---|---|---|---|
| default | default | 1y | 12 | 6.43% | [3.53%, 9.50%] |
| default | default | 3y | 12 | 21.99% | [15.55%, 30.00%] |
| value-tilted-defensive-legacy | legacy-default | 1y | 12 | 5.18% | [2.47%, 7.88%] |
| value-tilted-defensive-legacy | legacy-default | 3y | 12 | 24.29% | [16.37%, 32.39%] |
| equal-weight | academic-prior | 1y | 12 | 2.69% | [-0.71%, 5.87%] |
| equal-weight | academic-prior | 3y | 12 | 16.00% | [6.91%, 25.20%] |
| quality-tilt | academic-prior | 1y | 12 | 5.29% | [2.04%, 8.42%] |
| quality-tilt | academic-prior | 3y | 12 | 24.94% | [16.13%, 33.35%] |
| momentum-on | academic-prior | 1y | 12 | 6.09% | [3.01%, 9.17%] |
| momentum-on | academic-prior | 3y | 12 | 22.58% | [15.41%, 30.45%] |

## Adoption verdicts (vs default)

| Candidate | 3y excess vs default | Verdict | Reason |
|---|---|---|---|
| value-tilted-defensive-legacy | 2.30% | **reject** | 3y excess vs default 2.30% — below 3.0% adoption floor |
| equal-weight | -5.99% | **reject** | 3y excess vs default -5.99% — below 3.0% adoption floor |
| quality-tilt | 2.95% | **reject** | 3y excess vs default 2.95% — below 3.0% adoption floor |
| momentum-on | 0.58% | **reject** | 3y excess vs default 0.58% — below 3.0% adoption floor |

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
