# IC calibration — 2026-04-25

**Iterations:** 200 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 17 | 1.000 | 1.000 |
| Banks & Lending | 3y | 17 | 1.000 | 1.000 |
| Capital Markets | 1y | 14 | 1.000 | 1.000 |
| Capital Markets | 3y | 14 | 1.000 | 1.000 |
| Consumer Discretionary | 1y | 23 | 1.000 | 1.000 |
| Consumer Discretionary | 3y | 23 | 1.000 | 1.000 |
| Consumer Staples | 1y | 27 | 0.857 | 0.900 |
| Consumer Staples | 3y | 27 | 0.900 | 0.900 |
| Energy | 1y | 14 | 1.000 | 1.000 |
| Energy | 3y | 14 | 1.000 | 1.000 |
| Healthcare Equipment & Diagnostics | 1y | 15 | 1.000 | 1.000 |
| Healthcare Equipment & Diagnostics | 3y | 15 | 1.000 | 1.000 |
| Healthcare Services | 1y | 8 | 0.900 | 0.929 |
| Healthcare Services | 3y | 8 | 0.900 | 0.905 |
| Industrials | 1y | 29 | 1.000 | 1.000 |
| Industrials | 3y | 29 | 1.000 | 1.000 |
| Insurance | 1y | 18 | 1.000 | 1.000 |
| Insurance | 3y | 18 | 1.000 | 1.000 |
| Materials & Construction | 1y | 23 | 1.000 | 1.000 |
| Materials & Construction | 3y | 23 | 1.000 | 1.000 |
| Media & Telecom | 1y | 5 | 1.000 | 1.000 |
| Media & Telecom | 3y | 5 | 1.000 | 1.000 |
| Pharma & Biotech | 1y | 8 | 1.000 | 1.000 |
| Pharma & Biotech | 3y | 8 | 1.000 | 1.000 |
| REITs & Real Estate | 1y | 15 | 1.000 | 1.000 |
| REITs & Real Estate | 3y | 15 | 1.000 | 1.000 |
| Semiconductors & Hardware | 1y | 19 | 1.000 | 1.000 |
| Semiconductors & Hardware | 3y | 19 | 1.000 | 1.000 |
| Software & Internet | 1y | 19 | 1.000 | 1.000 |
| Software & Internet | 3y | 19 | 1.000 | 1.000 |
| Transportation & Autos | 1y | 13 | 1.000 | 1.000 |
| Transportation & Autos | 3y | 13 | 1.000 | 1.000 |
| Utilities | 1y | 25 | 1.000 | 1.000 |
| Utilities | 3y | 25 | 1.000 | 1.000 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **28**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **5.15×**
- Verdict: **real-signal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._