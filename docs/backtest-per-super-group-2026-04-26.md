# Per-super-group preset validation — 2026-04-26

**Test period start:** 2021-04-26

Each preset is tested against ONLY its target super-group's cohort. The baseline is the §8.1 default weights applied to the same cohort. Adoption rule (§3.11.1): preset must beat default by ≥ 1%/yr × 3y AND CI not crossing zero, in this regime. The cross-regime adoption rule (≥ 2 of N PIT regimes) is applied by stacking these single-regime reports manually.

## Per-preset verdicts

| Super-group | Preset | Cohort N | Default 3y | Preset 3y | Excess vs default | Verdict |
|---|---|---|---|---|---|---|
| utilities | utilities-health-tilt | 3396 | 50.00% | 48.23% | -1.77 pp | **reject** |
| semis-hardware | semis-hardware-quality-tilt | 3698 | 32.94% | 46.18% | 13.24 pp | **adopt** |
| consumer-discretionary | consumer-discretionary-deep-value | 4864 | -11.73% | -10.95% | 0.78 pp | **reject** |
| consumer-staples | consumer-staples-shareholder-return-tilt | 4140 | -26.20% | -29.60% | -3.40 pp | **reject** |
| transport-autos | transport-autos-health-tilt | 2894 | -15.19% | -17.65% | -2.46 pp | **reject** |

## utilities — utilities-health-tilt

_Utilities preset: boost Health to 30% (D/EBITDA +0.58 IC); Valuation stays at 45% (EV/EBITDA +0.43 IC)_

**Verdict:** reject — 3y excess vs default -1.77% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 24 | 4.36% | [-1.90%, 11.14%] |
| default | 3y | 24 | 50.00% | [36.98%, 61.88%] |
| utilities-health-tilt | 1y | 24 | 4.56% | [-1.81%, 11.19%] |
| utilities-health-tilt | 3y | 24 | 48.23% | [34.93%, 60.62%] |

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

**Verdict:** adopt — 3y excess 46.18% vs default 32.94%; CI [5.20%, 90.66%]

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 24 | -0.06% | [-7.37%, 6.79%] |
| default | 3y | 24 | 32.94% | [-4.84%, 79.41%] |
| semis-hardware-quality-tilt | 1y | 24 | 0.09% | [-7.38%, 8.82%] |
| semis-hardware-quality-tilt | 3y | 24 | 46.18% | [5.20%, 90.66%] |

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

**Verdict:** reject — 3y excess vs default 0.78% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 24 | 2.02% | [-3.08%, 7.06%] |
| default | 3y | 24 | -11.73% | [-20.52%, -3.23%] |
| consumer-discretionary-deep-value | 1y | 24 | 1.99% | [-3.11%, 7.54%] |
| consumer-discretionary-deep-value | 3y | 24 | -10.95% | [-20.71%, -1.76%] |

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

**Verdict:** reject — 3y excess vs default -3.40% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 24 | -7.52% | [-14.73%, 0.53%] |
| default | 3y | 24 | -26.20% | [-33.68%, -19.23%] |
| consumer-staples-shareholder-return-tilt | 1y | 24 | -6.64% | [-14.17%, 0.81%] |
| consumer-staples-shareholder-return-tilt | 3y | 24 | -29.60% | [-38.74%, -19.93%] |

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

**Verdict:** reject — 3y excess vs default -2.46% — below 3.0% adoption floor

**Per-horizon detail (preset vs default in this cohort):**

| Candidate | Horizon | N snapshots | Excess (mean) | CI (95%) |
|---|---|---|---|---|
| default | 1y | 24 | -0.81% | [-8.53%, 7.53%] |
| default | 3y | 24 | -15.19% | [-25.30%, -4.71%] |
| transport-autos-health-tilt | 1y | 24 | -1.70% | [-7.06%, 3.69%] |
| transport-autos-health-tilt | 3y | 24 | -17.65% | [-27.02%, -8.37%] |

**Preset weights:**

| Category | Weight |
|---|---|
| valuation | 45.0% |
| health | 30.0% |
| quality | 10.0% |
| shareholderReturn | 10.0% |
| growth | 5.0% |
| momentum | 0.0% |
