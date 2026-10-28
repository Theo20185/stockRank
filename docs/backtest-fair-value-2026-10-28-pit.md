# Fair-value backtest (H1–H6) — 2026-10-28 (PIT)

**Snapshot range:** 2011-10-31 → 2023-09-30 · horizons 1y, 3y

**Coverage:** 115422 observations, 541 symbols, 144 snapshot dates. 2758 no-band rows (kept, reported per cell), 0 engine-error rows (excluded, counted here).

## Point-in-time caveats (restated per protocol)

- **Restatement bias** — EDGAR companyfacts returns the latest-filed value per period; filing-lag cutoffs prevent lookahead on unfiled periods, but later restatements of already-visible periods are not masked.
- **Industry membership** — peer cohorts use TODAY's Yahoo industry classification at every historical date. Not reconstructible from existing data (the Wikipedia changes table carries no GICS, EDGAR exposes only the current SIC, and the dated snapshot archive starts 2026-04). Exposure is bounded by the coarse-cohort stress rerun (super-group membership is far stickier than sub-industry) and quantified by the cap-bucket churn figure (that component of cohort assignment IS computed point-in-time).
- **Cap-bucket churn** (the cohort-drift component this harness DOES capture): 21.72% of (symbol, date) rows sit in a different cap bucket at the snapshot than at the run's final date.

**Conventions:** valuation-basis prices vs bands; total-return excess vs SPY; yearly dedup per §3.9.3 in every cell; annualized = cumulative ÷ horizon; verdicts need ≥ 30 deduped rows/arm; pass bar = gap ≥ 1.00%/yr with below-arm CI excluding 0 (§3.11.1 parity). All thresholds frozen before the run.

## H1 — directional: does `price < p25` predict positive forward excess?

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | all | 2114 | -0.48% | [-1.68%, 0.92%] | 46% | 4936 | -0.93% | [-1.65%, -0.24%] | 46% | 1406 | 0.45% | **fail** — gap 0.45%/yr; below-arm CI crosses 0 |
| pooled | 3y | all | 2071 | -2.28% | [-3.20%, -1.24%] | 39% | 4916 | -1.45% | [-2.10%, -0.78%] | 42% | 1352 | -0.83% | **fail** — gap -0.83%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | all | 1145 | 1.58% | [-0.25%, 3.29%] | 50% | 2813 | 0.58% | [-0.31%, 1.50%] | 49% | 713 | 0.99% | **fail** — gap 0.99%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | all | 1145 | -1.68% | [-3.00%, -0.33%] | 42% | 2813 | 0.18% | [-0.53%, 0.99%] | 47% | 713 | -1.86% | **fail** — gap -1.86%/yr; below-arm CI crosses 0 |
| covid | 1y | all | 590 | -0.84% | [-3.71%, 2.24%] | 44% | 1252 | -2.42% | [-4.05%, -0.82%] | 42% | 507 | 1.58% | **fail** — gap 1.58%/yr; below-arm CI crosses 0 |
| covid | 3y | all | 590 | -0.24% | [-2.03%, 1.64%] | 40% | 1252 | -1.29% | [-2.34%, -0.09%] | 41% | 507 | 1.06% | **fail** — gap 1.06%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | all | 379 | -6.12% | [-9.05%, -3.26%] | 37% | 871 | -3.68% | [-5.57%, -1.93%] | 44% | 186 | -2.44% | **fail** — gap -2.44%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | all | 336 | -7.91% | [-10.18%, -5.35%] | 27% | 851 | -7.04% | [-8.88%, -5.16%] | 27% | 132 | -0.86% | **fail** — gap -0.86%/yr; below-arm CI crosses 0 |

### H1 stress — coarse (super-group) cohorts, bounding today's-industry-classification exposure

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | coarse-cohort | 2098 | -0.45% | [-1.89%, 0.96%] | 46% | 4945 | -0.79% | [-1.53%, -0.08%] | 46% | 1230 | 0.34% | **fail** — gap 0.34%/yr; below-arm CI crosses 0 |
| pooled | 3y | coarse-cohort | 2046 | -2.58% | [-3.53%, -1.57%] | 39% | 4921 | -1.55% | [-2.13%, -0.92%] | 42% | 1180 | -1.03% | **fail** — gap -1.03%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | coarse-cohort | 1110 | 1.11% | [-0.62%, 2.85%] | 49% | 2825 | 0.72% | [-0.13%, 1.56%] | 49% | 673 | 0.39% | **fail** — gap 0.39%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | coarse-cohort | 1110 | -2.70% | [-3.83%, -1.46%] | 41% | 2825 | 0.12% | [-0.57%, 0.79%] | 46% | 673 | -2.82% | **fail** — gap -2.82%/yr; below-arm CI crosses 0 |
| covid | 1y | coarse-cohort | 594 | -0.42% | [-3.02%, 2.65%] | 45% | 1234 | -1.90% | [-3.54%, -0.26%] | 43% | 387 | 1.48% | **fail** — gap 1.48%/yr; below-arm CI crosses 0 |
| covid | 3y | coarse-cohort | 594 | -0.66% | [-2.35%, 1.09%] | 41% | 1234 | -1.10% | [-2.23%, 0.01%] | 42% | 387 | 0.44% | **fail** — gap 0.44%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | coarse-cohort | 394 | -4.87% | [-7.81%, -1.93%] | 41% | 886 | -4.08% | [-5.72%, -2.32%] | 43% | 170 | -0.79% | **fail** — gap -0.79%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | coarse-cohort | 342 | -5.54% | [-8.48%, -2.64%] | 30% | 862 | -7.69% | [-9.32%, -5.87%] | 27% | 120 | 2.15% | **fail** — gap 2.15%/yr; below-arm CI crosses 0 |

## H2 — monotonic: does `upsideToP25Pct` rank-predict forward excess?

Primary estimator: per-snapshot cross-sectional Spearman (dates with ≥ 10 names), equal-weighted across dates; three gates vs a shuffled-returns null (permutation within date × super-group — same structure preservation as the IC calibration).

| Horizon | Dates (skipped) | avg IC | CI (dates) | null 99th | Gate1 stat | Gate2 econ | Window ICs | Gate3 sign | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1y | 144 (0) | -0.010 | [-3.10%, 1.08%] | 0.016 | FAIL | FAIL | -0.010 / -0.045 / 0.024 | pass | **fail-statistical** |
| 3y | 138 (0) | -0.026 | [-4.25%, -0.69%] | 0.012 | pass | FAIL | 0.021 / -0.135 / 0.037 | FAIL | **fail-economic** |

Secondary (consistency check): pooled + yearly-deduped Spearman — the estimator family the IC heatmap uses.

| Horizon | n (deduped) | IC | CI |
|---|---|---|---|
| 1y | 5323 | -0.008 | [-3.44%, 2.13%] |
| 3y | 5319 | -0.012 | [-3.94%, 1.63%] |

## H3 — convergence: do below-p25 names actually reach p25?

Weekly-close resolution (±1 week). Control = at-or-above rows required to rise by the treatment arm's median required rise over the same window.

| Regime | Horizon | n<p25 (path) | Converged | CI | Time-to-p25 days (p25/med/p75) | Non-conv terminal price/p25 (p25/med/p75) | Control n | Control target | Control converged | Control CI |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | 2114 (2114) | 1224 (57.9%) | [55.78%, 59.99%] | 13/48/137 | 0.53/0.70/0.81 | 4936 | 12.9% | 3259 (66.0%) | [64.69%, 67.33%] |
| pooled | 3y | 2071 (2071) | 1546 (74.6%) | [72.73%, 76.48%] | 21/85.5/346 | 0.37/0.55/0.71 | 4916 | 13.1% | 4282 (87.1%) | [86.14%, 88.01%] |
| pre-covid | 1y | 1145 (1145) | 694 (60.6%) | [57.75%, 63.40%] | 15/50/155 | 0.56/0.71/0.83 | 2813 | 11.5% | 2051 (72.9%) | [71.24%, 74.52%] |
| pre-covid | 3y | 1145 (1145) | 884 (77.2%) | [74.69%, 79.54%] | 22.75/91.5/333.5 | 0.37/0.55/0.71 | 2813 | 11.5% | 2556 (90.9%) | [89.74%, 91.87%] |
| covid | 1y | 590 (590) | 361 (61.2%) | [57.19%, 65.03%] | 12/44/117 | 0.47/0.67/0.79 | 1252 | 14.7% | 900 (71.9%) | [69.33%, 74.31%] |
| covid | 3y | 590 (590) | 447 (75.8%) | [72.15%, 79.05%] | 14.5/66/259.5 | 0.42/0.57/0.71 | 1252 | 14.7% | 1114 (89.0%) | [87.12%, 90.59%] |
| post-2022 | 1y | 379 (379) | 169 (44.6%) | [39.67%, 49.62%] | 16/48/133 | 0.53/0.70/0.81 | 871 | 14.3% | 338 (38.8%) | [35.63%, 42.08%] |
| post-2022 | 3y | 336 (336) | 215 (64.0%) | [58.72%, 68.94%] | 32/185/553.5 | 0.27/0.50/0.69 | 851 | 17.1% | 577 (67.8%) | [64.59%, 70.86%] |

## H4 — do the confidence / divergence / deep-cyclical flags discriminate?

The deep-cyclical stratum (loss in annual[1:4] + positive TTM — the NEM signature) was pre-declared 2026-08-20, before this run.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | confidence=high | 49 | -0.96% | [-7.32%, 5.93%] | 49% | 187 | -3.33% | [-6.07%, -0.32%] | 43% | 0 | 2.38% | **fail** — gap 2.38%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=medium | 386 | -1.57% | [-4.33%, 1.21%] | 47% | 1427 | 0.03% | [-1.13%, 1.26%] | 48% | 0 | -1.60% | **fail** — gap -1.60%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=low | 1839 | -0.43% | [-1.97%, 1.12%] | 45% | 4289 | -1.12% | [-1.93%, -0.37%] | 46% | 1406 | 0.69% | **fail** — gap 0.69%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=true | 151 | -1.84% | [-8.38%, 5.41%] | 41% | 609 | 0.40% | [-1.85%, 2.75%] | 49% | 29 | -2.24% | **fail** — gap -2.24%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=false | 2064 | -0.15% | [-1.58%, 1.13%] | 46% | 4863 | -0.98% | [-1.72%, -0.30%] | 46% | 1377 | 0.83% | **fail** — gap 0.83%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=true | 281 | -3.14% | [-7.34%, 1.37%] | 43% | 694 | -2.61% | [-4.56%, -0.68%] | 45% | 150 | -0.54% | **fail** — gap -0.54%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=false | 1937 | -0.17% | [-1.49%, 1.23%] | 46% | 4545 | -0.59% | [-1.37%, 0.14%] | 47% | 1256 | 0.42% | **fail** — gap 0.42%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=high | 43 | -5.58% | [-10.20%, -1.23%] | 37% | 178 | -5.42% | [-7.33%, -3.53%] | 28% | 0 | -0.16% | **fail** — gap -0.16%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=medium | 371 | -2.76% | [-4.46%, -1.02%] | 40% | 1386 | -1.35% | [-2.32%, -0.35%] | 42% | 0 | -1.40% | **fail** — gap -1.40%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=low | 1807 | -2.24% | [-3.38%, -1.11%] | 39% | 4261 | -1.61% | [-2.29%, -0.88%] | 41% | 1352 | -0.63% | **fail** — gap -0.63%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=true | 144 | -2.37% | [-6.36%, 2.21%] | 39% | 592 | -0.37% | [-2.36%, 1.69%] | 43% | 29 | -2.00% | **fail** — gap -2.00%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=false | 2021 | -2.30% | [-3.26%, -1.20%] | 39% | 4841 | -1.46% | [-2.07%, -0.86%] | 42% | 1323 | -0.85% | **fail** — gap -0.85%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=true | 275 | -2.77% | [-5.97%, 0.67%] | 41% | 689 | -2.08% | [-3.82%, -0.38%] | 41% | 144 | -0.69% | **fail** — gap -0.69%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=false | 1896 | -2.25% | [-3.30%, -1.21%] | 39% | 4524 | -1.29% | [-1.90%, -0.57%] | 42% | 1208 | -0.96% | **fail** — gap -0.96%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=high | 16 | 1.24% | [-5.30%, 7.53%] | 69% | 67 | -2.22% | [-5.84%, 1.50%] | 37% | 0 | 3.46% | **underpowered** — n(below)=16, n(at/above)=67 — below the 30-row verdict floor |
| pre-covid | 1y | confidence=medium | 155 | -0.05% | [-3.62%, 3.46%] | 54% | 673 | 3.58% | [2.00%, 5.18%] | 54% | 0 | -3.63% | **fail** — gap -3.63%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=low | 1029 | 1.65% | [-0.19%, 3.63%] | 49% | 2489 | 0.28% | [-0.68%, 1.27%] | 49% | 713 | 1.37% | **fail** — gap 1.37%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=true | 68 | 2.22% | [-6.08%, 11.11%] | 47% | 293 | 3.35% | [0.18%, 6.73%] | 55% | 9 | -1.12% | **fail** — gap -1.12%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=false | 1118 | 1.64% | [-0.22%, 3.42%] | 50% | 2783 | 0.56% | [-0.33%, 1.45%] | 49% | 704 | 1.08% | **fail** — gap 1.08%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=true | 133 | -0.89% | [-5.93%, 4.48%] | 50% | 382 | 0.04% | [-2.58%, 2.53%] | 51% | 88 | -0.92% | **fail** — gap -0.92%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=false | 1052 | 1.96% | [0.13%, 3.96%] | 50% | 2587 | 0.68% | [-0.17%, 1.66%] | 49% | 625 | 1.27% | **pass** — gap 1.27%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 3y | confidence=high | 16 | -0.58% | [-5.48%, 3.90%] | 63% | 67 | -3.01% | [-5.30%, -0.57%] | 34% | 0 | 2.43% | **underpowered** — n(below)=16, n(at/above)=67 — below the 30-row verdict floor |
| pre-covid | 3y | confidence=medium | 155 | 1.03% | [-1.56%, 3.79%] | 50% | 673 | 2.38% | [1.00%, 3.67%] | 51% | 0 | -1.35% | **fail** — gap -1.35%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=low | 1029 | -2.09% | [-3.49%, -0.67%] | 41% | 2489 | -0.30% | [-1.04%, 0.53%] | 46% | 713 | -1.79% | **fail** — gap -1.79%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=true | 68 | 0.79% | [-4.92%, 6.69%] | 43% | 293 | 2.14% | [-0.66%, 5.03%] | 49% | 9 | -1.35% | **fail** — gap -1.35%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=false | 1118 | -1.86% | [-3.05%, -0.47%] | 42% | 2783 | 0.05% | [-0.64%, 0.82%] | 46% | 704 | -1.91% | **fail** — gap -1.91%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=true | 133 | -0.59% | [-4.83%, 3.75%] | 51% | 382 | -0.51% | [-2.51%, 1.71%] | 48% | 88 | -0.08% | **fail** — gap -0.08%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=false | 1052 | -1.96% | [-3.32%, -0.59%] | 41% | 2587 | 0.23% | [-0.50%, 1.05%] | 46% | 625 | -2.19% | **fail** — gap -2.19%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=high | 17 | 2.94% | [-11.67%, 19.07%] | 53% | 58 | -5.24% | [-10.78%, -0.38%] | 40% | 0 | 8.18% | **underpowered** — n(below)=17, n(at/above)=58 — below the 30-row verdict floor |
| covid | 1y | confidence=medium | 136 | -0.09% | [-5.41%, 5.19%] | 46% | 445 | -1.61% | [-3.96%, 0.76%] | 44% | 0 | 1.52% | **fail** — gap 1.52%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=low | 501 | -0.88% | [-4.16%, 2.73%] | 43% | 1075 | -2.37% | [-4.09%, -0.47%] | 43% | 507 | 1.49% | **fail** — gap 1.49%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=true | 47 | 4.89% | [-10.54%, 21.73%] | 49% | 199 | 0.75% | [-3.50%, 4.95%] | 48% | 11 | 4.14% | **fail** — gap 4.14%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=false | 575 | -0.07% | [-3.00%, 2.89%] | 44% | 1227 | -2.88% | [-4.51%, -1.27%] | 41% | 496 | 2.81% | **fail** — gap 2.81%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=true | 82 | 1.28% | [-8.91%, 12.88%] | 45% | 164 | -4.02% | [-8.85%, 0.85%] | 39% | 31 | 5.30% | **fail** — gap 5.30%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=false | 541 | -0.69% | [-3.39%, 2.20%] | 44% | 1173 | -2.02% | [-3.57%, -0.43%] | 43% | 476 | 1.33% | **fail** — gap 1.33%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=high | 17 | -1.65% | [-8.13%, 5.47%] | 29% | 58 | -6.29% | [-9.81%, -2.68%] | 26% | 0 | 4.64% | **underpowered** — n(below)=17, n(at/above)=58 — below the 30-row verdict floor |
| covid | 3y | confidence=medium | 136 | -2.18% | [-4.68%, 0.64%] | 38% | 445 | -1.40% | [-3.07%, 0.31%] | 41% | 0 | -0.78% | **fail** — gap -0.78%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=low | 501 | 0.29% | [-1.83%, 2.51%] | 41% | 1075 | -1.45% | [-2.68%, -0.20%] | 39% | 507 | 1.74% | **fail** — gap 1.74%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=true | 47 | -5.42% | [-11.17%, 0.93%] | 34% | 199 | -3.28% | [-6.08%, -0.32%] | 36% | 11 | -2.14% | **fail** — gap -2.14%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=false | 575 | 0.25% | [-1.61%, 2.25%] | 41% | 1227 | -1.09% | [-2.24%, 0.10%] | 41% | 496 | 1.34% | **fail** — gap 1.34%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=true | 82 | 1.36% | [-4.75%, 8.12%] | 39% | 164 | -2.52% | [-5.53%, 0.95%] | 37% | 31 | 3.89% | **fail** — gap 3.89%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=false | 541 | -0.04% | [-1.98%, 1.86%] | 40% | 1173 | -1.06% | [-2.25%, 0.13%] | 41% | 476 | 1.02% | **fail** — gap 1.02%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=high | 16 | -7.29% | [-17.50%, 3.72%] | 25% | 62 | -2.75% | [-8.67%, 2.60%] | 53% | 0 | -4.54% | **underpowered** — n(below)=16, n(at/above)=62 — below the 30-row verdict floor |
| post-2022 | 1y | confidence=medium | 95 | -6.15% | [-10.82%, -1.48%] | 38% | 309 | -5.33% | [-7.69%, -2.76%] | 42% | 0 | -0.82% | **fail** — gap -0.82%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=low | 309 | -6.66% | [-9.55%, -3.34%] | 36% | 725 | -4.11% | [-6.02%, -2.03%] | 43% | 186 | -2.55% | **fail** — gap -2.55%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=true | 36 | -18.29% | [-27.39%, -9.63%] | 19% | 117 | -7.54% | [-12.76%, -1.72%] | 38% | 9 | -10.75% | **fail** — gap -10.75%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=false | 371 | -5.64% | [-8.55%, -2.73%] | 38% | 853 | -3.25% | [-5.06%, -1.47%] | 44% | 177 | -2.39% | **fail** — gap -2.39%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=true | 66 | -13.19% | [-19.87%, -6.88%] | 26% | 148 | -7.87% | [-11.47%, -4.13%] | 37% | 31 | -5.32% | **fail** — gap -5.32%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=false | 344 | -5.85% | [-8.65%, -2.97%] | 38% | 785 | -2.67% | [-4.39%, -0.63%] | 46% | 155 | -3.18% | **fail** — gap -3.18%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=high | 10 | -20.25% | [-26.91%, -12.82%] | 10% | 53 | -7.50% | [-11.40%, -3.62%] | 23% | 0 | -12.75% | **underpowered** — n(below)=10, n(at/above)=53 — below the 30-row verdict floor |
| post-2022 | 3y | confidence=medium | 80 | -11.08% | [-14.72%, -7.38%] | 24% | 268 | -10.66% | [-13.08%, -8.12%] | 22% | 0 | -0.42% | **fail** — gap -0.42%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=low | 277 | -7.38% | [-10.07%, -4.33%] | 28% | 697 | -6.56% | [-8.65%, -4.09%] | 28% | 132 | -0.82% | **fail** — gap -0.82%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=true | 29 | -4.81% | [-17.62%, 10.11%] | 38% | 100 | -1.93% | [-8.49%, 5.54%] | 37% | 9 | -2.88% | **underpowered** — n(below)=29, n(at/above)=100 — below the 30-row verdict floor |
| post-2022 | 3y | divergent=false | 328 | -8.30% | [-10.62%, -5.81%] | 27% | 831 | -7.05% | [-8.97%, -5.15%] | 27% | 123 | -1.25% | **fail** — gap -1.25%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=true | 60 | -13.28% | [-19.42%, -6.81%] | 20% | 143 | -5.80% | [-10.20%, -0.46%] | 29% | 25 | -7.48% | **fail** — gap -7.48%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=false | 303 | -7.18% | [-9.90%, -4.41%] | 28% | 764 | -6.77% | [-8.64%, -4.86%] | 28% | 107 | -0.40% | **fail** — gap -0.40%/yr; below-arm CI crosses 0 |

### H4 discrimination verdicts (below-arm vs below-arm)

| Comparison | Regime | Horizon | Gap/yr | Verdict |
|---|---|---|---|---|
| confidence high vs low | pooled | 1y | -0.52% | **decorative** — below-arm gap -0.52%/yr, CIs overlap |
| divergent false vs true | pooled | 1y | 1.69% | **decorative** — below-arm gap 1.69%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 1y | 2.97% | **decorative** — below-arm gap 2.97%/yr, CIs overlap |
| confidence high vs low | pooled | 3y | -3.34% | **decorative** — below-arm gap -3.34%/yr, CIs overlap |
| divergent false vs true | pooled | 3y | 0.06% | **decorative** — below-arm gap 0.06%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 3y | 0.53% | **decorative** — below-arm gap 0.53%/yr, CIs overlap |
| confidence high vs low | pre-covid | 1y | — | **underpowered** — below-arm n: 16 vs 1029 (floor 30) |
| divergent false vs true | pre-covid | 1y | -0.59% | **decorative** — below-arm gap -0.59%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 1y | 2.84% | **decorative** — below-arm gap 2.84%/yr, CIs overlap |
| confidence high vs low | pre-covid | 3y | — | **underpowered** — below-arm n: 16 vs 1029 (floor 30) |
| divergent false vs true | pre-covid | 3y | -2.65% | **decorative** — below-arm gap -2.65%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 3y | -1.38% | **decorative** — below-arm gap -1.38%/yr, CIs overlap |
| confidence high vs low | covid | 1y | — | **underpowered** — below-arm n: 17 vs 501 (floor 30) |
| divergent false vs true | covid | 1y | -4.96% | **decorative** — below-arm gap -4.96%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 1y | -1.97% | **decorative** — below-arm gap -1.97%/yr, CIs overlap |
| confidence high vs low | covid | 3y | — | **underpowered** — below-arm n: 17 vs 501 (floor 30) |
| divergent false vs true | covid | 3y | 5.67% | **decorative** — below-arm gap 5.67%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 3y | -1.40% | **decorative** — below-arm gap -1.40%/yr, CIs overlap |
| confidence high vs low | post-2022 | 1y | — | **underpowered** — below-arm n: 16 vs 309 (floor 30) |
| divergent false vs true | post-2022 | 1y | 12.65% | **discriminating** — below-arm gap 12.65%/yr with disjoint CIs |
| deep-cyclical false vs true | post-2022 | 1y | 7.34% | **decorative** — below-arm gap 7.34%/yr, CIs overlap |
| confidence high vs low | post-2022 | 3y | — | **underpowered** — below-arm n: 10 vs 277 (floor 30) |
| divergent false vs true | post-2022 | 3y | — | **underpowered** — below-arm n: 328 vs 29 (floor 30) |
| deep-cyclical false vs true | post-2022 | 3y | 6.10% | **decorative** — below-arm gap 6.10%/yr, CIs overlap |

## H5 — peer contamination: does predictive power decay with peer premium?

Primary buckets on the SYMMETRIC ratio max(peer/own, own/peer) — the quantity the production 5.0 cliff gates on. The `>= 5.0 (pre-suppression band)` stratum recomputes belowP25 from the full-9 pre-suppression anchors: production's band past the cliff is own-only by construction, so this is the only view of raw contamination there.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | sym [1, 1.5) | 957 | -0.07% | [-1.69%, 1.73%] | 50% | 3512 | -0.91% | [-1.65%, -0.10%] | 46% | 63 | 0.84% | **fail** — gap 0.84%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [1.5, 2.5) | 969 | -0.82% | [-2.76%, 1.18%] | 46% | 2515 | -0.93% | [-1.96%, 0.04%] | 46% | 32 | 0.11% | **fail** — gap 0.11%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [2.5, 5) | 511 | -0.94% | [-3.96%, 2.40%] | 42% | 1153 | -1.22% | [-2.89%, 0.41%] | 48% | 14 | 0.28% | **fail** — gap 0.28%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 | 151 | -1.84% | [-8.45%, 5.23%] | 41% | 609 | 0.40% | [-2.04%, 2.77%] | 49% | 29 | -2.24% | **fail** — gap -2.24%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 (pre-suppression band) | 196 | -1.49% | [-7.16%, 4.29%] | 46% | 556 | 0.93% | [-1.37%, 3.27%] | 50% | 10 | -2.42% | **fail** — gap -2.42%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1, 1.5) | 914 | -1.76% | [-2.96%, -0.50%] | 41% | 3464 | -1.32% | [-2.02%, -0.57%] | 42% | 57 | -0.44% | **fail** — gap -0.44%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1.5, 2.5) | 945 | -2.83% | [-4.25%, -1.44%] | 39% | 2467 | -0.98% | [-1.93%, -0.06%] | 43% | 32 | -1.85% | **fail** — gap -1.85%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [2.5, 5) | 497 | -1.65% | [-4.24%, 1.01%] | 40% | 1131 | -1.58% | [-3.02%, 0.03%] | 37% | 14 | -0.07% | **fail** — gap -0.07%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 | 144 | -2.37% | [-6.41%, 2.07%] | 39% | 592 | -0.37% | [-2.44%, 1.68%] | 43% | 29 | -2.00% | **fail** — gap -2.00%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 (pre-suppression band) | 187 | -1.93% | [-6.06%, 2.24%] | 40% | 541 | -0.04% | [-2.05%, 1.97%] | 43% | 10 | -1.89% | **fail** — gap -1.89%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [1, 1.5) | 551 | 2.13% | [0.09%, 4.18%] | 54% | 2025 | 0.81% | [-0.16%, 1.74%] | 49% | 39 | 1.32% | **pass** — gap 1.32%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | sym [1.5, 2.5) | 518 | 0.44% | [-1.74%, 2.90%] | 50% | 1351 | 0.84% | [-0.51%, 2.16%] | 50% | 20 | -0.40% | **fail** — gap -0.40%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [2.5, 5) | 248 | 1.44% | [-2.80%, 5.89%] | 47% | 567 | 1.32% | [-1.01%, 3.90%] | 53% | 8 | 0.12% | **fail** — gap 0.12%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 | 68 | 2.22% | [-6.38%, 11.42%] | 47% | 293 | 3.35% | [0.19%, 6.72%] | 55% | 9 | -1.12% | **fail** — gap -1.12%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 (pre-suppression band) | 81 | 0.07% | [-7.45%, 7.45%] | 52% | 273 | 3.74% | [0.55%, 7.19%] | 55% | 5 | -3.67% | **fail** — gap -3.67%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1, 1.5) | 551 | -1.08% | [-2.65%, 0.57%] | 44% | 2025 | 0.39% | [-0.43%, 1.22%] | 47% | 39 | -1.47% | **fail** — gap -1.47%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1.5, 2.5) | 518 | -2.47% | [-4.24%, -0.42%] | 40% | 1351 | 0.59% | [-0.52%, 1.84%] | 47% | 20 | -3.06% | **fail** — gap -3.06%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [2.5, 5) | 248 | -0.49% | [-4.29%, 4.04%] | 44% | 567 | -0.29% | [-2.16%, 1.62%] | 41% | 8 | -0.20% | **fail** — gap -0.20%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 | 68 | 0.79% | [-4.77%, 6.64%] | 43% | 293 | 2.14% | [-0.70%, 4.90%] | 49% | 9 | -1.35% | **fail** — gap -1.35%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 (pre-suppression band) | 81 | -1.77% | [-6.78%, 3.48%] | 43% | 273 | 2.66% | [-0.21%, 5.51%] | 49% | 5 | -4.43% | **fail** — gap -4.43%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1, 1.5) | 236 | -0.18% | [-4.59%, 4.10%] | 47% | 873 | -2.41% | [-3.90%, -0.79%] | 43% | 6 | 2.23% | **fail** — gap 2.23%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1.5, 2.5) | 278 | 2.17% | [-2.12%, 6.53%] | 47% | 700 | -0.81% | [-2.74%, 1.12%] | 45% | 8 | 2.98% | **fail** — gap 2.98%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [2.5, 5) | 159 | 0.66% | [-5.35%, 6.69%] | 44% | 356 | -1.96% | [-4.61%, 1.13%] | 44% | 6 | 2.62% | **fail** — gap 2.62%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 | 47 | 4.89% | [-10.39%, 23.05%] | 49% | 199 | 0.75% | [-3.07%, 5.12%] | 48% | 11 | 4.14% | **fail** — gap 4.14%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 (pre-suppression band) | 61 | 4.24% | [-8.38%, 18.17%] | 46% | 180 | 2.13% | [-2.41%, 6.84%] | 50% | 4 | 2.10% | **fail** — gap 2.10%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1, 1.5) | 236 | 0.20% | [-2.02%, 2.61%] | 44% | 873 | -1.14% | [-2.26%, 0.08%] | 41% | 6 | 1.33% | **fail** — gap 1.33%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1.5, 2.5) | 278 | 1.26% | [-1.28%, 4.04%] | 41% | 700 | -0.98% | [-2.28%, 0.41%] | 43% | 8 | 2.24% | **fail** — gap 2.24%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [2.5, 5) | 159 | 1.82% | [-1.50%, 5.72%] | 42% | 356 | -0.64% | [-3.01%, 1.90%] | 37% | 6 | 2.47% | **fail** — gap 2.47%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 | 47 | -5.42% | [-11.25%, 1.12%] | 34% | 199 | -3.28% | [-6.14%, -0.08%] | 36% | 11 | -2.14% | **fail** — gap -2.14%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 (pre-suppression band) | 61 | -3.25% | [-8.14%, 2.04%] | 38% | 180 | -2.31% | [-5.41%, 0.69%] | 38% | 4 | -0.94% | **fail** — gap -0.94%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1, 1.5) | 170 | -7.08% | [-10.55%, -3.56%] | 42% | 614 | -4.46% | [-6.52%, -2.41%] | 41% | 18 | -2.61% | **fail** — gap -2.61%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1.5, 2.5) | 173 | -9.42% | [-13.48%, -5.30%] | 32% | 464 | -6.26% | [-8.82%, -3.95%] | 40% | 4 | -3.16% | **fail** — gap -3.16%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [2.5, 5) | 104 | -9.05% | [-15.92%, -1.56%] | 29% | 230 | -6.34% | [-10.25%, -1.81%] | 41% | 0 | -2.71% | **fail** — gap -2.71%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 | 36 | -18.29% | [-27.78%, -8.79%] | 19% | 117 | -7.54% | [-13.07%, -2.15%] | 38% | 9 | -10.75% | **fail** — gap -10.75%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 (pre-suppression band) | 54 | -10.29% | [-17.27%, -2.37%] | 37% | 103 | -8.60% | [-14.47%, -2.89%] | 35% | 1 | -1.68% | **fail** — gap -1.68%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1, 1.5) | 127 | -8.40% | [-11.89%, -4.55%] | 22% | 566 | -7.74% | [-9.87%, -5.35%] | 25% | 12 | -0.65% | **fail** — gap -0.65%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1.5, 2.5) | 149 | -11.74% | [-15.38%, -7.98%] | 29% | 416 | -6.08% | [-8.78%, -2.87%] | 30% | 4 | -5.66% | **fail** — gap -5.66%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [2.5, 5) | 90 | -10.99% | [-16.43%, -4.92%] | 29% | 208 | -6.68% | [-10.96%, -2.26%] | 29% | 0 | -4.30% | **fail** — gap -4.30%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 | 29 | -4.81% | [-18.40%, 10.88%] | 38% | 100 | -1.93% | [-8.46%, 4.96%] | 37% | 9 | -2.88% | **underpowered** — n(below)=29, n(at/above)=100 — below the 30-row verdict floor |
| post-2022 | 3y | sym >= 5 (pre-suppression band) | 45 | -0.44% | [-11.41%, 13.38%] | 38% | 88 | -3.78% | [-9.43%, 2.50%] | 38% | 1 | 3.34% | **fail** — gap 3.34%/yr; below-arm CI crosses 0 |

### H5 trend verdicts

| Regime | Horizon | Spearman(bucket, gap) | Monotonic decay | Top bucket ≤ 0 | Verdict |
|---|---|---|---|---|---|
| pooled | 1y | -0.800 | no | yes | **no-decay-evidence** |
| pooled | 3y | -0.400 | no | yes | **no-decay-evidence** |
| pre-covid | 1y | -0.800 | no | yes | **no-decay-evidence** |
| pre-covid | 3y | 0.600 | no | yes | **no-decay-evidence** |
| covid | 1y | 0.800 | no | no | **no-decay-evidence** |
| covid | 3y | -0.200 | no | yes | **no-decay-evidence** |
| post-2022 | 1y | -0.800 | no | yes | **no-decay-evidence** |
| post-2022 | 3y | -0.200 | no | yes | **no-decay-evidence** |

### H5 secondary — directed ratio (peer/own), exposing the two sides of the cliff

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | dir [0, 0.4) | 48 | 10.82% | [-2.08%, 26.74%] | 52% | 984 | 0.68% | [-1.18%, 2.61%] | 49% | 29 | 10.14% | **fail** — gap 10.14%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [0.4, 0.67) | 25 | -1.81% | [-12.19%, 9.47%] | 48% | 1557 | -0.40% | [-1.65%, 0.97%] | 47% | 6 | -1.40% | **underpowered** — n(below)=25, n(at/above)=1557 — below the 30-row verdict floor |
| pooled | 1y | dir [0.67, 1.5) | 957 | -0.07% | [-1.71%, 1.64%] | 50% | 3503 | -0.93% | [-1.66%, -0.17%] | 46% | 63 | 0.86% | **fail** — gap 0.86%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [1.5, 2.5) | 949 | -0.83% | [-2.65%, 1.03%] | 46% | 1137 | -1.64% | [-3.10%, -0.27%] | 45% | 26 | 0.82% | **fail** — gap 0.82%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [2.5, 5) | 502 | -1.18% | [-4.32%, 2.37%] | 42% | 399 | -3.12% | [-5.92%, -0.30%] | 47% | 5 | 1.94% | **fail** — gap 1.94%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir >= 5 | 115 | -2.38% | [-10.81%, 7.28%] | 38% | 201 | -3.73% | [-7.61%, -0.10%] | 44% | 9 | 1.35% | **fail** — gap 1.35%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0, 0.4) | 48 | 0.61% | [-7.31%, 9.17%] | 42% | 969 | -0.47% | [-2.05%, 1.27%] | 40% | 29 | 1.08% | **fail** — gap 1.08%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0.4, 0.67) | 23 | -6.44% | [-13.09%, 0.65%] | 30% | 1529 | -0.67% | [-1.80%, 0.56%] | 44% | 6 | -5.77% | **underpowered** — n(below)=23, n(at/above)=1529 — below the 30-row verdict floor |
| pooled | 3y | dir [0.67, 1.5) | 914 | -1.76% | [-3.01%, -0.44%] | 41% | 3454 | -1.33% | [-2.00%, -0.65%] | 42% | 57 | -0.44% | **fail** — gap -0.44%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [1.5, 2.5) | 927 | -2.69% | [-4.13%, -1.15%] | 39% | 1112 | -1.59% | [-2.72%, -0.34%] | 42% | 26 | -1.10% | **fail** — gap -1.10%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [2.5, 5) | 488 | -1.61% | [-4.03%, 1.25%] | 41% | 390 | -3.20% | [-5.35%, -0.76%] | 36% | 5 | 1.59% | **fail** — gap 1.59%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir >= 5 | 108 | -1.96% | [-6.86%, 3.73%] | 39% | 196 | -4.28% | [-7.57%, -0.56%] | 36% | 9 | 2.32% | **fail** — gap 2.32%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0, 0.4) | 30 | 16.21% | [-1.58%, 41.26%] | 57% | 490 | 3.48% | [1.09%, 6.09%] | 56% | 12 | 12.73% | **fail** — gap 12.73%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0.4, 0.67) | 13 | 6.64% | [-6.48%, 20.57%] | 62% | 807 | 1.49% | [-0.21%, 3.23%] | 51% | 3 | 5.16% | **underpowered** — n(below)=13, n(at/above)=807 — below the 30-row verdict floor |
| pre-covid | 1y | dir [0.67, 1.5) | 551 | 2.13% | [0.23%, 4.30%] | 54% | 2017 | 0.79% | [-0.16%, 1.74%] | 49% | 39 | 1.34% | **pass** — gap 1.34%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | dir [1.5, 2.5) | 508 | 0.24% | [-1.80%, 2.56%] | 50% | 623 | -0.29% | [-2.02%, 1.67%] | 49% | 17 | 0.53% | **fail** — gap 0.53%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [2.5, 5) | 244 | 0.70% | [-3.08%, 4.69%] | 46% | 198 | -1.96% | [-6.32%, 2.50%] | 49% | 4 | 2.66% | **fail** — gap 2.66%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir >= 5 | 44 | 2.93% | [-9.38%, 15.18%] | 45% | 92 | -1.50% | [-6.95%, 4.05%] | 47% | 1 | 4.43% | **fail** — gap 4.43%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0, 0.4) | 30 | 4.98% | [-3.63%, 15.50%] | 50% | 490 | 2.13% | [0.18%, 4.26%] | 46% | 12 | 2.86% | **fail** — gap 2.86%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0.4, 0.67) | 13 | -2.93% | [-11.61%, 4.93%] | 46% | 807 | 1.32% | [-0.22%, 2.97%] | 48% | 3 | -4.25% | **underpowered** — n(below)=13, n(at/above)=807 — below the 30-row verdict floor |
| pre-covid | 3y | dir [0.67, 1.5) | 551 | -1.08% | [-2.42%, 0.54%] | 44% | 2017 | 0.38% | [-0.45%, 1.27%] | 47% | 39 | -1.46% | **fail** — gap -1.46%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [1.5, 2.5) | 508 | -2.43% | [-4.20%, -0.39%] | 40% | 623 | -0.67% | [-2.15%, 0.73%] | 45% | 17 | -1.77% | **fail** — gap -1.77%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [2.5, 5) | 244 | -0.76% | [-4.62%, 3.96%] | 43% | 198 | -3.21% | [-6.25%, 0.18%] | 35% | 4 | 2.45% | **fail** — gap 2.45%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir >= 5 | 44 | 1.11% | [-6.23%, 9.02%] | 43% | 92 | -3.73% | [-7.13%, 0.03%] | 40% | 1 | 4.85% | **fail** — gap 4.85%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [0, 0.4) | 11 | 9.47% | [-10.65%, 39.32%] | 55% | 310 | -0.82% | [-4.04%, 2.24%] | 45% | 13 | 10.29% | **underpowered** — n(below)=11, n(at/above)=310 — below the 30-row verdict floor |
| covid | 1y | dir [0.4, 0.67) | 7 | -20.69% | [-34.68%, -3.39%] | 14% | 445 | -0.37% | [-2.82%, 2.31%] | 45% | 2 | -20.32% | **underpowered** — n(below)=7, n(at/above)=445 — below the 30-row verdict floor |
| covid | 1y | dir [0.67, 1.5) | 236 | -0.18% | [-3.96%, 3.83%] | 47% | 872 | -2.43% | [-4.04%, -0.77%] | 43% | 6 | 2.25% | **fail** — gap 2.25%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [1.5, 2.5) | 273 | 2.71% | [-1.83%, 7.17%] | 48% | 325 | -0.85% | [-3.82%, 2.02%] | 45% | 6 | 3.56% | **fail** — gap 3.56%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [2.5, 5) | 158 | 0.74% | [-5.27%, 7.19%] | 44% | 120 | 0.03% | [-5.04%, 5.63%] | 48% | 1 | 0.71% | **fail** — gap 0.71%/yr; below-arm CI crosses 0 |
| covid | 1y | dir >= 5 | 38 | 6.54% | [-10.81%, 28.71%] | 47% | 61 | -1.88% | [-8.77%, 4.97%] | 43% | 3 | 8.42% | **fail** — gap 8.42%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [0, 0.4) | 11 | -2.58% | [-20.21%, 24.26%] | 27% | 310 | -2.53% | [-5.03%, 0.40%] | 33% | 13 | -0.06% | **underpowered** — n(below)=11, n(at/above)=310 — below the 30-row verdict floor |
| covid | 3y | dir [0.4, 0.67) | 7 | -5.73% | [-15.79%, 8.85%] | 14% | 445 | -0.46% | [-2.21%, 1.39%] | 44% | 2 | -5.27% | **underpowered** — n(below)=7, n(at/above)=445 — below the 30-row verdict floor |
| covid | 3y | dir [0.67, 1.5) | 236 | 0.20% | [-2.08%, 2.58%] | 44% | 872 | -1.16% | [-2.35%, 0.01%] | 41% | 6 | 1.35% | **fail** — gap 1.35%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [1.5, 2.5) | 273 | 1.55% | [-1.07%, 4.53%] | 42% | 325 | -1.82% | [-3.60%, 0.19%] | 41% | 6 | 3.36% | **fail** — gap 3.36%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [2.5, 5) | 158 | 1.97% | [-1.47%, 5.64%] | 42% | 120 | 1.90% | [-2.03%, 6.54%] | 47% | 1 | 0.08% | **fail** — gap 0.08%/yr; below-arm CI crosses 0 |
| covid | 3y | dir >= 5 | 38 | -3.55% | [-10.74%, 4.38%] | 37% | 61 | -5.84% | [-9.47%, -2.13%] | 34% | 3 | 2.29% | **fail** — gap 2.29%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [0, 0.4) | 7 | -10.18% | [-29.87%, 13.12%] | 29% | 184 | -4.24% | [-8.81%, 0.62%] | 41% | 4 | -5.94% | **underpowered** — n(below)=7, n(at/above)=184 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.4, 0.67) | 5 | 2.66% | [-18.40%, 25.71%] | 60% | 305 | -5.45% | [-8.46%, -2.33%] | 41% | 1 | 8.11% | **underpowered** — n(below)=5, n(at/above)=305 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.67, 1.5) | 170 | -7.08% | [-10.58%, -3.40%] | 42% | 614 | -4.45% | [-6.55%, -2.43%] | 41% | 18 | -2.63% | **fail** — gap -2.63%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [1.5, 2.5) | 168 | -9.78% | [-13.82%, -5.34%] | 31% | 189 | -7.46% | [-10.70%, -4.26%] | 36% | 3 | -2.32% | **fail** — gap -2.32%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [2.5, 5) | 100 | -8.78% | [-16.06%, -0.18%] | 29% | 81 | -10.60% | [-16.02%, -5.51%] | 37% | 0 | 1.82% | **fail** — gap 1.82%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir >= 5 | 33 | -19.71% | [-28.55%, -10.74%] | 18% | 48 | -10.35% | [-18.80%, -2.20%] | 40% | 5 | -9.37% | **fail** — gap -9.37%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [0, 0.4) | 7 | -13.10% | [-30.26%, 2.59%] | 29% | 169 | -4.23% | [-8.82%, 0.96%] | 35% | 4 | -8.87% | **underpowered** — n(below)=7, n(at/above)=169 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.4, 0.67) | 3 | -23.32% | — | 0% | 277 | -6.82% | [-9.95%, -3.06%] | 30% | 1 | -16.51% | **underpowered** — n(below)=3, n(at/above)=277 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.67, 1.5) | 127 | -8.40% | [-11.70%, -4.61%] | 22% | 565 | -7.71% | [-9.83%, -5.27%] | 25% | 12 | -0.69% | **fail** — gap -0.69%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [1.5, 2.5) | 146 | -11.51% | [-15.04%, -7.47%] | 29% | 164 | -4.66% | [-9.18%, 0.48%] | 27% | 3 | -6.85% | **fail** — gap -6.85%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [2.5, 5) | 86 | -10.59% | [-16.08%, -3.69%] | 30% | 72 | -11.67% | [-15.88%, -6.71%] | 19% | 0 | 1.08% | **fail** — gap 1.08%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir >= 5 | 26 | -4.85% | [-17.97%, 10.93%] | 35% | 43 | -3.23% | [-14.04%, 10.44%] | 30% | 5 | -1.62% | **underpowered** — n(below)=26, n(at/above)=43 — below the 30-row verdict floor |

## H6 — anchor ablation (pooled; regime lens lives in H1)

Variants recompute the band from pre-suppression anchor subsets. Common support = rows where both own-3 and peer-6 bands exist.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | variant=production (common support) | 1970 | -1.08% | [-2.45%, 0.27%] | 46% | 4851 | -1.03% | [-1.73%, -0.23%] | 46% | 0 | -0.05% | **fail** — gap -0.05%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=production (unrestricted) | 2114 | -0.48% | [-1.77%, 0.84%] | 46% | 4936 | -0.93% | [-1.67%, -0.19%] | 46% | 1406 | 0.45% | **fail** — gap 0.45%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (common support) | 1958 | -1.07% | [-2.37%, 0.29%] | 47% | 4821 | -1.03% | [-1.71%, -0.28%] | 46% | 0 | -0.04% | **fail** — gap -0.04%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (unrestricted) | 2099 | -0.48% | [-1.78%, 0.90%] | 47% | 4905 | -0.91% | [-1.65%, -0.19%] | 46% | 1387 | 0.43% | **fail** — gap 0.43%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (common support) | 2055 | -0.34% | [-1.69%, 1.03%] | 46% | 4906 | -1.00% | [-1.73%, -0.30%] | 46% | 0 | 0.66% | **fail** — gap 0.66%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (unrestricted) | 2060 | -0.25% | [-1.57%, 1.21%] | 46% | 4928 | -0.97% | [-1.71%, -0.27%] | 47% | 3993 | 0.71% | **fail** — gap 0.71%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (common support) | 2560 | -1.73% | [-2.71%, -0.71%] | 46% | 4348 | -0.99% | [-1.73%, -0.22%] | 46% | 0 | -0.74% | **fail** — gap -0.74%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (unrestricted) | 2679 | -1.25% | [-2.30%, -0.14%] | 46% | 4416 | -0.87% | [-1.66%, -0.11%] | 46% | 1702 | -0.37% | **fail** — gap -0.37%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (common support) | 1924 | -2.20% | [-3.23%, -1.02%] | 40% | 4829 | -1.55% | [-2.13%, -0.97%] | 42% | 0 | -0.65% | **fail** — gap -0.65%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (unrestricted) | 2071 | -2.28% | [-3.25%, -1.25%] | 39% | 4916 | -1.45% | [-2.04%, -0.83%] | 42% | 1352 | -0.83% | **fail** — gap -0.83%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (common support) | 1914 | -2.14% | [-3.21%, -1.07%] | 40% | 4798 | -1.54% | [-2.15%, -0.93%] | 42% | 0 | -0.60% | **fail** — gap -0.60%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (unrestricted) | 2058 | -2.21% | [-3.24%, -1.07%] | 39% | 4884 | -1.43% | [-2.05%, -0.82%] | 42% | 1333 | -0.78% | **fail** — gap -0.78%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (common support) | 1997 | -1.91% | [-2.97%, -0.76%] | 40% | 4879 | -1.53% | [-2.11%, -0.92%] | 42% | 0 | -0.38% | **fail** — gap -0.38%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (unrestricted) | 2003 | -1.89% | [-2.95%, -0.77%] | 40% | 4901 | -1.49% | [-2.08%, -0.89%] | 42% | 3810 | -0.39% | **fail** — gap -0.39%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (common support) | 2518 | -2.47% | [-3.26%, -1.58%] | 39% | 4329 | -1.50% | [-2.09%, -0.80%] | 42% | 0 | -0.97% | **fail** — gap -0.97%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (unrestricted) | 2639 | -2.41% | [-3.26%, -1.59%] | 39% | 4399 | -1.39% | [-2.03%, -0.73%] | 42% | 1641 | -1.02% | **fail** — gap -1.02%/yr; below-arm CI crosses 0 |

### H6 anchor correlation structure

Pairwise Spearman of row-median-normalized implied prices. Effective anchor count ((Σλ)²/Σλ², non-negative eigenvalues over the active block): **4.81 of 9 active** (9 total). 0 pairs below the min-N floor render as — and enter the eigen step as 0.

| | peerMedianPE | peerMedianEVEBITDA | peerMedianPFCF | ownHistoricalPE | ownHistoricalEVEBITDA | ownHistoricalPFCF | normalizedPE | normalizedEVEBITDA | normalizedPFCF |
|---|---|---|---|---|---|---|---|---|---|
| **peerMedianPE** | 1.00 | -0.19 | -0.39 | 0.03 | -0.31 | -0.38 | 0.28 | -0.27 | -0.30 |
| **peerMedianEVEBITDA** | -0.19 | 1.00 | -0.21 | -0.41 | -0.10 | -0.42 | -0.19 | 0.64 | -0.14 |
| **peerMedianPFCF** | -0.39 | -0.21 | 1.00 | -0.40 | -0.35 | 0.07 | -0.26 | -0.15 | 0.54 |
| **ownHistoricalPE** | 0.03 | -0.41 | -0.40 | 1.00 | 0.57 | 0.40 | -0.36 | -0.44 | -0.32 |
| **ownHistoricalEVEBITDA** | -0.31 | -0.10 | -0.35 | 0.57 | 1.00 | 0.48 | -0.38 | -0.37 | -0.29 |
| **ownHistoricalPFCF** | -0.38 | -0.42 | 0.07 | 0.40 | 0.48 | 1.00 | -0.36 | -0.39 | -0.38 |
| **normalizedPE** | 0.28 | -0.19 | -0.26 | -0.36 | -0.38 | -0.36 | 1.00 | -0.03 | -0.12 |
| **normalizedEVEBITDA** | -0.27 | 0.64 | -0.15 | -0.44 | -0.37 | -0.39 | -0.03 | 1.00 | -0.03 |
| **normalizedPFCF** | -0.30 | -0.14 | 0.54 | -0.32 | -0.29 | -0.38 | -0.12 | -0.03 | 1.00 |

Eigenvalues: 2.90, 2.05, 1.78, 0.86, 0.69, 0.48, 0.21, 0.15, -0.13

---

**Verdict:** H1 pooled 3y: fail (gap -0.83%/yr); H2 3y: fail-economic (avg IC -0.026)
