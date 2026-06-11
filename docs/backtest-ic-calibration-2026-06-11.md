# IC calibration — 2026-06-11

**Iterations:** 50 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 125 | 0.630 | 0.693 |
| Banks & Lending | 3y | 125 | 0.693 | 0.693 |
| Capital Markets | 1y | 120 | 0.484 | 0.545 |
| Capital Markets | 3y | 120 | 0.407 | 0.532 |
| Consumer Discretionary | 1y | 247 | 0.264 | 0.272 |
| Consumer Discretionary | 3y | 247 | 0.236 | 0.252 |
| Consumer Staples | 1y | 210 | 0.219 | 0.234 |
| Consumer Staples | 3y | 210 | 0.249 | 0.260 |
| Energy | 1y | 119 | 0.245 | 0.253 |
| Energy | 3y | 119 | 0.287 | 0.297 |
| Healthcare Equipment & Diagnostics | 1y | 170 | 0.266 | 0.315 |
| Healthcare Equipment & Diagnostics | 3y | 170 | 0.277 | 0.301 |
| Healthcare Services | 1y | 80 | 0.469 | 0.550 |
| Healthcare Services | 3y | 80 | 0.421 | 0.462 |
| Industrials | 1y | 264 | 0.268 | 0.274 |
| Industrials | 3y | 264 | 0.254 | 0.265 |
| Insurance | 1y | 136 | 0.509 | 0.600 |
| Insurance | 3y | 136 | 0.509 | 0.600 |
| Materials & Construction | 1y | 219 | 0.237 | 0.264 |
| Materials & Construction | 3y | 219 | 0.262 | 0.274 |
| Media & Telecom | 1y | 81 | 0.479 | 0.507 |
| Media & Telecom | 3y | 81 | 0.507 | 0.548 |
| Pharma & Biotech | 1y | 98 | 0.401 | 0.424 |
| Pharma & Biotech | 3y | 98 | 0.429 | 0.458 |
| REITs & Real Estate | 1y | 185 | 0.324 | 0.371 |
| REITs & Real Estate | 3y | 185 | 0.356 | 0.414 |
| Semiconductors & Hardware | 1y | 192 | 0.274 | 0.284 |
| Semiconductors & Hardware | 3y | 192 | 0.219 | 0.257 |
| Software & Internet | 1y | 207 | 0.267 | 0.278 |
| Software & Internet | 3y | 206 | 0.261 | 0.270 |
| Transportation & Autos | 1y | 147 | 0.331 | 0.413 |
| Transportation & Autos | 3y | 147 | 0.316 | 0.378 |
| Utilities | 1y | 173 | 0.380 | 0.400 |
| Utilities | 3y | 173 | 0.388 | 0.400 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **10**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **1.84×**
- Verdict: **noise**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._