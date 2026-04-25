# IC calibration — 2026-04-25

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 147 | 0.694 | 0.849 |
| Banks & Lending | 3y | 147 | 0.617 | 0.694 |
| Capital Markets | 1y | 124 | 0.563 | 0.647 |
| Capital Markets | 3y | 124 | 0.599 | 0.683 |
| Consumer Discretionary | 1y | 203 | 0.493 | 0.573 |
| Consumer Discretionary | 3y | 203 | 0.453 | 0.584 |
| Consumer Staples | 1y | 244 | 0.800 | 0.800 |
| Consumer Staples | 3y | 244 | 0.800 | 1.000 |
| Energy | 1y | 129 | 0.694 | 0.772 |
| Energy | 3y | 129 | 0.722 | 0.849 |
| Healthcare Equipment & Diagnostics | 1y | 144 | 0.833 | 0.872 |
| Healthcare Equipment & Diagnostics | 3y | 144 | 0.833 | 0.872 |
| Healthcare Services | 1y | 82 | 1.000 | 1.000 |
| Healthcare Services | 3y | 82 | 1.000 | 1.000 |
| Industrials | 1y | 270 | 0.472 | 0.574 |
| Industrials | 3y | 270 | 0.472 | 0.546 |
| Insurance | 1y | 147 | 1.000 | 1.000 |
| Insurance | 3y | 147 | 1.000 | 1.000 |
| Materials & Construction | 1y | 204 | 0.489 | 0.575 |
| Materials & Construction | 3y | 204 | 0.504 | 0.596 |
| Media & Telecom | 1y | 55 | 0.866 | 0.866 |
| Media & Telecom | 3y | 55 | 0.866 | 0.866 |
| Pharma & Biotech | 1y | 88 | 1.000 | 1.000 |
| Pharma & Biotech | 3y | 88 | 1.000 | 1.000 |
| REITs & Real Estate | 1y | 160 | 0.435 | 0.467 |
| REITs & Real Estate | 3y | 160 | 0.443 | 0.500 |
| Semiconductors & Hardware | 1y | 176 | 0.321 | 0.343 |
| Semiconductors & Hardware | 3y | 176 | 0.328 | 0.356 |
| Software & Internet | 1y | 178 | 0.390 | 0.416 |
| Software & Internet | 3y | 178 | 0.390 | 0.426 |
| Transportation & Autos | 1y | 124 | 1.000 | 1.000 |
| Transportation & Autos | 3y | 124 | 1.000 | 1.000 |
| Utilities | 1y | 207 | 1.000 | 1.000 |
| Utilities | 3y | 207 | 1.000 | 1.000 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **19**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **3.49×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._