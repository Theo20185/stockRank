# IC calibration — 2026-11-03

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 284 | 0.894 | 0.894 |
| Banks & Lending | 3y | 284 | 0.894 | 0.894 |
| Capital Markets | 1y | 238 | 0.249 | 0.289 |
| Capital Markets | 3y | 237 | 0.261 | 0.294 |
| Consumer Discretionary | 1y | 501 | 0.137 | 0.154 |
| Consumer Discretionary | 3y | 500 | 0.135 | 0.148 |
| Consumer Staples | 1y | 432 | 0.134 | 0.146 |
| Consumer Staples | 3y | 431 | 0.130 | 0.139 |
| Energy | 1y | 237 | 0.183 | 0.202 |
| Energy | 3y | 237 | 0.192 | 0.214 |
| Healthcare Equipment & Diagnostics | 1y | 302 | 0.141 | 0.156 |
| Healthcare Equipment & Diagnostics | 3y | 302 | 0.147 | 0.160 |
| Healthcare Services | 1y | 155 | 0.227 | 0.251 |
| Healthcare Services | 3y | 155 | 0.231 | 0.258 |
| Industrials | 1y | 514 | 0.134 | 0.144 |
| Industrials | 3y | 512 | 0.139 | 0.156 |
| Insurance | 1y | 284 | 0.376 | 0.446 |
| Insurance | 3y | 284 | 0.376 | 0.459 |
| Materials & Construction | 1y | 427 | 0.143 | 0.157 |
| Materials & Construction | 3y | 427 | 0.146 | 0.158 |
| Media & Telecom | 1y | 132 | 0.298 | 0.332 |
| Media & Telecom | 3y | 132 | 0.303 | 0.333 |
| Pharma & Biotech | 1y | 181 | 0.210 | 0.234 |
| Pharma & Biotech | 3y | 181 | 0.212 | 0.229 |
| REITs & Real Estate | 1y | 314 | 0.195 | 0.221 |
| REITs & Real Estate | 3y | 314 | 0.209 | 0.237 |
| Semiconductors & Hardware | 1y | 336 | 0.154 | 0.174 |
| Semiconductors & Hardware | 3y | 336 | 0.151 | 0.170 |
| Software & Internet | 1y | 366 | 0.162 | 0.179 |
| Software & Internet | 3y | 364 | 0.154 | 0.169 |
| Transportation & Autos | 1y | 285 | 0.175 | 0.194 |
| Transportation & Autos | 3y | 285 | 0.180 | 0.202 |
| Utilities | 1y | 352 | 0.194 | 0.227 |
| Utilities | 3y | 352 | 0.201 | 0.234 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **26**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **4.78×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._