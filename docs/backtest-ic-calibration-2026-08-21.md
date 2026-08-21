# IC calibration — 2026-08-21

**Iterations:** 1000 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 271 | 0.420 | 0.478 |
| Banks & Lending | 3y | 271 | 0.436 | 0.493 |
| Capital Markets | 1y | 237 | 0.431 | 0.484 |
| Capital Markets | 3y | 237 | 0.417 | 0.490 |
| Consumer Discretionary | 1y | 513 | 0.194 | 0.212 |
| Consumer Discretionary | 3y | 513 | 0.191 | 0.212 |
| Consumer Staples | 1y | 431 | 0.180 | 0.198 |
| Consumer Staples | 3y | 431 | 0.181 | 0.203 |
| Energy | 1y | 263 | 0.224 | 0.243 |
| Energy | 3y | 263 | 0.224 | 0.249 |
| Healthcare Equipment & Diagnostics | 1y | 302 | 0.236 | 0.270 |
| Healthcare Equipment & Diagnostics | 3y | 302 | 0.233 | 0.275 |
| Healthcare Services | 1y | 155 | 0.354 | 0.387 |
| Healthcare Services | 3y | 155 | 0.342 | 0.378 |
| Industrials | 1y | 513 | 0.198 | 0.215 |
| Industrials | 3y | 512 | 0.194 | 0.212 |
| Insurance | 1y | 284 | 0.408 | 0.478 |
| Insurance | 3y | 284 | 0.431 | 0.512 |
| Materials & Construction | 1y | 427 | 0.190 | 0.212 |
| Materials & Construction | 3y | 427 | 0.189 | 0.206 |
| Media & Telecom | 1y | 134 | 0.445 | 0.501 |
| Media & Telecom | 3y | 134 | 0.444 | 0.484 |
| Pharma & Biotech | 1y | 179 | 0.335 | 0.385 |
| Pharma & Biotech | 3y | 179 | 0.333 | 0.372 |
| REITs & Real Estate | 1y | 340 | 0.258 | 0.289 |
| REITs & Real Estate | 3y | 340 | 0.256 | 0.288 |
| Semiconductors & Hardware | 1y | 345 | 0.187 | 0.205 |
| Semiconductors & Hardware | 3y | 345 | 0.195 | 0.213 |
| Software & Internet | 1y | 365 | 0.189 | 0.213 |
| Software & Internet | 3y | 364 | 0.197 | 0.217 |
| Transportation & Autos | 1y | 285 | 0.280 | 0.315 |
| Transportation & Autos | 3y | 285 | 0.278 | 0.314 |
| Utilities | 1y | 352 | 0.298 | 0.336 |
| Utilities | 3y | 352 | 0.293 | 0.326 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **17**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **3.12×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._