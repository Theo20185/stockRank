# Per-super-group preset validation — 2026-04-26

**Test period start:** 2016-01-01

Each preset is tested against ONLY its target super-group's cohort. The baseline is the §8.1 default weights applied to the same cohort. Adoption rule (§3.11.1): preset must beat default by ≥ 1%/yr × 3y AND CI not crossing zero, in this regime. The cross-regime adoption rule (≥ 2 of N PIT regimes) is applied by stacking these single-regime reports manually.

## Per-preset verdicts

| Super-group | Preset | Cohort N | Default 3y | Preset 3y | Excess vs default | Verdict |
|---|---|---|---|---|---|---|
| utilities | utilities-health-tilt | 4942 | 10.24% | 11.43% | 1.19 pp | **reject** |
| semis-hardware | semis-hardware-quality-tilt | 4176 | 108.99% | 108.99% | 0.00 pp | **reject** |
| consumer-discretionary | consumer-discretionary-deep-value | 7160 | 53.98% | 60.42% | 6.44 pp | **adopt** |
| consumer-staples | consumer-staples-shareholder-return-tilt | 6016 | -16.95% | -12.78% | 4.17 pp | **reject** |
| transport-autos | transport-autos-health-tilt | 3714 | -29.40% | -35.23% | -5.83 pp | **reject** |

## utilities — utilities-health-tilt

_Utilities preset: boost Health to 30% (D/EBITDA +0.58 IC); Valuation stays at 45% (EV/EBITDA +0.43 IC)_

**Verdict:** reject — 3y excess vs default 1.19% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 36 | 5.97% | [1.65%, 10.25%] |
| default | 3y | 36 | 10.24% | [3.04%, 17.48%] |
| utilities-health-tilt | 1y | 36 | 5.46% | [1.33%, 9.53%] |
| utilities-health-tilt | 3y | 36 | 11.43% | [4.26%, 19.17%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 45.0% |
| health | 30.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 5.0% |
| momentum | 0.0% |

## semis-hardware — semis-hardware-quality-tilt

_Semis & Hardware: boost Quality to 25% (Sloan accruals -0.23 IC works here); Valuation 50% unchanged_

**Verdict:** reject — 3y excess vs default 0.00% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 36 | 34.09% | [21.63%, 46.83%] |
| default | 3y | 36 | 108.99% | [87.72%, 136.62%] |
| semis-hardware-quality-tilt | 1y | 36 | 34.54% | [20.71%, 48.76%] |
| semis-hardware-quality-tilt | 3y | 36 | 108.99% | [86.11%, 134.42%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 50.0% |
| health | 10.0% |
| quality | 25.0% |
| shareholderReturn | 5.0% |
| growth | 10.0% |
| momentum | 0.0% |

## consumer-discretionary — consumer-discretionary-deep-value

_Consumer Discretionary: boost Valuation to 55% (only valuation factors passed); reduce Health_

**Verdict:** adopt — 3y excess 60.42% vs default 53.98%; CI [42.57%, 77.10%]

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 36 | 3.38% | [-0.91%, 7.68%] |
| default | 3y | 36 | 53.98% | [39.41%, 70.49%] |
| consumer-discretionary-deep-value | 1y | 36 | 4.05% | [-0.24%, 8.48%] |
| consumer-discretionary-deep-value | 3y | 36 | 60.42% | [42.57%, 77.10%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 55.0% |
| health | 15.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 10.0% |
| momentum | 0.0% |

## consumer-staples — consumer-staples-shareholder-return-tilt

_Consumer Staples: boost Shareholder Return to 25% (NetIssuance -0.26 IC); Valuation reduced_

**Verdict:** reject — candidate's 3y excess CI crosses zero — outperformance not statistically distinguishable from zero

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 36 | -7.63% | [-10.89%, -4.57%] |
| default | 3y | 36 | -16.95% | [-23.08%, -11.03%] |
| consumer-staples-shareholder-return-tilt | 1y | 36 | -6.09% | [-9.56%, -2.83%] |
| consumer-staples-shareholder-return-tilt | 3y | 36 | -12.78% | [-18.17%, -6.77%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 40.0% |
| health | 20.0% |
| quality | 10.0% |
| shareholderReturn | 25.0% |
| growth | 5.0% |
| momentum | 0.0% |

## transport-autos — transport-autos-health-tilt

_Transportation & Autos: boost Health to 30% (D/EBITDA -0.44 IC, low debt is the signal)_

**Verdict:** reject — 3y excess vs default -5.83% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 36 | -12.05% | [-15.25%, -8.61%] |
| default | 3y | 36 | -29.40% | [-36.23%, -23.28%] |
| transport-autos-health-tilt | 1y | 36 | -12.90% | [-15.96%, -9.15%] |
| transport-autos-health-tilt | 3y | 36 | -35.23% | [-41.74%, -27.43%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 45.0% |
| health | 30.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 5.0% |
| momentum | 0.0% |
