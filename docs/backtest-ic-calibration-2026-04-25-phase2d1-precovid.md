# IC calibration — 2026-04-25

**Iterations:** 100 Monte Carlo shuffles per backtest.md §3.10.1.

## Per-cell thresholds

Statistical (Gate 1) threshold = 99th percentile of |IC| under the shuffled-returns null distribution. Cells with effective N < threshold-induced floor render as `—` in the heatmap.

| Super-group | Horizon | N (effective) | 99th |IC| (Gate 1) | 99.5th |IC| |
|---|---|---|---|---|
| Banks & Lending | 1y | 175 | 0.617 | 0.801 |
| Banks & Lending | 3y | 175 | 0.661 | 0.772 |
| Capital Markets | 1y | 137 | 0.690 | 0.810 |
| Capital Markets | 3y | 137 | 0.690 | 0.786 |
| Consumer Discretionary | 1y | 307 | 0.418 | 0.530 |
| Consumer Discretionary | 3y | 307 | 0.349 | 0.459 |
| Consumer Staples | 1y | 256 | 0.657 | 0.829 |
| Consumer Staples | 3y | 256 | 0.714 | 0.829 |
| Energy | 1y | 164 | 0.694 | 0.772 |
| Energy | 3y | 164 | 0.694 | 0.750 |
| Healthcare Equipment & Diagnostics | 1y | 156 | 0.814 | 0.872 |
| Healthcare Equipment & Diagnostics | 3y | 156 | 0.833 | 0.872 |
| Healthcare Services | 1y | 88 | 0.724 | 0.764 |
| Healthcare Services | 3y | 88 | 0.685 | 0.764 |
| Industrials | 1y | 288 | 0.437 | 0.505 |
| Industrials | 3y | 288 | 0.551 | 0.647 |
| Insurance | 1y | 170 | 1.000 | 1.000 |
| Insurance | 3y | 170 | 1.000 | 1.000 |
| Materials & Construction | 1y | 238 | 0.518 | 0.589 |
| Materials & Construction | 3y | 238 | 0.447 | 0.511 |
| Media & Telecom | 1y | 63 | 0.878 | 0.878 |
| Media & Telecom | 3y | 63 | 0.878 | 0.878 |
| Pharma & Biotech | 1y | 96 | 0.894 | 1.000 |
| Pharma & Biotech | 3y | 96 | 0.894 | 0.894 |
| REITs & Real Estate | 1y | 186 | 0.440 | 0.518 |
| REITs & Real Estate | 3y | 186 | 0.410 | 0.466 |
| Semiconductors & Hardware | 1y | 181 | 0.317 | 0.360 |
| Semiconductors & Hardware | 3y | 181 | 0.321 | 0.379 |
| Software & Internet | 1y | 187 | 0.349 | 0.447 |
| Software & Internet | 3y | 187 | 0.399 | 0.427 |
| Transportation & Autos | 1y | 161 | 1.000 | 1.000 |
| Transportation & Autos | 3y | 161 | 1.000 | 1.000 |
| Utilities | 1y | 207 | 1.000 | 1.000 |
| Utilities | 3y | 207 | 1.000 | 1.000 |

## False-discovery sanity check

- Cells tested: **544** (super-groups × factors × horizons combinations with calibration)
- Cells surviving Gate 1 on REAL data: **16**
- Expected survival under pure null (1% × cells tested): **5.4**
- Ratio (real / expected): **2.94×**
- Verdict: **marginal**

_A `real-signal` verdict means the heatmap likely contains real factor predictability, not just multiple-testing artifacts. `noise` means the surviving cells are roughly what we'd expect by chance — the heatmap should be treated skeptically._