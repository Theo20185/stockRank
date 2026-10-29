# Fair-value backtest (H1–H6) — 2026-10-29 (PIT)

**Snapshot range:** 2011-10-31 → 2023-09-30 · horizons 1y, 3y

**Coverage:** 116026 observations, 543 symbols, 144 snapshot dates. 2773 no-band rows (kept, reported per cell), 0 engine-error rows (excluded, counted here).

## Point-in-time caveats (restated per protocol)

- **Restatement bias** — EDGAR companyfacts returns the latest-filed value per period; filing-lag cutoffs prevent lookahead on unfiled periods, but later restatements of already-visible periods are not masked.
- **Industry membership** — peer cohorts use TODAY's Yahoo industry classification at every historical date. Not reconstructible from existing data (the Wikipedia changes table carries no GICS, EDGAR exposes only the current SIC, and the dated snapshot archive starts 2026-04). Exposure is bounded by the coarse-cohort stress rerun (super-group membership is far stickier than sub-industry) and quantified by the cap-bucket churn figure (that component of cohort assignment IS computed point-in-time).
- **Cap-bucket churn** (the cohort-drift component this harness DOES capture): 21.19% of (symbol, date) rows sit in a different cap bucket at the snapshot than at the run's final date.

**Conventions:** valuation-basis prices vs bands; total-return excess vs SPY; yearly dedup per §3.9.3 in every cell; annualized = cumulative ÷ horizon; verdicts need ≥ 30 deduped rows/arm; pass bar = gap ≥ 1.00%/yr with below-arm CI excluding 0 (§3.11.1 parity). All thresholds frozen before the run.

## H1 — directional: does `price < p25` predict positive forward excess?

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | all | 2027 | -0.16% | [-1.50%, 1.23%] | 47% | 5003 | -0.84% | [-1.53%, -0.16%] | 46% | 1416 | 0.68% | **fail** — gap 0.68%/yr; below-arm CI crosses 0 |
| pooled | 3y | all | 1987 | -2.36% | [-3.51%, -1.31%] | 39% | 4986 | -1.47% | [-2.05%, -0.83%] | 42% | 1357 | -0.89% | **fail** — gap -0.89%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | all | 1075 | 1.74% | [-0.01%, 3.74%] | 50% | 2854 | 0.76% | [-0.08%, 1.67%] | 49% | 730 | 0.98% | **fail** — gap 0.98%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | all | 1075 | -2.00% | [-3.39%, -0.48%] | 42% | 2854 | 0.15% | [-0.60%, 0.88%] | 46% | 730 | -2.15% | **fail** — gap -2.15%/yr; below-arm CI crosses 0 |
| covid | 1y | all | 570 | 0.04% | [-2.77%, 3.13%] | 46% | 1269 | -2.49% | [-4.00%, -0.81%] | 42% | 500 | 2.53% | **fail** — gap 2.53%/yr; below-arm CI crosses 0 |
| covid | 3y | all | 570 | 0.17% | [-1.54%, 2.22%] | 41% | 1269 | -1.40% | [-2.50%, -0.32%] | 41% | 500 | 1.57% | **fail** — gap 1.57%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | all | 382 | -5.79% | [-8.48%, -2.73%] | 38% | 880 | -3.67% | [-5.42%, -1.94%] | 44% | 186 | -2.12% | **fail** — gap -2.12%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | all | 342 | -7.74% | [-10.46%, -4.82%] | 27% | 863 | -6.96% | [-8.68%, -5.11%] | 27% | 127 | -0.78% | **fail** — gap -0.78%/yr; below-arm CI crosses 0 |

### H1 stress — coarse (super-group) cohorts, bounding today's-industry-classification exposure

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | coarse-cohort | 2019 | 0.01% | [-1.31%, 1.50%] | 47% | 5011 | -0.63% | [-1.37%, 0.05%] | 47% | 1227 | 0.64% | **fail** — gap 0.64%/yr; below-arm CI crosses 0 |
| pooled | 3y | coarse-cohort | 1968 | -2.38% | [-3.42%, -1.26%] | 38% | 4992 | -1.50% | [-2.06%, -0.90%] | 42% | 1172 | -0.87% | **fail** — gap -0.87%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | coarse-cohort | 1051 | 1.75% | [-0.24%, 3.68%] | 49% | 2864 | 0.91% | [0.01%, 1.84%] | 50% | 681 | 0.84% | **fail** — gap 0.84%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | coarse-cohort | 1051 | -2.54% | [-3.83%, -1.07%] | 40% | 2864 | 0.21% | [-0.56%, 0.94%] | 47% | 681 | -2.75% | **fail** — gap -2.75%/yr; below-arm CI crosses 0 |
| covid | 1y | coarse-cohort | 587 | 0.23% | [-2.80%, 3.14%] | 46% | 1254 | -1.98% | [-3.55%, -0.29%] | 43% | 369 | 2.21% | **fail** — gap 2.21%/yr; below-arm CI crosses 0 |
| covid | 3y | coarse-cohort | 587 | -0.40% | [-2.07%, 1.48%] | 41% | 1254 | -1.04% | [-2.15%, 0.25%] | 42% | 369 | 0.64% | **fail** — gap 0.64%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | coarse-cohort | 381 | -5.12% | [-7.84%, -2.09%] | 41% | 893 | -3.66% | [-5.29%, -1.79%] | 44% | 177 | -1.46% | **fail** — gap -1.46%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | coarse-cohort | 330 | -5.38% | [-8.40%, -1.86%] | 29% | 874 | -7.78% | [-9.48%, -5.98%] | 27% | 122 | 2.40% | **fail** — gap 2.40%/yr; below-arm CI crosses 0 |

## H2 — monotonic: does `upsideToP25Pct` rank-predict forward excess?

Primary estimator: per-snapshot cross-sectional Spearman (dates with ≥ 10 names), equal-weighted across dates; three gates vs a shuffled-returns null (permutation within date × super-group — same structure preservation as the IC calibration).

| Horizon | Dates (skipped) | avg IC | CI (dates) | null 99th | Gate1 stat | Gate2 econ | Window ICs | Gate3 sign | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1y | 144 (0) | -0.013 | [-3.31%, 0.84%] | 0.014 | FAIL | FAIL | -0.018 / -0.049 / 0.027 | pass | **fail-statistical** |
| 3y | 138 (0) | -0.035 | [-5.30%, -1.62%] | 0.016 | pass | FAIL | 0.003 / -0.147 / 0.038 | FAIL | **fail-economic** |

Secondary (consistency check): pooled + yearly-deduped Spearman — the estimator family the IC heatmap uses.

| Horizon | n (deduped) | IC | CI |
|---|---|---|---|
| 1y | 5347 | -0.009 | [-3.71%, 1.93%] |
| 3y | 5343 | -0.020 | [-4.83%, 0.80%] |

## H3 — convergence: do below-p25 names actually reach p25?

Weekly-close resolution (±1 week). Control = at-or-above rows required to rise by the treatment arm's median required rise over the same window.

| Regime | Horizon | n<p25 (path) | Converged | CI | Time-to-p25 days (p25/med/p75) | Non-conv terminal price/p25 (p25/med/p75) | Control n | Control target | Control converged | Control CI |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | 2027 (2027) | 1194 (58.9%) | [56.75%, 61.03%] | 14/47/129.75 | 0.53/0.70/0.81 | 5003 | 12.5% | 3365 (67.3%) | [65.95%, 68.55%] |
| pooled | 3y | 1987 (1987) | 1499 (75.4%) | [73.50%, 77.28%] | 21/81/339 | 0.38/0.55/0.71 | 4986 | 12.6% | 4378 (87.8%) | [86.87%, 88.69%] |
| pre-covid | 1y | 1075 (1075) | 657 (61.1%) | [58.17%, 63.99%] | 15/52/146 | 0.56/0.70/0.83 | 2854 | 11.4% | 2099 (73.5%) | [71.90%, 75.13%] |
| pre-covid | 3y | 1075 (1075) | 831 (77.3%) | [74.70%, 79.71%] | 23.5/87/322.5 | 0.39/0.58/0.73 | 2854 | 11.4% | 2598 (91.0%) | [89.93%, 92.02%] |
| covid | 1y | 570 (570) | 350 (61.4%) | [57.34%, 65.31%] | 12/43.5/121.25 | 0.50/0.68/0.80 | 1269 | 14.3% | 920 (72.5%) | [69.98%, 74.88%] |
| covid | 3y | 570 (570) | 441 (77.4%) | [73.76%, 80.61%] | 17/68/274 | 0.42/0.58/0.71 | 1269 | 14.3% | 1132 (89.2%) | [87.38%, 90.79%] |
| post-2022 | 1y | 382 (382) | 187 (49.0%) | [43.98%, 53.95%] | 13.5/43/121.5 | 0.52/0.69/0.81 | 880 | 12.4% | 385 (43.8%) | [40.51%, 47.05%] |
| post-2022 | 3y | 342 (342) | 227 (66.4%) | [61.21%, 71.17%] | 25.5/115/524.5 | 0.30/0.49/0.67 | 863 | 13.4% | 642 (74.4%) | [71.38%, 77.19%] |

## H4 — do the confidence / divergence / deep-cyclical flags discriminate?

The deep-cyclical stratum (loss in annual[1:4] + positive TTM — the NEM signature) was pre-declared 2026-08-20, before this run.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | confidence=high | 66 | -4.66% | [-10.30%, 0.92%] | 44% | 225 | -3.06% | [-5.61%, -0.62%] | 44% | 0 | -1.59% | **fail** — gap -1.59%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=medium | 475 | -0.00% | [-2.44%, 2.43%] | 48% | 1681 | -0.43% | [-1.46%, 0.71%] | 48% | 0 | 0.43% | **fail** — gap 0.43%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=low | 1666 | -0.12% | [-1.73%, 1.43%] | 45% | 4177 | -0.95% | [-1.71%, -0.12%] | 46% | 1416 | 0.82% | **fail** — gap 0.82%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=true | 154 | -3.61% | [-9.79%, 3.82%] | 38% | 621 | 0.58% | [-1.69%, 2.81%] | 50% | 15 | -4.19% | **fail** — gap -4.19%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=false | 1977 | 0.26% | [-1.17%, 1.69%] | 47% | 4933 | -0.86% | [-1.52%, -0.11%] | 46% | 1401 | 1.11% | **fail** — gap 1.11%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=true | 289 | -2.11% | [-6.48%, 2.58%] | 43% | 726 | -2.03% | [-4.03%, -0.02%] | 45% | 133 | -0.09% | **fail** — gap -0.09%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=false | 1838 | 0.30% | [-1.23%, 1.72%] | 47% | 4602 | -0.51% | [-1.24%, 0.21%] | 47% | 1283 | 0.81% | **fail** — gap 0.81%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=high | 60 | -5.51% | [-8.81%, -2.00%] | 33% | 212 | -5.79% | [-7.47%, -4.00%] | 29% | 0 | 0.27% | **fail** — gap 0.27%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=medium | 460 | -3.45% | [-5.12%, -1.81%] | 39% | 1640 | -1.84% | [-2.71%, -0.99%] | 41% | 0 | -1.61% | **fail** — gap -1.61%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=low | 1636 | -2.13% | [-3.33%, -0.98%] | 39% | 4150 | -1.55% | [-2.26%, -0.81%] | 42% | 1357 | -0.58% | **fail** — gap -0.58%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=true | 147 | -3.04% | [-7.55%, 1.59%] | 37% | 604 | 0.01% | [-2.08%, 2.05%] | 43% | 15 | -3.05% | **fail** — gap -3.05%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=false | 1936 | -2.37% | [-3.49%, -1.32%] | 39% | 4913 | -1.49% | [-2.06%, -0.86%] | 42% | 1342 | -0.88% | **fail** — gap -0.88%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=true | 283 | -1.97% | [-5.79%, 1.82%] | 40% | 720 | -1.41% | [-3.11%, 0.40%] | 42% | 127 | -0.57% | **fail** — gap -0.57%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=false | 1800 | -2.36% | [-3.48%, -1.24%] | 39% | 4584 | -1.36% | [-1.99%, -0.71%] | 42% | 1230 | -0.99% | **fail** — gap -0.99%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=high | 27 | -0.76% | [-7.28%, 5.07%] | 59% | 81 | -1.90% | [-5.14%, 1.37%] | 40% | 0 | 1.14% | **underpowered** — n(below)=27, n(at/above)=81 — below the 30-row verdict floor |
| pre-covid | 1y | confidence=medium | 203 | 1.67% | [-1.85%, 5.10%] | 52% | 829 | 2.58% | [1.17%, 4.00%] | 53% | 0 | -0.92% | **fail** — gap -0.92%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=low | 916 | 1.88% | [-0.00%, 4.09%] | 49% | 2425 | 0.55% | [-0.47%, 1.55%] | 49% | 730 | 1.32% | **fail** — gap 1.32%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=true | 70 | -0.92% | [-8.30%, 7.58%] | 43% | 301 | 3.48% | [0.44%, 6.86%] | 55% | 5 | -4.40% | **fail** — gap -4.40%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=false | 1049 | 1.99% | [0.30%, 3.81%] | 50% | 2823 | 0.76% | [-0.04%, 1.60%] | 49% | 725 | 1.23% | **pass** — gap 1.23%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | deep-cyclical=true | 135 | -0.54% | [-6.12%, 5.23%] | 49% | 392 | 0.09% | [-2.37%, 2.85%] | 51% | 81 | -0.63% | **fail** — gap -0.63%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=false | 978 | 2.13% | [0.16%, 3.91%] | 50% | 2631 | 0.80% | [-0.17%, 1.75%] | 49% | 649 | 1.33% | **pass** — gap 1.33%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 3y | confidence=high | 27 | -1.99% | [-5.82%, 1.46%] | 52% | 81 | -3.12% | [-5.15%, -1.13%] | 36% | 0 | 1.13% | **underpowered** — n(below)=27, n(at/above)=81 — below the 30-row verdict floor |
| pre-covid | 3y | confidence=medium | 203 | 0.32% | [-2.62%, 3.26%] | 48% | 829 | 1.71% | [0.48%, 2.90%] | 49% | 0 | -1.39% | **fail** — gap -1.39%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=low | 916 | -2.49% | [-4.08%, -0.83%] | 40% | 2425 | -0.34% | [-1.16%, 0.46%] | 46% | 730 | -2.15% | **fail** — gap -2.15%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=true | 70 | -2.38% | [-7.49%, 3.13%] | 37% | 301 | 2.05% | [-0.62%, 4.74%] | 49% | 5 | -4.43% | **fail** — gap -4.43%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=false | 1049 | -2.05% | [-3.47%, -0.56%] | 42% | 2823 | 0.04% | [-0.68%, 0.78%] | 46% | 725 | -2.08% | **fail** — gap -2.08%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=true | 135 | -0.54% | [-5.76%, 4.85%] | 49% | 392 | -0.28% | [-2.25%, 1.81%] | 48% | 81 | -0.25% | **fail** — gap -0.25%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=false | 978 | -2.35% | [-3.75%, -0.79%] | 40% | 2631 | 0.18% | [-0.58%, 0.93%] | 46% | 649 | -2.53% | **fail** — gap -2.53%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=high | 18 | 0.39% | [-13.94%, 16.87%] | 44% | 71 | -4.96% | [-9.33%, -0.57%] | 42% | 0 | 5.36% | **underpowered** — n(below)=18, n(at/above)=71 — below the 30-row verdict floor |
| covid | 1y | confidence=medium | 157 | 1.69% | [-3.61%, 6.51%] | 48% | 510 | -2.83% | [-4.92%, -0.65%] | 42% | 0 | 4.52% | **fail** — gap 4.52%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=low | 457 | -0.07% | [-3.28%, 3.40%] | 45% | 1049 | -2.01% | [-3.78%, -0.14%] | 43% | 500 | 1.95% | **fail** — gap 1.95%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=true | 46 | 3.91% | [-11.98%, 21.19%] | 46% | 202 | 1.30% | [-2.73%, 5.21%] | 48% | 6 | 2.62% | **fail** — gap 2.62%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=false | 556 | 0.82% | [-2.10%, 3.84%] | 46% | 1247 | -2.89% | [-4.50%, -1.40%] | 41% | 494 | 3.71% | **fail** — gap 3.71%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=true | 87 | 3.94% | [-6.13%, 14.54%] | 48% | 179 | -3.02% | [-8.38%, 2.64%] | 40% | 26 | 6.96% | **fail** — gap 6.96%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=false | 518 | 0.64% | [-2.42%, 3.82%] | 45% | 1180 | -1.83% | [-3.37%, -0.09%] | 43% | 474 | 2.48% | **fail** — gap 2.48%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=high | 18 | -2.20% | [-7.84%, 5.38%] | 28% | 71 | -7.00% | [-9.90%, -3.64%] | 25% | 0 | 4.80% | **underpowered** — n(below)=18, n(at/above)=71 — below the 30-row verdict floor |
| covid | 3y | confidence=medium | 157 | -2.48% | [-4.70%, -0.25%] | 39% | 510 | -2.34% | [-3.67%, -0.90%] | 39% | 0 | -0.15% | **fail** — gap -0.15%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=low | 457 | 1.03% | [-1.29%, 3.35%] | 43% | 1049 | -1.36% | [-2.51%, -0.04%] | 41% | 500 | 2.39% | **fail** — gap 2.39%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=true | 46 | -5.84% | [-11.69%, 0.32%] | 35% | 202 | -2.19% | [-4.97%, 0.71%] | 38% | 6 | -3.65% | **fail** — gap -3.65%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=false | 556 | 0.65% | [-1.25%, 2.71%] | 42% | 1247 | -1.25% | [-2.41%, -0.09%] | 41% | 494 | 1.90% | **fail** — gap 1.90%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=true | 87 | 4.35% | [-2.14%, 11.29%] | 43% | 179 | -1.15% | [-4.30%, 2.43%] | 38% | 26 | 5.50% | **fail** — gap 5.50%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=false | 518 | 0.22% | [-1.72%, 2.23%] | 42% | 1180 | -1.20% | [-2.39%, -0.03%] | 41% | 474 | 1.42% | **fail** — gap 1.42%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=high | 21 | -14.00% | [-23.48%, -3.27%] | 24% | 73 | -2.51% | [-8.20%, 2.49%] | 51% | 0 | -11.49% | **underpowered** — n(below)=21, n(at/above)=73 — below the 30-row verdict floor |
| post-2022 | 1y | confidence=medium | 115 | -5.26% | [-9.55%, -1.38%] | 42% | 342 | -4.16% | [-6.67%, -1.65%] | 44% | 0 | -1.09% | **fail** — gap -1.09%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=low | 293 | -6.47% | [-9.73%, -2.84%] | 35% | 703 | -4.52% | [-6.45%, -2.44%] | 42% | 186 | -1.94% | **fail** — gap -1.94%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=true | 38 | -17.68% | [-26.97%, -9.50%] | 21% | 118 | -8.06% | [-13.09%, -2.67%] | 38% | 4 | -9.61% | **fail** — gap -9.61%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=false | 372 | -5.49% | [-8.47%, -2.44%] | 38% | 863 | -3.22% | [-5.02%, -1.23%] | 44% | 182 | -2.27% | **fail** — gap -2.27%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=true | 67 | -13.14% | [-19.68%, -6.48%] | 25% | 155 | -6.24% | [-10.44%, -1.97%] | 39% | 26 | -6.91% | **fail** — gap -6.91%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=false | 342 | -5.47% | [-8.38%, -2.25%] | 39% | 791 | -2.90% | [-4.73%, -1.09%] | 45% | 160 | -2.57% | **fail** — gap -2.57%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=high | 15 | -15.82% | [-21.92%, -9.51%] | 7% | 60 | -7.94% | [-11.57%, -4.18%] | 23% | 0 | -7.88% | **underpowered** — n(below)=15, n(at/above)=60 — below the 30-row verdict floor |
| post-2022 | 3y | confidence=medium | 100 | -12.62% | [-15.77%, -9.27%] | 22% | 301 | -10.77% | [-12.93%, -8.32%] | 20% | 0 | -1.85% | **fail** — gap -1.85%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=low | 263 | -6.35% | [-9.83%, -2.35%] | 30% | 676 | -6.19% | [-8.40%, -4.10%] | 28% | 127 | -0.16% | **fail** — gap -0.16%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=true | 31 | -0.36% | [-14.24%, 14.89%] | 42% | 101 | -1.64% | [-7.81%, 5.86%] | 38% | 4 | 1.28% | **fail** — gap 1.28%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=false | 331 | -8.44% | [-11.10%, -5.64%] | 27% | 843 | -6.96% | [-8.63%, -5.15%] | 27% | 123 | -1.48% | **fail** — gap -1.48%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=true | 61 | -14.18% | [-19.55%, -8.18%] | 18% | 149 | -4.68% | [-9.48%, 1.02%] | 30% | 20 | -9.50% | **fail** — gap -9.50%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=false | 304 | -6.76% | [-9.59%, -3.47%] | 29% | 773 | -6.85% | [-8.69%, -4.80%] | 27% | 107 | 0.09% | **fail** — gap 0.09%/yr; below-arm CI crosses 0 |

### H4 discrimination verdicts (below-arm vs below-arm)

| Comparison | Regime | Horizon | Gap/yr | Verdict |
|---|---|---|---|---|
| confidence high vs low | pooled | 1y | -4.53% | **decorative** — below-arm gap -4.53%/yr, CIs overlap |
| divergent false vs true | pooled | 1y | 3.87% | **decorative** — below-arm gap 3.87%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 1y | 2.41% | **decorative** — below-arm gap 2.41%/yr, CIs overlap |
| confidence high vs low | pooled | 3y | -3.38% | **decorative** — below-arm gap -3.38%/yr, CIs overlap |
| divergent false vs true | pooled | 3y | 0.67% | **decorative** — below-arm gap 0.67%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 3y | -0.38% | **decorative** — below-arm gap -0.38%/yr, CIs overlap |
| confidence high vs low | pre-covid | 1y | — | **underpowered** — below-arm n: 27 vs 916 (floor 30) |
| divergent false vs true | pre-covid | 1y | 2.92% | **decorative** — below-arm gap 2.92%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 1y | 2.67% | **decorative** — below-arm gap 2.67%/yr, CIs overlap |
| confidence high vs low | pre-covid | 3y | — | **underpowered** — below-arm n: 27 vs 916 (floor 30) |
| divergent false vs true | pre-covid | 3y | 0.33% | **decorative** — below-arm gap 0.33%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 3y | -1.81% | **decorative** — below-arm gap -1.81%/yr, CIs overlap |
| confidence high vs low | covid | 1y | — | **underpowered** — below-arm n: 18 vs 457 (floor 30) |
| divergent false vs true | covid | 1y | -3.09% | **decorative** — below-arm gap -3.09%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 1y | -3.30% | **decorative** — below-arm gap -3.30%/yr, CIs overlap |
| confidence high vs low | covid | 3y | — | **underpowered** — below-arm n: 18 vs 457 (floor 30) |
| divergent false vs true | covid | 3y | 6.49% | **decorative** — below-arm gap 6.49%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 3y | -4.14% | **decorative** — below-arm gap -4.14%/yr, CIs overlap |
| confidence high vs low | post-2022 | 1y | — | **underpowered** — below-arm n: 21 vs 293 (floor 30) |
| divergent false vs true | post-2022 | 1y | 12.18% | **discriminating** — below-arm gap 12.18%/yr with disjoint CIs |
| deep-cyclical false vs true | post-2022 | 1y | 7.68% | **decorative** — below-arm gap 7.68%/yr, CIs overlap |
| confidence high vs low | post-2022 | 3y | — | **underpowered** — below-arm n: 15 vs 263 (floor 30) |
| divergent false vs true | post-2022 | 3y | -8.08% | **decorative** — below-arm gap -8.08%/yr, CIs overlap |
| deep-cyclical false vs true | post-2022 | 3y | 7.42% | **decorative** — below-arm gap 7.42%/yr, CIs overlap |

## H5 — peer contamination: does predictive power decay with peer premium?

Primary buckets on the SYMMETRIC ratio max(peer/own, own/peer) — the quantity the production 5.0 cliff gates on. The `>= 5.0 (pre-suppression band)` stratum recomputes belowP25 from the full-9 pre-suppression anchors: production's band past the cliff is own-only by construction, so this is the only view of raw contamination there.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | sym [1, 1.5) | 835 | 0.45% | [-1.40%, 2.25%] | 50% | 3447 | -0.89% | [-1.59%, -0.16%] | 46% | 62 | 1.34% | **fail** — gap 1.34%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [1.5, 2.5) | 915 | -0.07% | [-2.26%, 2.02%] | 46% | 2508 | -1.22% | [-2.24%, -0.12%] | 46% | 29 | 1.15% | **fail** — gap 1.15%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [2.5, 5) | 501 | -1.26% | [-4.43%, 1.87%] | 42% | 1144 | -1.50% | [-3.25%, 0.13%] | 47% | 14 | 0.24% | **fail** — gap 0.24%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 | 154 | -3.61% | [-10.33%, 3.25%] | 38% | 621 | 0.58% | [-1.77%, 2.80%] | 50% | 15 | -4.19% | **fail** — gap -4.19%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 (pre-suppression band) | 194 | -2.36% | [-7.76%, 3.61%] | 44% | 571 | 0.64% | [-1.87%, 2.95%] | 49% | 10 | -3.00% | **fail** — gap -3.00%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1, 1.5) | 794 | -2.31% | [-3.60%, -0.96%] | 40% | 3398 | -1.28% | [-1.95%, -0.59%] | 42% | 56 | -1.04% | **fail** — gap -1.04%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1.5, 2.5) | 894 | -3.06% | [-4.57%, -1.53%] | 38% | 2458 | -1.44% | [-2.18%, -0.60%] | 42% | 29 | -1.63% | **fail** — gap -1.63%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [2.5, 5) | 488 | -2.00% | [-4.38%, 0.53%] | 40% | 1116 | -1.76% | [-3.17%, -0.15%] | 37% | 14 | -0.24% | **fail** — gap -0.24%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 | 147 | -3.04% | [-7.23%, 1.41%] | 37% | 604 | 0.01% | [-1.93%, 2.18%] | 43% | 15 | -3.05% | **fail** — gap -3.05%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 (pre-suppression band) | 185 | -2.26% | [-6.26%, 1.89%] | 38% | 556 | -0.23% | [-2.26%, 1.75%] | 43% | 10 | -2.03% | **fail** — gap -2.03%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [1, 1.5) | 461 | 2.39% | [0.19%, 4.60%] | 53% | 1973 | 1.00% | [-0.01%, 1.97%] | 48% | 38 | 1.39% | **pass** — gap 1.39%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | sym [1.5, 2.5) | 478 | 1.44% | [-1.13%, 3.78%] | 49% | 1326 | 0.75% | [-0.52%, 2.18%] | 50% | 17 | 0.69% | **fail** — gap 0.69%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [2.5, 5) | 242 | 1.35% | [-3.26%, 5.73%] | 46% | 559 | 1.17% | [-1.15%, 3.66%] | 52% | 8 | 0.17% | **fail** — gap 0.17%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 | 70 | -0.92% | [-8.99%, 7.04%] | 43% | 301 | 3.48% | [0.52%, 6.92%] | 55% | 5 | -4.40% | **fail** — gap -4.40%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 (pre-suppression band) | 84 | -2.25% | [-9.61%, 5.64%] | 48% | 279 | 3.59% | [0.22%, 6.82%] | 55% | 5 | -5.84% | **fail** — gap -5.84%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1, 1.5) | 461 | -1.63% | [-3.28%, 0.06%] | 43% | 1973 | 0.46% | [-0.37%, 1.32%] | 47% | 38 | -2.09% | **fail** — gap -2.09%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1.5, 2.5) | 478 | -2.50% | [-4.25%, -0.43%] | 40% | 1326 | 0.28% | [-0.81%, 1.41%] | 47% | 17 | -2.77% | **fail** — gap -2.77%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [2.5, 5) | 242 | -1.16% | [-5.02%, 3.31%] | 43% | 559 | -0.64% | [-2.49%, 1.31%] | 40% | 8 | -0.53% | **fail** — gap -0.53%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 | 70 | -2.38% | [-8.06%, 3.78%] | 37% | 301 | 2.05% | [-0.49%, 4.88%] | 49% | 5 | -4.43% | **fail** — gap -4.43%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 (pre-suppression band) | 84 | -4.54% | [-9.18%, 0.15%] | 39% | 279 | 2.05% | [-0.79%, 4.98%] | 47% | 5 | -6.59% | **fail** — gap -6.59%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1, 1.5) | 212 | 2.03% | [-2.55%, 6.66%] | 50% | 858 | -2.58% | [-4.17%, -0.88%] | 43% | 6 | 4.61% | **fail** — gap 4.61%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1.5, 2.5) | 268 | 3.18% | [-1.15%, 7.98%] | 49% | 716 | -1.45% | [-3.33%, 0.53%] | 44% | 8 | 4.64% | **fail** — gap 4.64%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [2.5, 5) | 157 | 0.14% | [-5.83%, 5.72%] | 45% | 351 | -2.68% | [-5.85%, 0.39%] | 43% | 6 | 2.82% | **fail** — gap 2.82%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 | 46 | 3.91% | [-12.62%, 22.57%] | 46% | 202 | 1.30% | [-2.73%, 5.33%] | 48% | 6 | 2.62% | **fail** — gap 2.62%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 (pre-suppression band) | 60 | 5.24% | [-7.05%, 20.25%] | 48% | 185 | 1.84% | [-2.51%, 6.17%] | 49% | 4 | 3.39% | **fail** — gap 3.39%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1, 1.5) | 212 | 0.54% | [-1.99%, 3.04%] | 46% | 858 | -1.22% | [-2.30%, -0.08%] | 41% | 6 | 1.76% | **fail** — gap 1.76%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1.5, 2.5) | 268 | 1.09% | [-1.64%, 4.02%] | 41% | 716 | -1.42% | [-2.72%, -0.15%] | 42% | 8 | 2.51% | **fail** — gap 2.51%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [2.5, 5) | 157 | 1.77% | [-1.47%, 5.72%] | 43% | 351 | -1.34% | [-3.81%, 1.33%] | 36% | 6 | 3.11% | **fail** — gap 3.11%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 | 46 | -5.84% | [-11.31%, 0.38%] | 35% | 202 | -2.19% | [-5.05%, 0.83%] | 38% | 6 | -3.65% | **fail** — gap -3.65%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 (pre-suppression band) | 60 | -3.39% | [-8.26%, 2.45%] | 35% | 185 | -1.97% | [-4.76%, 1.42%] | 39% | 4 | -1.42% | **fail** — gap -1.42%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1, 1.5) | 162 | -7.16% | [-10.67%, -3.56%] | 41% | 616 | -4.59% | [-6.55%, -2.61%] | 41% | 18 | -2.57% | **fail** — gap -2.57%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1.5, 2.5) | 169 | -9.46% | [-13.77%, -5.30%] | 33% | 466 | -6.46% | [-8.67%, -4.08%] | 39% | 4 | -3.01% | **fail** — gap -3.01%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [2.5, 5) | 102 | -9.59% | [-16.46%, -1.71%] | 27% | 234 | -6.12% | [-10.07%, -2.16%] | 41% | 0 | -3.47% | **fail** — gap -3.47%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 | 38 | -17.68% | [-26.62%, -9.00%] | 21% | 118 | -8.06% | [-13.57%, -3.08%] | 38% | 4 | -9.61% | **fail** — gap -9.61%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 (pre-suppression band) | 50 | -11.68% | [-18.62%, -4.72%] | 34% | 107 | -9.14% | [-14.80%, -3.55%] | 35% | 1 | -2.54% | **fail** — gap -2.54%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1, 1.5) | 121 | -9.93% | [-13.53%, -6.13%] | 22% | 567 | -7.40% | [-9.56%, -5.33%] | 25% | 12 | -2.52% | **fail** — gap -2.52%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1.5, 2.5) | 148 | -12.42% | [-15.98%, -8.64%] | 28% | 416 | -6.92% | [-9.68%, -3.79%] | 28% | 4 | -5.49% | **fail** — gap -5.49%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [2.5, 5) | 89 | -10.92% | [-15.92%, -5.07%] | 29% | 206 | -5.52% | [-9.79%, -0.52%] | 30% | 0 | -5.41% | **fail** — gap -5.41%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 | 31 | -0.36% | [-14.27%, 14.07%] | 42% | 101 | -1.64% | [-7.72%, 5.74%] | 38% | 4 | 1.28% | **fail** — gap 1.28%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 (pre-suppression band) | 41 | 4.06% | [-8.36%, 21.08%] | 39% | 92 | -3.64% | [-8.80%, 2.80%] | 38% | 1 | 7.71% | **fail** — gap 7.71%/yr; below-arm CI crosses 0 |

### H5 trend verdicts

| Regime | Horizon | Spearman(bucket, gap) | Monotonic decay | Top bucket ≤ 0 | Verdict |
|---|---|---|---|---|---|
| pooled | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| pooled | 3y | -0.400 | no | yes | **no-decay-evidence** |
| pre-covid | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| pre-covid | 3y | -0.400 | no | yes | **no-decay-evidence** |
| covid | 1y | -0.800 | no | no | **no-decay-evidence** |
| covid | 3y | -0.200 | no | yes | **no-decay-evidence** |
| post-2022 | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| post-2022 | 3y | 0.400 | no | no | **no-decay-evidence** |

### H5 secondary — directed ratio (peer/own), exposing the two sides of the cliff

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | dir [0, 0.4) | 48 | 9.70% | [-3.74%, 26.11%] | 52% | 958 | 0.79% | [-1.07%, 2.52%] | 50% | 21 | 8.91% | **fail** — gap 8.91%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [0.4, 0.67) | 30 | 11.63% | [-2.55%, 27.69%] | 57% | 1526 | -0.66% | [-1.88%, 0.69%] | 47% | 3 | 12.29% | **fail** — gap 12.29%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [0.67, 1.5) | 834 | 0.37% | [-1.46%, 2.28%] | 50% | 3437 | -0.93% | [-1.69%, -0.16%] | 46% | 62 | 1.29% | **fail** — gap 1.29%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [1.5, 2.5) | 889 | -0.41% | [-2.35%, 1.66%] | 46% | 1166 | -1.85% | [-3.39%, -0.34%] | 45% | 26 | 1.45% | **fail** — gap 1.45%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [2.5, 5) | 493 | -1.48% | [-4.72%, 1.91%] | 41% | 412 | -3.92% | [-6.68%, -1.15%] | 45% | 5 | 2.45% | **fail** — gap 2.45%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir >= 5 | 117 | -4.39% | [-12.61%, 4.30%] | 35% | 214 | -3.80% | [-7.50%, -0.19%] | 44% | 3 | -0.58% | **fail** — gap -0.58%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0, 0.4) | 48 | 0.19% | [-7.99%, 9.00%] | 42% | 942 | -0.57% | [-2.30%, 1.12%] | 40% | 21 | 0.76% | **fail** — gap 0.76%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0.4, 0.67) | 28 | -7.16% | [-13.34%, -1.05%] | 25% | 1499 | -1.16% | [-2.31%, 0.11%] | 43% | 3 | -6.00% | **underpowered** — n(below)=28, n(at/above)=1499 — below the 30-row verdict floor |
| pooled | 3y | dir [0.67, 1.5) | 793 | -2.36% | [-3.64%, -0.89%] | 40% | 3387 | -1.29% | [-1.97%, -0.64%] | 42% | 56 | -1.07% | **fail** — gap -1.07%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [1.5, 2.5) | 870 | -2.93% | [-4.46%, -1.45%] | 39% | 1138 | -1.77% | [-2.91%, -0.60%] | 41% | 26 | -1.16% | **fail** — gap -1.16%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [2.5, 5) | 480 | -2.00% | [-4.55%, 0.94%] | 40% | 398 | -3.16% | [-5.18%, -0.84%] | 36% | 5 | 1.16% | **fail** — gap 1.16%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir >= 5 | 110 | -2.53% | [-7.80%, 3.79%] | 37% | 209 | -3.67% | [-6.90%, -0.33%] | 38% | 3 | 1.14% | **fail** — gap 1.14%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0, 0.4) | 31 | 13.57% | [-4.65%, 40.03%] | 55% | 473 | 3.49% | [1.00%, 5.92%] | 56% | 8 | 10.08% | **fail** — gap 10.08%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0.4, 0.67) | 18 | 25.30% | [5.05%, 45.33%] | 67% | 784 | 1.13% | [-0.79%, 2.90%] | 50% | 0 | 24.17% | **underpowered** — n(below)=18, n(at/above)=784 — below the 30-row verdict floor |
| pre-covid | 1y | dir [0.67, 1.5) | 460 | 2.25% | [0.10%, 4.64%] | 53% | 1966 | 0.95% | [-0.02%, 2.01%] | 48% | 38 | 1.30% | **pass** — gap 1.30%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | dir [1.5, 2.5) | 463 | 0.55% | [-1.83%, 3.00%] | 48% | 626 | 0.15% | [-1.70%, 2.18%] | 50% | 17 | 0.40% | **fail** — gap 0.40%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [2.5, 5) | 238 | 0.70% | [-3.61%, 5.14%] | 45% | 205 | -1.64% | [-5.65%, 2.35%] | 50% | 4 | 2.33% | **fail** — gap 2.33%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir >= 5 | 45 | -1.07% | [-12.21%, 9.54%] | 40% | 102 | -1.76% | [-7.05%, 3.27%] | 46% | 1 | 0.68% | **fail** — gap 0.68%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0, 0.4) | 31 | 3.46% | [-5.61%, 13.67%] | 48% | 473 | 2.01% | [-0.14%, 4.22%] | 45% | 8 | 1.45% | **fail** — gap 1.45%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0.4, 0.67) | 18 | -1.25% | [-9.43%, 6.79%] | 39% | 784 | 0.76% | [-0.77%, 2.42%] | 47% | 0 | -2.01% | **underpowered** — n(below)=18, n(at/above)=784 — below the 30-row verdict floor |
| pre-covid | 3y | dir [0.67, 1.5) | 460 | -1.70% | [-3.30%, 0.20%] | 42% | 1966 | 0.45% | [-0.42%, 1.38%] | 47% | 38 | -2.15% | **fail** — gap -2.15%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [1.5, 2.5) | 463 | -2.54% | [-4.40%, -0.33%] | 40% | 626 | -0.58% | [-2.04%, 0.82%] | 46% | 17 | -1.96% | **fail** — gap -1.96%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [2.5, 5) | 238 | -1.44% | [-5.53%, 3.38%] | 42% | 205 | -3.18% | [-6.22%, -0.09%] | 36% | 4 | 1.74% | **fail** — gap 1.74%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir >= 5 | 45 | -2.92% | [-10.14%, 5.23%] | 36% | 102 | -4.48% | [-7.74%, -1.12%] | 39% | 1 | 1.55% | **fail** — gap 1.55%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [0, 0.4) | 10 | 11.62% | [-10.37%, 42.93%] | 60% | 304 | -0.84% | [-4.14%, 2.53%] | 45% | 9 | 12.46% | **underpowered** — n(below)=10, n(at/above)=304 — below the 30-row verdict floor |
| covid | 1y | dir [0.4, 0.67) | 6 | -21.39% | [-38.75%, -1.20%] | 17% | 440 | -0.69% | [-3.04%, 1.58%] | 45% | 2 | -20.71% | **underpowered** — n(below)=6, n(at/above)=440 — below the 30-row verdict floor |
| covid | 1y | dir [0.67, 1.5) | 212 | 2.03% | [-2.84%, 6.94%] | 50% | 855 | -2.61% | [-4.20%, -0.90%] | 43% | 6 | 4.65% | **fail** — gap 4.65%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [1.5, 2.5) | 263 | 3.82% | [-0.71%, 8.59%] | 50% | 345 | -1.91% | [-4.69%, 1.07%] | 42% | 6 | 5.73% | **fail** — gap 5.73%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [2.5, 5) | 157 | 0.14% | [-5.91%, 6.21%] | 45% | 120 | -2.57% | [-7.55%, 2.57%] | 43% | 1 | 2.71% | **fail** — gap 2.71%/yr; below-arm CI crosses 0 |
| covid | 1y | dir >= 5 | 37 | 5.38% | [-13.03%, 28.61%] | 43% | 64 | -0.52% | [-6.42%, 5.34%] | 47% | 2 | 5.90% | **fail** — gap 5.90%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [0, 0.4) | 10 | -0.63% | [-19.41%, 28.47%] | 30% | 304 | -3.15% | [-5.55%, -0.81%] | 33% | 9 | 2.51% | **underpowered** — n(below)=10, n(at/above)=304 — below the 30-row verdict floor |
| covid | 3y | dir [0.4, 0.67) | 6 | -12.25% | [-16.91%, -7.64%] | 0% | 440 | -0.86% | [-2.49%, 0.82%] | 43% | 2 | -11.38% | **underpowered** — n(below)=6, n(at/above)=440 — below the 30-row verdict floor |
| covid | 3y | dir [0.67, 1.5) | 212 | 0.54% | [-2.09%, 3.15%] | 46% | 855 | -1.25% | [-2.38%, -0.20%] | 41% | 6 | 1.79% | **fail** — gap 1.79%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [1.5, 2.5) | 263 | 1.38% | [-1.38%, 4.13%] | 42% | 345 | -1.73% | [-3.52%, 0.09%] | 40% | 6 | 3.11% | **fail** — gap 3.11%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [2.5, 5) | 157 | 1.77% | [-1.65%, 5.15%] | 43% | 120 | 1.05% | [-2.82%, 5.10%] | 45% | 1 | 0.72% | **fail** — gap 0.72%/yr; below-arm CI crosses 0 |
| covid | 3y | dir >= 5 | 37 | -4.02% | [-10.77%, 3.04%] | 38% | 64 | -3.48% | [-7.07%, -0.14%] | 39% | 2 | -0.54% | **fail** — gap -0.54%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [0, 0.4) | 7 | -10.18% | [-29.87%, 13.12%] | 29% | 181 | -3.52% | [-8.12%, 1.49%] | 43% | 4 | -6.66% | **underpowered** — n(below)=7, n(at/above)=181 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.4, 0.67) | 6 | 3.66% | [-22.61%, 27.47%] | 67% | 302 | -5.29% | [-8.06%, -2.10%] | 41% | 1 | 8.95% | **underpowered** — n(below)=6, n(at/above)=302 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.67, 1.5) | 162 | -7.16% | [-10.76%, -3.79%] | 41% | 616 | -4.57% | [-6.42%, -2.66%] | 41% | 18 | -2.60% | **fail** — gap -2.60%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [1.5, 2.5) | 163 | -9.95% | [-14.13%, -5.37%] | 31% | 195 | -8.21% | [-11.45%, -5.14%] | 34% | 3 | -1.74% | **fail** — gap -1.74%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [2.5, 5) | 98 | -9.34% | [-16.54%, -1.52%] | 28% | 87 | -11.17% | [-16.65%, -5.95%] | 36% | 0 | 1.83% | **fail** — gap 1.83%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir >= 5 | 35 | -18.96% | [-26.67%, -10.91%] | 20% | 48 | -12.52% | [-20.57%, -5.15%] | 38% | 0 | -6.44% | **fail** — gap -6.44%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [0, 0.4) | 7 | -13.10% | [-30.26%, 2.59%] | 29% | 165 | -3.24% | [-8.37%, 2.20%] | 36% | 4 | -9.87% | **underpowered** — n(below)=7, n(at/above)=165 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.4, 0.67) | 4 | -26.11% | — | 0% | 275 | -7.12% | [-10.18%, -3.39%] | 30% | 1 | -18.99% | **underpowered** — n(below)=4, n(at/above)=275 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.67, 1.5) | 121 | -9.93% | [-13.29%, -6.26%] | 22% | 566 | -7.36% | [-9.44%, -5.04%] | 25% | 12 | -2.56% | **fail** — gap -2.56%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [1.5, 2.5) | 144 | -12.03% | [-15.45%, -7.94%] | 28% | 167 | -6.30% | [-10.85%, -0.74%] | 25% | 3 | -5.73% | **fail** — gap -5.73%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [2.5, 5) | 85 | -10.52% | [-16.06%, -4.13%] | 31% | 73 | -10.02% | [-14.71%, -5.06%] | 21% | 0 | -0.50% | **fail** — gap -0.50%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir >= 5 | 28 | 0.08% | [-14.56%, 16.32%] | 39% | 43 | -2.01% | [-13.70%, 11.71%] | 33% | 0 | 2.09% | **underpowered** — n(below)=28, n(at/above)=43 — below the 30-row verdict floor |

## H6 — anchor ablation (pooled; regime lens lives in H1)

Variants recompute the band from pre-suppression anchor subsets. Common support = rows where both own-3 and peer-6 bands exist.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | variant=production (common support) | 1909 | -0.80% | [-2.21%, 0.55%] | 46% | 4902 | -0.89% | [-1.58%, -0.15%] | 46% | 0 | 0.09% | **fail** — gap 0.09%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=production (unrestricted) | 2027 | -0.16% | [-1.56%, 1.17%] | 47% | 5003 | -0.84% | [-1.52%, -0.13%] | 46% | 1416 | 0.68% | **fail** — gap 0.68%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (common support) | 1893 | -0.82% | [-2.20%, 0.59%] | 47% | 4877 | -0.90% | [-1.60%, -0.11%] | 46% | 0 | 0.08% | **fail** — gap 0.08%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (unrestricted) | 2010 | -0.19% | [-1.58%, 1.20%] | 47% | 4976 | -0.83% | [-1.56%, -0.10%] | 47% | 1411 | 0.64% | **fail** — gap 0.64%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (common support) | 1987 | -0.04% | [-1.51%, 1.42%] | 47% | 4930 | -0.88% | [-1.56%, -0.17%] | 47% | 0 | 0.84% | **fail** — gap 0.84%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (unrestricted) | 1992 | 0.04% | [-1.36%, 1.46%] | 47% | 4956 | -0.91% | [-1.58%, -0.22%] | 47% | 3679 | 0.96% | **fail** — gap 0.96%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (common support) | 2576 | -1.83% | [-2.87%, -0.74%] | 45% | 4393 | -0.84% | [-1.57%, -0.04%] | 46% | 0 | -0.99% | **fail** — gap -0.99%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (unrestricted) | 2668 | -1.35% | [-2.40%, -0.36%] | 45% | 4475 | -0.77% | [-1.54%, -0.02%] | 46% | 1796 | -0.59% | **fail** — gap -0.59%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (common support) | 1866 | -2.40% | [-3.51%, -1.22%] | 39% | 4882 | -1.48% | [-2.06%, -0.83%] | 42% | 0 | -0.92% | **fail** — gap -0.92%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (unrestricted) | 1987 | -2.36% | [-3.38%, -1.33%] | 39% | 4986 | -1.47% | [-2.06%, -0.80%] | 42% | 1357 | -0.89% | **fail** — gap -0.89%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (common support) | 1851 | -2.33% | [-3.47%, -1.17%] | 39% | 4856 | -1.49% | [-2.08%, -0.87%] | 42% | 0 | -0.84% | **fail** — gap -0.84%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (unrestricted) | 1971 | -2.29% | [-3.32%, -1.24%] | 39% | 4958 | -1.47% | [-2.02%, -0.84%] | 42% | 1352 | -0.82% | **fail** — gap -0.82%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (common support) | 1928 | -1.80% | [-2.94%, -0.62%] | 40% | 4903 | -1.52% | [-2.09%, -0.91%] | 42% | 0 | -0.28% | **fail** — gap -0.28%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (unrestricted) | 1934 | -1.78% | [-2.92%, -0.41%] | 40% | 4929 | -1.55% | [-2.14%, -0.96%] | 42% | 3520 | -0.23% | **fail** — gap -0.23%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (common support) | 2538 | -2.62% | [-3.44%, -1.77%] | 38% | 4368 | -1.39% | [-2.05%, -0.82%] | 42% | 0 | -1.23% | **fail** — gap -1.23%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (unrestricted) | 2632 | -2.49% | [-3.31%, -1.71%] | 39% | 4453 | -1.37% | [-2.07%, -0.72%] | 42% | 1730 | -1.12% | **fail** — gap -1.12%/yr; below-arm CI crosses 0 |

### H6 anchor correlation structure

Pairwise Spearman of row-median-normalized implied prices. Effective anchor count ((Σλ)²/Σλ², non-negative eigenvalues over the active block): **4.75 of 9 active** (9 total). 0 pairs below the min-N floor render as — and enter the eigen step as 0.

| | peerMedianPE | peerMedianEVEBITDA | peerMedianPFCF | ownHistoricalPE | ownHistoricalEVEBITDA | ownHistoricalPFCF | normalizedPE | normalizedEVEBITDA | normalizedPFCF |
|---|---|---|---|---|---|---|---|---|---|
| **peerMedianPE** | 1.00 | -0.16 | -0.37 | 0.04 | -0.31 | -0.39 | 0.34 | -0.24 | -0.29 |
| **peerMedianEVEBITDA** | -0.16 | 1.00 | -0.23 | -0.38 | -0.10 | -0.39 | -0.15 | 0.66 | -0.20 |
| **peerMedianPFCF** | -0.37 | -0.23 | 1.00 | -0.37 | -0.30 | 0.07 | -0.25 | -0.17 | 0.56 |
| **ownHistoricalPE** | 0.04 | -0.38 | -0.37 | 1.00 | 0.57 | 0.39 | -0.36 | -0.49 | -0.33 |
| **ownHistoricalEVEBITDA** | -0.31 | -0.10 | -0.30 | 0.57 | 1.00 | 0.47 | -0.40 | -0.37 | -0.29 |
| **ownHistoricalPFCF** | -0.39 | -0.39 | 0.07 | 0.39 | 0.47 | 1.00 | -0.37 | -0.40 | -0.36 |
| **normalizedPE** | 0.34 | -0.15 | -0.25 | -0.36 | -0.40 | -0.37 | 1.00 | 0.01 | -0.09 |
| **normalizedEVEBITDA** | -0.24 | 0.66 | -0.17 | -0.49 | -0.37 | -0.40 | 0.01 | 1.00 | -0.05 |
| **normalizedPFCF** | -0.29 | -0.20 | 0.56 | -0.33 | -0.29 | -0.36 | -0.09 | -0.05 | 1.00 |

Eigenvalues: 2.90, 2.07, 1.80, 0.82, 0.64, 0.43, 0.23, 0.17, -0.06

---

**Verdict:** H1 pooled 3y: fail (gap -0.89%/yr); H2 3y: fail-economic (avg IC -0.035)
