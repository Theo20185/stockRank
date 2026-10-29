# IC calibration — 2026-10-29

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 284 | 0.315 | 0.384 |
| Banks & Lending | 3y | 284 | 0.328 | 0.371 |
| Capital Markets | 1y | 237 | 0.256 | 0.280 |
| Capital Markets | 3y | 237 | 0.253 | 0.285 |
| Consumer Discretionary | 1y | 500 | 0.141 | 0.155 |
| Consumer Discretionary | 3y | 500 | 0.149 | 0.172 |
| Consumer Staples | 1y | 432 | 0.145 | 0.161 |
| Consumer Staples | 3y | 431 | 0.151 | 0.162 |
| Energy | 1y | 237 | 0.192 | 0.210 |
| Energy | 3y | 237 | 0.211 | 0.229 |
| Healthcare Equipment & Diagnostics | 1y | 302 | 0.167 | 0.181 |
| Healthcare Equipment & Diagnostics | 3y | 302 | 0.159 | 0.173 |
| Healthcare Services | 1y | 155 | 0.246 | 0.268 |
| Healthcare Services | 3y | 155 | 0.259 | 0.290 |
| Industrials | 1y | 513 | 0.149 | 0.167 |
| Industrials | 3y | 512 | 0.158 | 0.175 |
| Insurance | 1y | 284 | 0.212 | 0.247 |
| Insurance | 3y | 284 | 0.221 | 0.241 |
| Materials & Construction | 1y | 427 | 0.158 | 0.170 |
| Materials & Construction | 3y | 427 | 0.164 | 0.178 |
| Media & Telecom | 1y | 132 | 0.284 | 0.309 |
| Media & Telecom | 3y | 132 | 0.289 | 0.309 |
| Pharma & Biotech | 1y | 179 | 0.245 | 0.259 |
| Pharma & Biotech | 3y | 179 | 0.230 | 0.254 |
| REITs & Real Estate | 1y | 314 | 0.205 | 0.232 |
| REITs & Real Estate | 3y | 314 | 0.223 | 0.280 |
| Semiconductors & Hardware | 1y | 336 | 0.169 | 0.188 |
| Semiconductors & Hardware | 3y | 336 | 0.173 | 0.194 |
| Software & Internet | 1y | 366 | 0.165 | 0.188 |
| Software & Internet | 3y | 364 | 0.171 | 0.182 |
| Transportation & Autos | 1y | 285 | 0.202 | 0.231 |
| Transportation & Autos | 3y | 285 | 0.213 | 0.235 |
| Utilities | 1y | 352 | 0.194 | 0.228 |
| Utilities | 3y | 352 | 0.187 | 0.207 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **19**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **3.49×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._