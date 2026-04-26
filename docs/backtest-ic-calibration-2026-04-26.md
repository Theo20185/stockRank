# IC calibration — 2026-04-26

**Iterations:** 50 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 132 | 0.595 | 0.642 |
| Banks & Lending | 3y | 132 | 0.532 | 0.573 |
| Capital Markets | 1y | 120 | 0.524 | 0.561 |
| Capital Markets | 3y | 120 | 0.490 | 0.531 |
| Consumer Discretionary | 1y | 247 | 0.239 | 0.284 |
| Consumer Discretionary | 3y | 247 | 0.218 | 0.239 |
| Consumer Staples | 1y | 210 | 0.218 | 0.249 |
| Consumer Staples | 3y | 210 | 0.230 | 0.240 |
| Energy | 1y | 120 | 0.245 | 0.283 |
| Energy | 3y | 120 | 0.247 | 0.264 |
| Healthcare Equipment & Diagnostics | 1y | 170 | 0.234 | 0.246 |
| Healthcare Equipment & Diagnostics | 3y | 170 | 0.262 | 0.281 |
| Healthcare Services | 1y | 80 | 0.421 | 0.460 |
| Healthcare Services | 3y | 80 | 0.429 | 0.496 |
| Industrials | 1y | 265 | 0.261 | 0.287 |
| Industrials | 3y | 265 | 0.229 | 0.246 |
| Insurance | 1y | 136 | 0.430 | 0.497 |
| Insurance | 3y | 136 | 0.494 | 0.526 |
| Materials & Construction | 1y | 219 | 0.235 | 0.245 |
| Materials & Construction | 3y | 219 | 0.237 | 0.243 |
| Media & Telecom | 1y | 81 | 0.449 | 0.503 |
| Media & Telecom | 3y | 81 | 0.439 | 0.454 |
| Pharma & Biotech | 1y | 98 | 0.365 | 0.386 |
| Pharma & Biotech | 3y | 98 | 0.355 | 0.374 |
| REITs & Real Estate | 1y | 185 | 0.313 | 0.387 |
| REITs & Real Estate | 3y | 185 | 0.355 | 0.412 |
| Semiconductors & Hardware | 1y | 192 | 0.215 | 0.225 |
| Semiconductors & Hardware | 3y | 192 | 0.243 | 0.276 |
| Software & Internet | 1y | 206 | 0.245 | 0.262 |
| Software & Internet | 3y | 206 | 0.224 | 0.258 |
| Transportation & Autos | 1y | 147 | 0.293 | 0.303 |
| Transportation & Autos | 3y | 147 | 0.287 | 0.302 |
| Utilities | 1y | 173 | 0.385 | 0.427 |
| Utilities | 3y | 173 | 0.366 | 0.389 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **10**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **1.84×**
- Verdict: **noise**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._