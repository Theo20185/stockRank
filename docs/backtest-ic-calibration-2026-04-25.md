# IC calibration — 2026-04-25

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 120 | 0.694 | 0.772 |
| Banks & Lending | 3y | 120 | 0.626 | 0.736 |
| Capital Markets | 1y | 148 | 0.488 | 0.544 |
| Capital Markets | 3y | 148 | 0.486 | 0.562 |
| Consumer Discretionary | 1y | 236 | 0.245 | 0.271 |
| Consumer Discretionary | 3y | 236 | 0.239 | 0.260 |
| Consumer Staples | 1y | 200 | 0.231 | 0.250 |
| Consumer Staples | 3y | 200 | 0.236 | 0.249 |
| Energy | 1y | 126 | 0.243 | 0.275 |
| Energy | 3y | 126 | 0.244 | 0.262 |
| Healthcare Equipment & Diagnostics | 1y | 164 | 0.250 | 0.265 |
| Healthcare Equipment & Diagnostics | 3y | 164 | 0.247 | 0.269 |
| Healthcare Services | 1y | 78 | 0.427 | 0.473 |
| Healthcare Services | 3y | 78 | 0.444 | 0.482 |
| Industrials | 1y | 292 | 0.230 | 0.250 |
| Industrials | 3y | 292 | 0.229 | 0.252 |
| Insurance | 1y | 138 | 0.377 | 0.414 |
| Insurance | 3y | 138 | 0.362 | 0.411 |
| Materials & Construction | 1y | 233 | 0.236 | 0.258 |
| Materials & Construction | 3y | 233 | 0.239 | 0.262 |
| Media & Telecom | 1y | 99 | 0.398 | 0.437 |
| Media & Telecom | 3y | 99 | 0.396 | 0.438 |
| Pharma & Biotech | 1y | 95 | 0.401 | 0.457 |
| Pharma & Biotech | 3y | 95 | 0.399 | 0.437 |
| REITs & Real Estate | 1y | 186 | 0.311 | 0.345 |
| REITs & Real Estate | 3y | 186 | 0.338 | 0.375 |
| Semiconductors & Hardware | 1y | 234 | 0.225 | 0.262 |
| Semiconductors & Hardware | 3y | 234 | 0.213 | 0.236 |
| Software & Internet | 1y | 253 | 0.220 | 0.245 |
| Software & Internet | 3y | 253 | 0.239 | 0.270 |
| Transportation & Autos | 1y | 120 | 0.358 | 0.392 |
| Transportation & Autos | 3y | 120 | 0.360 | 0.409 |
| Utilities | 1y | 182 | 0.331 | 0.354 |
| Utilities | 3y | 182 | 0.310 | 0.344 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **9**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **1.65×**
- Verdict: **noise**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._