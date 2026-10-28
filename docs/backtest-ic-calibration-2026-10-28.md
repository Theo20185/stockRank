# IC calibration — 2026-10-28

**Iterations:** 1000 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 284 | 0.333 | 0.377 |
| Banks & Lending | 3y | 284 | 0.324 | 0.360 |
| Capital Markets | 1y | 237 | 0.249 | 0.282 |
| Capital Markets | 3y | 237 | 0.249 | 0.276 |
| Consumer Discretionary | 1y | 500 | 0.149 | 0.165 |
| Consumer Discretionary | 3y | 500 | 0.148 | 0.165 |
| Consumer Staples | 1y | 406 | 0.153 | 0.174 |
| Consumer Staples | 3y | 405 | 0.151 | 0.167 |
| Energy | 1y | 237 | 0.208 | 0.226 |
| Energy | 3y | 237 | 0.206 | 0.227 |
| Healthcare Equipment & Diagnostics | 1y | 302 | 0.161 | 0.176 |
| Healthcare Equipment & Diagnostics | 3y | 302 | 0.168 | 0.185 |
| Healthcare Services | 1y | 155 | 0.243 | 0.272 |
| Healthcare Services | 3y | 155 | 0.251 | 0.279 |
| Industrials | 1y | 509 | 0.152 | 0.168 |
| Industrials | 3y | 508 | 0.152 | 0.165 |
| Insurance | 1y | 284 | 0.211 | 0.238 |
| Insurance | 3y | 284 | 0.207 | 0.234 |
| Materials & Construction | 1y | 427 | 0.158 | 0.175 |
| Materials & Construction | 3y | 427 | 0.158 | 0.177 |
| Media & Telecom | 1y | 134 | 0.273 | 0.292 |
| Media & Telecom | 3y | 134 | 0.280 | 0.301 |
| Pharma & Biotech | 1y | 179 | 0.238 | 0.260 |
| Pharma & Biotech | 3y | 179 | 0.239 | 0.265 |
| REITs & Real Estate | 1y | 314 | 0.217 | 0.257 |
| REITs & Real Estate | 3y | 314 | 0.220 | 0.255 |
| Semiconductors & Hardware | 1y | 336 | 0.167 | 0.180 |
| Semiconductors & Hardware | 3y | 336 | 0.167 | 0.184 |
| Software & Internet | 1y | 366 | 0.162 | 0.180 |
| Software & Internet | 3y | 364 | 0.170 | 0.189 |
| Transportation & Autos | 1y | 285 | 0.198 | 0.226 |
| Transportation & Autos | 3y | 285 | 0.195 | 0.217 |
| Utilities | 1y | 352 | 0.182 | 0.207 |
| Utilities | 3y | 352 | 0.181 | 0.207 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **20**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **3.68×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._