# IC calibration — 2026-04-25

**Iterations:** 100 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 132 | 0.539 | 0.611 |
| Banks & Lending | 3y | 132 | 0.532 | 0.607 |
| Capital Markets | 1y | 120 | 0.453 | 0.555 |
| Capital Markets | 3y | 120 | 0.434 | 0.504 |
| Consumer Discretionary | 1y | 247 | 0.229 | 0.268 |
| Consumer Discretionary | 3y | 247 | 0.219 | 0.239 |
| Consumer Staples | 1y | 210 | 0.249 | 0.286 |
| Consumer Staples | 3y | 210 | 0.229 | 0.248 |
| Energy | 1y | 120 | 0.245 | 0.272 |
| Energy | 3y | 120 | 0.258 | 0.269 |
| Healthcare Equipment & Diagnostics | 1y | 170 | 0.238 | 0.261 |
| Healthcare Equipment & Diagnostics | 3y | 170 | 0.262 | 0.293 |
| Healthcare Services | 1y | 80 | 0.407 | 0.445 |
| Healthcare Services | 3y | 80 | 0.409 | 0.454 |
| Industrials | 1y | 265 | 0.265 | 0.282 |
| Industrials | 3y | 265 | 0.235 | 0.260 |
| Insurance | 1y | 136 | 0.448 | 0.497 |
| Insurance | 3y | 136 | 0.455 | 0.526 |
| Materials & Construction | 1y | 219 | 0.242 | 0.285 |
| Materials & Construction | 3y | 219 | 0.237 | 0.257 |
| Media & Telecom | 1y | 81 | 0.429 | 0.485 |
| Media & Telecom | 3y | 81 | 0.437 | 0.454 |
| Pharma & Biotech | 1y | 98 | 0.365 | 0.406 |
| Pharma & Biotech | 3y | 98 | 0.355 | 0.385 |
| REITs & Real Estate | 1y | 185 | 0.322 | 0.365 |
| REITs & Real Estate | 3y | 185 | 0.350 | 0.393 |
| Semiconductors & Hardware | 1y | 192 | 0.224 | 0.242 |
| Semiconductors & Hardware | 3y | 192 | 0.232 | 0.249 |
| Software & Internet | 1y | 206 | 0.244 | 0.268 |
| Software & Internet | 3y | 206 | 0.239 | 0.258 |
| Transportation & Autos | 1y | 147 | 0.292 | 0.303 |
| Transportation & Autos | 3y | 147 | 0.287 | 0.309 |
| Utilities | 1y | 173 | 0.332 | 0.398 |
| Utilities | 3y | 173 | 0.368 | 0.407 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **13**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **2.39×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._