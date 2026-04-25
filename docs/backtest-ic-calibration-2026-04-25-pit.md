# IC calibration — 2026-04-25

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 120 | 0.617 | 0.694 |
| Banks & Lending | 3y | 120 | 0.617 | 0.694 |
| Capital Markets | 1y | 111 | 0.504 | 0.582 |
| Capital Markets | 3y | 111 | 0.511 | 0.589 |
| Consumer Discretionary | 1y | 195 | 0.246 | 0.267 |
| Consumer Discretionary | 3y | 195 | 0.252 | 0.275 |
| Consumer Staples | 1y | 195 | 0.235 | 0.263 |
| Consumer Staples | 3y | 195 | 0.226 | 0.259 |
| Energy | 1y | 111 | 0.255 | 0.279 |
| Energy | 3y | 111 | 0.284 | 0.317 |
| Healthcare Equipment & Diagnostics | 1y | 149 | 0.283 | 0.309 |
| Healthcare Equipment & Diagnostics | 3y | 149 | 0.263 | 0.294 |
| Healthcare Services | 1y | 78 | 0.432 | 0.473 |
| Healthcare Services | 3y | 78 | 0.405 | 0.451 |
| Industrials | 1y | 260 | 0.229 | 0.260 |
| Industrials | 3y | 260 | 0.223 | 0.238 |
| Insurance | 1y | 124 | 0.412 | 0.472 |
| Insurance | 3y | 124 | 0.415 | 0.497 |
| Materials & Construction | 1y | 195 | 0.260 | 0.287 |
| Materials & Construction | 3y | 195 | 0.246 | 0.274 |
| Media & Telecom | 1y | 75 | 0.462 | 0.515 |
| Media & Telecom | 3y | 75 | 0.468 | 0.488 |
| Pharma & Biotech | 1y | 89 | 0.393 | 0.425 |
| Pharma & Biotech | 3y | 89 | 0.373 | 0.425 |
| REITs & Real Estate | 1y | 170 | 0.322 | 0.350 |
| REITs & Real Estate | 3y | 170 | 0.334 | 0.384 |
| Semiconductors & Hardware | 1y | 179 | 0.260 | 0.289 |
| Semiconductors & Hardware | 3y | 179 | 0.247 | 0.277 |
| Software & Internet | 1y | 193 | 0.250 | 0.279 |
| Software & Internet | 3y | 193 | 0.234 | 0.265 |
| Transportation & Autos | 1y | 115 | 0.359 | 0.400 |
| Transportation & Autos | 3y | 115 | 0.373 | 0.409 |
| Utilities | 1y | 173 | 0.338 | 0.372 |
| Utilities | 3y | 173 | 0.332 | 0.365 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **10**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **1.84×**
- Verdict: **noise**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._