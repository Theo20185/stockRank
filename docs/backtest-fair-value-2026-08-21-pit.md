# Fair-value backtest (H1–H6) — 2026-08-21 (PIT)

**Snapshot range:** 2011-08-31 → 2023-07-31 · horizons 1y, 3y

**Coverage:** 118466 observations, 549 symbols, 144 snapshot dates. 12533 no-band rows (kept, reported per cell), 0 engine-error rows (excluded, counted here).

## Point-in-time caveats (restated per protocol)

- **Restatement bias** — EDGAR companyfacts returns the latest-filed value per period; filing-lag cutoffs prevent lookahead on unfiled periods, but later restatements of already-visible periods are not masked.
- **Industry membership** — peer cohorts use TODAY's Yahoo industry classification at every historical date. Not reconstructible from existing data (the Wikipedia changes table carries no GICS, EDGAR exposes only the current SIC, and the dated snapshot archive starts 2026-04). Exposure is bounded by the coarse-cohort stress rerun (super-group membership is far stickier than sub-industry) and quantified by the cap-bucket churn figure (that component of cohort assignment IS computed point-in-time).
- **Cap-bucket churn** (the cohort-drift component this harness DOES capture): 23.47% of (symbol, date) rows sit in a different cap bucket at the snapshot than at the run's final date.

**Conventions:** valuation-basis prices vs bands; total-return excess vs SPY; yearly dedup per §3.9.3 in every cell; annualized = cumulative ÷ horizon; verdicts need ≥ 30 deduped rows/arm; pass bar = gap ≥ 1.00%/yr with below-arm CI excluding 0 (§3.11.1 parity). All thresholds frozen before the run.

## H1 — directional: does `price < p25` predict positive forward excess?

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | all | 2397 | -0.63% | [-1.86%, 0.58%] | 46% | 5054 | -0.80% | [-1.48%, -0.07%] | 46% | 6295 | 0.17% | **fail** — gap 0.17%/yr; below-arm CI crosses 0 |
| pooled | 3y | all | 2366 | -1.75% | [-2.61%, -0.84%] | 41% | 5041 | -1.47% | [-2.05%, -0.86%] | 42% | 6238 | -0.28% | **fail** — gap -0.28%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | all | 1367 | 0.69% | [-0.71%, 1.91%] | 50% | 2845 | 0.94% | [0.05%, 1.79%] | 49% | 4253 | -0.26% | **fail** — gap -0.26%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | all | 1367 | -0.87% | [-1.89%, 0.21%] | 44% | 2845 | 0.22% | [-0.53%, 0.97%] | 47% | 4253 | -1.09% | **fail** — gap -1.09%/yr; below-arm CI crosses 0 |
| covid | 1y | all | 689 | -0.22% | [-2.89%, 2.68%] | 44% | 1302 | -2.64% | [-4.22%, -1.06%] | 43% | 1785 | 2.42% | **fail** — gap 2.42%/yr; below-arm CI crosses 0 |
| covid | 3y | all | 689 | -0.32% | [-1.93%, 1.43%] | 40% | 1302 | -1.23% | [-2.35%, -0.10%] | 41% | 1785 | 0.91% | **fail** — gap 0.91%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | all | 341 | -6.76% | [-9.67%, -3.70%] | 36% | 907 | -3.63% | [-5.31%, -1.87%] | 43% | 257 | -3.13% | **fail** — gap -3.13%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | all | 310 | -8.80% | [-11.04%, -6.15%] | 28% | 894 | -7.21% | [-9.00%, -5.33%] | 27% | 200 | -1.59% | **fail** — gap -1.59%/yr; below-arm CI crosses 0 |

### H1 stress — coarse (super-group) cohorts, bounding today's-industry-classification exposure

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | coarse-cohort | 2386 | -0.18% | [-1.32%, 1.02%] | 47% | 5184 | -0.89% | [-1.66%, -0.15%] | 46% | 3484 | 0.71% | **fail** — gap 0.71%/yr; below-arm CI crosses 0 |
| pooled | 3y | coarse-cohort | 2355 | -1.36% | [-2.24%, -0.43%] | 41% | 5174 | -1.55% | [-2.13%, -0.93%] | 41% | 3426 | 0.19% | **fail** — gap 0.19%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | coarse-cohort | 1360 | 1.31% | [-0.12%, 2.78%] | 50% | 2952 | 0.58% | [-0.37%, 1.52%] | 49% | 2290 | 0.73% | **fail** — gap 0.73%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | coarse-cohort | 1360 | -0.84% | [-1.91%, 0.37%] | 43% | 2952 | 0.03% | [-0.71%, 0.68%] | 46% | 2290 | -0.87% | **fail** — gap -0.87%/yr; below-arm CI crosses 0 |
| covid | 1y | coarse-cohort | 674 | -0.06% | [-2.56%, 2.40%] | 46% | 1325 | -2.25% | [-3.77%, -0.69%] | 43% | 947 | 2.19% | **fail** — gap 2.19%/yr; below-arm CI crosses 0 |
| covid | 3y | coarse-cohort | 674 | 0.53% | [-1.23%, 2.45%] | 42% | 1325 | -0.84% | [-1.88%, 0.26%] | 41% | 947 | 1.38% | **fail** — gap 1.38%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | coarse-cohort | 352 | -6.19% | [-9.13%, -3.37%] | 40% | 907 | -3.70% | [-5.45%, -1.90%] | 43% | 247 | -2.49% | **fail** — gap -2.49%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | coarse-cohort | 321 | -7.51% | [-10.16%, -4.41%] | 27% | 897 | -7.76% | [-9.45%, -6.01%] | 27% | 189 | 0.25% | **fail** — gap 0.25%/yr; below-arm CI crosses 0 |

## H2 — monotonic: does `upsideToP25Pct` rank-predict forward excess?

Primary estimator: per-snapshot cross-sectional Spearman (dates with ≥ 10 names), equal-weighted across dates; three gates vs a shuffled-returns null (permutation within date × super-group — same structure preservation as the IC calibration).

| Horizon | Dates (skipped) | avg IC | CI (dates) | null 99th | Gate1 stat | Gate2 econ | Window ICs | Gate3 sign | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1y | 144 (0) | -0.016 | [-3.07%, 0.05%] | 0.014 | pass | FAIL | -0.031 / -0.034 / 0.019 | pass | **fail-economic** |
| 3y | 140 (0) | -0.022 | [-3.41%, -1.05%] | 0.021 | pass | FAIL | -0.042 / -0.058 / 0.034 | pass | **fail-economic** |

Secondary (consistency check): pooled + yearly-deduped Spearman — the estimator family the IC heatmap uses.

| Horizon | n (deduped) | IC | CI |
|---|---|---|---|
| 1y | 5350 | -0.022 | [-4.85%, 0.39%] |
| 3y | 5347 | -0.019 | [-4.89%, 1.09%] |

## H3 — convergence: do below-p25 names actually reach p25?

Weekly-close resolution (±1 week). Control = at-or-above rows required to rise by the treatment arm's median required rise over the same window.

| Regime | Horizon | n<p25 (path) | Converged | CI | Time-to-p25 days (p25/med/p75) | Non-conv terminal price/p25 (p25/med/p75) | Control n | Control target | Control converged | Control CI |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | 2397 (2397) | 1026 (42.8%) | [40.84%, 44.79%] | 17/60.5/167 | 0.34/0.59/0.77 | 5054 | 25.6% | 1932 (38.2%) | [36.90%, 39.58%] |
| pooled | 3y | 2366 (2366) | 1399 (59.1%) | [57.14%, 61.09%] | 31.5/142/405.5 | 0.24/0.48/0.67 | 5041 | 25.8% | 3715 (73.7%) | [72.46%, 74.89%] |
| pre-covid | 1y | 1367 (1367) | 568 (41.6%) | [38.97%, 44.18%] | 18/62.5/170.25 | 0.33/0.58/0.77 | 2845 | 26.2% | 1059 (37.2%) | [35.47%, 39.02%] |
| pre-covid | 3y | 1367 (1367) | 794 (58.1%) | [55.45%, 60.67%] | 32.25/143.5/408 | 0.23/0.48/0.66 | 2845 | 26.2% | 2199 (77.3%) | [75.72%, 78.80%] |
| covid | 1y | 689 (689) | 310 (45.0%) | [41.32%, 48.73%] | 13.25/65/163.5 | 0.32/0.54/0.72 | 1302 | 30.7% | 557 (42.8%) | [40.12%, 45.49%] |
| covid | 3y | 689 (689) | 413 (59.9%) | [56.24%, 63.54%] | 26/122/351 | 0.21/0.46/0.66 | 1302 | 30.7% | 948 (72.8%) | [70.33%, 75.16%] |
| post-2022 | 1y | 341 (341) | 148 (43.4%) | [38.24%, 48.71%] | 17/54/167.5 | 0.49/0.70/0.80 | 907 | 15.6% | 315 (34.7%) | [31.70%, 37.89%] |
| post-2022 | 3y | 310 (310) | 192 (61.9%) | [56.42%, 67.16%] | 42/196/489 | 0.30/0.51/0.72 | 894 | 16.1% | 617 (69.0%) | [65.91%, 71.96%] |

## H4 — do the confidence / divergence / deep-cyclical flags discriminate?

The deep-cyclical stratum (loss in annual[1:4] + positive TTM — the NEM signature) was pre-declared 2026-08-20, before this run.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | confidence=high | 9 | -15.98% | [-31.38%, 2.72%] | 22% | 68 | -2.49% | [-7.60%, 2.36%] | 41% | 0 | -13.49% | **underpowered** — n(below)=9, n(at/above)=68 — below the 30-row verdict floor |
| pooled | 1y | confidence=medium | 181 | 0.47% | [-4.18%, 5.46%] | 43% | 693 | -2.63% | [-4.39%, -0.96%] | 44% | 0 | 3.10% | **fail** — gap 3.10%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=low | 2314 | -0.47% | [-1.76%, 0.67%] | 47% | 4885 | -0.73% | [-1.47%, 0.04%] | 46% | 6295 | 0.26% | **fail** — gap 0.26%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=true | 239 | -1.69% | [-6.54%, 3.02%] | 46% | 588 | 0.09% | [-2.28%, 2.29%] | 49% | 92 | -1.78% | **fail** — gap -1.78%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=false | 2306 | -0.26% | [-1.55%, 1.08%] | 46% | 4995 | -0.81% | [-1.52%, -0.10%] | 46% | 6203 | 0.54% | **fail** — gap 0.54%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=true | 211 | -0.89% | [-7.10%, 5.68%] | 44% | 579 | -3.02% | [-5.56%, -0.44%] | 45% | 319 | 2.13% | **fail** — gap 2.13%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=false | 2293 | -0.31% | [-1.59%, 1.00%] | 47% | 4840 | -0.50% | [-1.27%, 0.21%] | 47% | 5976 | 0.20% | **fail** — gap 0.20%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=high | 7 | -21.69% | [-27.40%, -15.76%] | 0% | 64 | -7.89% | [-11.19%, -4.18%] | 20% | 0 | -13.80% | **underpowered** — n(below)=7, n(at/above)=64 — below the 30-row verdict floor |
| pooled | 3y | confidence=medium | 175 | -4.83% | [-7.47%, -2.00%] | 36% | 673 | -5.76% | [-7.07%, -4.49%] | 30% | 0 | 0.92% | **fail** — gap 0.92%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=low | 2284 | -1.49% | [-2.32%, -0.53%] | 41% | 4866 | -1.25% | [-1.87%, -0.61%] | 42% | 6238 | -0.24% | **fail** — gap -0.24%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=true | 230 | -2.92% | [-6.29%, 0.64%] | 40% | 581 | -0.54% | [-2.62%, 1.57%] | 42% | 92 | -2.38% | **fail** — gap -2.38%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=false | 2277 | -1.66% | [-2.49%, -0.78%] | 41% | 4979 | -1.43% | [-2.02%, -0.81%] | 42% | 6146 | -0.23% | **fail** — gap -0.23%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=true | 208 | -1.33% | [-5.68%, 4.62%] | 41% | 575 | -5.14% | [-7.01%, -3.23%] | 36% | 310 | 3.81% | **fail** — gap 3.81%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=false | 2264 | -1.66% | [-2.61%, -0.72%] | 41% | 4826 | -1.14% | [-1.73%, -0.51%] | 42% | 5928 | -0.51% | **fail** — gap -0.51%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=high | 0 | — | — | — | 5 | -6.31% | [-12.48%, 2.11%] | 20% | 0 | — | **underpowered** — n(below)=0, n(at/above)=5 — below the 30-row verdict floor |
| pre-covid | 1y | confidence=medium | 45 | -5.28% | [-11.29%, 0.58%] | 47% | 195 | 1.04% | [-1.63%, 3.67%] | 47% | 0 | -6.32% | **fail** — gap -6.32%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=low | 1350 | 0.91% | [-0.46%, 2.29%] | 50% | 2815 | 0.96% | [0.10%, 1.89%] | 49% | 4253 | -0.05% | **fail** — gap -0.05%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=true | 108 | -0.72% | [-7.09%, 5.60%] | 47% | 262 | 2.22% | [-0.78%, 5.13%] | 55% | 66 | -2.94% | **fail** — gap -2.94%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=false | 1324 | 0.88% | [-0.44%, 2.24%] | 50% | 2816 | 0.97% | [0.06%, 1.91%] | 49% | 4187 | -0.08% | **fail** — gap -0.08%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=true | 113 | 6.79% | [-2.51%, 19.17%] | 51% | 275 | 1.12% | [-2.66%, 5.32%] | 52% | 233 | 5.67% | **fail** — gap 5.67%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=false | 1311 | 0.65% | [-0.67%, 2.17%] | 50% | 2758 | 1.01% | [0.06%, 2.05%] | 49% | 4020 | -0.37% | **fail** — gap -0.37%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=high | 0 | — | — | — | 5 | -0.83% | [-6.26%, 4.57%] | 40% | 0 | — | **underpowered** — n(below)=0, n(at/above)=5 — below the 30-row verdict floor |
| pre-covid | 3y | confidence=medium | 45 | -5.64% | [-10.10%, -1.27%] | 36% | 195 | -0.81% | [-2.67%, 1.12%] | 43% | 0 | -4.83% | **fail** — gap -4.83%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=low | 1350 | -0.74% | [-1.78%, 0.43%] | 44% | 2815 | 0.23% | [-0.56%, 0.95%] | 47% | 4253 | -0.97% | **fail** — gap -0.97%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=true | 108 | -1.06% | [-5.84%, 4.62%] | 44% | 262 | 1.06% | [-1.86%, 4.25%] | 49% | 66 | -2.12% | **fail** — gap -2.12%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=false | 1324 | -0.82% | [-1.91%, 0.32%] | 44% | 2816 | 0.29% | [-0.44%, 1.06%] | 47% | 4187 | -1.11% | **fail** — gap -1.11%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=true | 113 | 1.68% | [-5.03%, 10.26%] | 45% | 275 | -3.16% | [-5.91%, -0.46%] | 42% | 233 | 4.84% | **fail** — gap 4.84%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=false | 1311 | -0.99% | [-2.09%, 0.14%] | 43% | 2758 | 0.40% | [-0.34%, 1.17%] | 47% | 4020 | -1.39% | **fail** — gap -1.39%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=high | 1 | -25.64% | — | 0% | 14 | -1.35% | [-9.78%, 7.21%] | 43% | 0 | -24.30% | **underpowered** — n(below)=1, n(at/above)=14 — below the 30-row verdict floor |
| covid | 1y | confidence=medium | 63 | 12.95% | [3.12%, 23.71%] | 52% | 234 | -1.65% | [-4.78%, 1.66%] | 45% | 0 | 14.60% | **pass** — gap 14.60%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| covid | 1y | confidence=low | 670 | -0.33% | [-3.16%, 2.84%] | 44% | 1274 | -2.52% | [-4.08%, -0.91%] | 43% | 1785 | 2.19% | **fail** — gap 2.19%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=true | 77 | 4.13% | [-4.03%, 13.80%] | 52% | 204 | 1.17% | [-2.94%, 5.73%] | 49% | 25 | 2.97% | **fail** — gap 2.97%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=false | 660 | 0.45% | [-2.45%, 3.62%] | 43% | 1285 | -2.83% | [-4.38%, -1.37%] | 43% | 1760 | 3.29% | **fail** — gap 3.29%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=true | 53 | -7.66% | [-18.06%, 2.21%] | 43% | 137 | -7.93% | [-13.08%, -2.35%] | 34% | 63 | 0.27% | **fail** — gap 0.27%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=false | 667 | 0.83% | [-2.26%, 3.78%] | 45% | 1262 | -2.00% | [-3.53%, -0.40%] | 44% | 1722 | 2.83% | **fail** — gap 2.83%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=high | 1 | -10.12% | — | 0% | 14 | -0.89% | [-9.01%, 8.83%] | 36% | 0 | -9.23% | **underpowered** — n(below)=1, n(at/above)=14 — below the 30-row verdict floor |
| covid | 3y | confidence=medium | 63 | 1.83% | [-2.67%, 7.16%] | 46% | 234 | -2.69% | [-4.95%, -0.16%] | 34% | 0 | 4.52% | **fail** — gap 4.52%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=low | 670 | -0.26% | [-1.93%, 1.53%] | 40% | 1274 | -1.21% | [-2.38%, -0.08%] | 41% | 1785 | 0.95% | **fail** — gap 0.95%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=true | 77 | -3.44% | [-7.33%, 1.20%] | 36% | 204 | -2.05% | [-5.19%, 1.02%] | 37% | 25 | -1.39% | **fail** — gap -1.39%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=false | 660 | -0.05% | [-1.77%, 1.52%] | 41% | 1285 | -1.10% | [-2.16%, 0.04%] | 41% | 1760 | 1.06% | **fail** — gap 1.06%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=true | 53 | 1.99% | [-5.72%, 11.28%] | 49% | 137 | -5.38% | [-8.72%, -2.13%] | 34% | 63 | 7.37% | **fail** — gap 7.37%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=false | 667 | -0.15% | [-1.70%, 1.62%] | 40% | 1262 | -0.82% | [-1.91%, 0.40%] | 41% | 1722 | 0.67% | **fail** — gap 0.67%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=high | 8 | -14.77% | [-31.32%, 6.40%] | 25% | 49 | -2.43% | [-8.91%, 3.57%] | 43% | 0 | -12.34% | **underpowered** — n(below)=8, n(at/above)=49 — below the 30-row verdict floor |
| post-2022 | 1y | confidence=medium | 73 | -6.75% | [-12.19%, -1.53%] | 33% | 264 | -6.21% | [-8.99%, -3.34%] | 40% | 0 | -0.54% | **fail** — gap -0.54%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=low | 294 | -7.15% | [-9.97%, -3.91%] | 35% | 796 | -3.85% | [-5.62%, -2.03%] | 43% | 257 | -3.30% | **fail** — gap -3.30%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=true | 54 | -11.94% | [-19.33%, -4.56%] | 37% | 122 | -6.28% | [-11.18%, -1.18%] | 38% | 1 | -5.66% | **fail** — gap -5.66%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=false | 322 | -6.46% | [-9.62%, -3.35%] | 35% | 894 | -3.49% | [-5.37%, -1.81%] | 44% | 256 | -2.97% | **fail** — gap -2.97%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=true | 45 | -12.18% | [-20.01%, -3.78%] | 27% | 167 | -5.82% | [-9.78%, -1.83%] | 43% | 23 | -6.36% | **fail** — gap -6.36%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=false | 315 | -6.67% | [-10.00%, -3.45%] | 36% | 820 | -3.31% | [-5.06%, -1.33%] | 44% | 234 | -3.36% | **fail** — gap -3.36%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=high | 6 | -23.62% | [-29.10%, -17.88%] | 0% | 45 | -10.86% | [-14.38%, -6.77%] | 13% | 0 | -12.76% | **underpowered** — n(below)=6, n(at/above)=45 — below the 30-row verdict floor |
| post-2022 | 3y | confidence=medium | 67 | -10.56% | [-14.56%, -6.47%] | 27% | 244 | -12.66% | [-14.57%, -10.69%] | 17% | 0 | 2.10% | **fail** — gap 2.10%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=low | 264 | -8.42% | [-11.19%, -5.38%] | 28% | 777 | -6.65% | [-8.61%, -4.52%] | 28% | 200 | -1.78% | **fail** — gap -1.78%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=true | 45 | -6.48% | [-15.30%, 4.24%] | 33% | 115 | -1.51% | [-7.12%, 5.13%] | 35% | 1 | -4.97% | **fail** — gap -4.97%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=false | 293 | -9.08% | [-11.46%, -6.61%] | 28% | 878 | -7.42% | [-9.13%, -5.63%] | 27% | 199 | -1.67% | **fail** — gap -1.67%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=true | 42 | -13.63% | [-20.06%, -5.35%] | 19% | 163 | -8.27% | [-12.10%, -3.58%] | 28% | 14 | -5.36% | **fail** — gap -5.36%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=false | 286 | -8.25% | [-11.02%, -5.43%] | 28% | 806 | -6.94% | [-8.80%, -5.06%] | 27% | 186 | -1.31% | **fail** — gap -1.31%/yr; below-arm CI crosses 0 |

### H4 discrimination verdicts (below-arm vs below-arm)

| Comparison | Regime | Horizon | Gap/yr | Verdict |
|---|---|---|---|---|
| confidence high vs low | pooled | 1y | — | **underpowered** — below-arm n: 9 vs 2314 (floor 30) |
| divergent false vs true | pooled | 1y | 1.43% | **decorative** — below-arm gap 1.43%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 1y | 0.58% | **decorative** — below-arm gap 0.58%/yr, CIs overlap |
| confidence high vs low | pooled | 3y | — | **underpowered** — below-arm n: 7 vs 2284 (floor 30) |
| divergent false vs true | pooled | 3y | 1.26% | **decorative** — below-arm gap 1.26%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 3y | -0.33% | **decorative** — below-arm gap -0.33%/yr, CIs overlap |
| confidence high vs low | pre-covid | 1y | — | **underpowered** — below-arm n: 0 vs 1350 (floor 30) |
| divergent false vs true | pre-covid | 1y | 1.61% | **decorative** — below-arm gap 1.61%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 1y | -6.14% | **decorative** — below-arm gap -6.14%/yr, CIs overlap |
| confidence high vs low | pre-covid | 3y | — | **underpowered** — below-arm n: 0 vs 1350 (floor 30) |
| divergent false vs true | pre-covid | 3y | 0.24% | **decorative** — below-arm gap 0.24%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 3y | -2.67% | **decorative** — below-arm gap -2.67%/yr, CIs overlap |
| confidence high vs low | covid | 1y | — | **underpowered** — below-arm n: 1 vs 670 (floor 30) |
| divergent false vs true | covid | 1y | -3.68% | **decorative** — below-arm gap -3.68%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 1y | 8.48% | **decorative** — below-arm gap 8.48%/yr, CIs overlap |
| confidence high vs low | covid | 3y | — | **underpowered** — below-arm n: 1 vs 670 (floor 30) |
| divergent false vs true | covid | 3y | 3.40% | **decorative** — below-arm gap 3.40%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 3y | -2.14% | **decorative** — below-arm gap -2.14%/yr, CIs overlap |
| confidence high vs low | post-2022 | 1y | — | **underpowered** — below-arm n: 8 vs 294 (floor 30) |
| divergent false vs true | post-2022 | 1y | 5.49% | **decorative** — below-arm gap 5.49%/yr, CIs overlap |
| deep-cyclical false vs true | post-2022 | 1y | 5.51% | **decorative** — below-arm gap 5.51%/yr, CIs overlap |
| confidence high vs low | post-2022 | 3y | — | **underpowered** — below-arm n: 6 vs 264 (floor 30) |
| divergent false vs true | post-2022 | 3y | -2.60% | **decorative** — below-arm gap -2.60%/yr, CIs overlap |
| deep-cyclical false vs true | post-2022 | 3y | 5.38% | **decorative** — below-arm gap 5.38%/yr, CIs overlap |

## H5 — peer contamination: does predictive power decay with peer premium?

Primary buckets on the SYMMETRIC ratio max(peer/own, own/peer) — the quantity the production 5.0 cliff gates on. The `>= 5.0 (pre-suppression band)` stratum recomputes belowP25 from the full-9 pre-suppression anchors: production's band past the cliff is own-only by construction, so this is the only view of raw contamination there.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | sym [1, 1.5) | 327 | -1.82% | [-5.63%, 2.13%] | 43% | 1595 | -1.60% | [-2.93%, -0.32%] | 44% | 79 | -0.22% | **fail** — gap -0.22%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [1.5, 2.5) | 363 | -2.13% | [-5.29%, 1.44%] | 41% | 1256 | -1.70% | [-3.34%, -0.09%] | 45% | 53 | -0.43% | **fail** — gap -0.43%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [2.5, 5) | 320 | -2.19% | [-6.11%, 2.06%] | 40% | 777 | -1.80% | [-3.91%, 0.35%] | 45% | 29 | -0.39% | **fail** — gap -0.39%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 | 239 | -1.69% | [-6.10%, 2.56%] | 46% | 588 | 0.09% | [-2.33%, 2.32%] | 49% | 92 | -1.78% | **fail** — gap -1.78%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 (pre-suppression band) | 226 | -1.97% | [-6.70%, 3.14%] | 43% | 563 | 0.93% | [-1.53%, 3.19%] | 51% | 81 | -2.91% | **fail** — gap -2.91%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1, 1.5) | 305 | -3.60% | [-6.45%, 0.38%] | 34% | 1570 | -3.81% | [-4.89%, -2.63%] | 35% | 72 | 0.22% | **fail** — gap 0.22%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1.5, 2.5) | 351 | -3.54% | [-6.27%, -0.67%] | 34% | 1228 | -2.82% | [-4.19%, -1.43%] | 37% | 51 | -0.71% | **fail** — gap -0.71%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [2.5, 5) | 307 | -3.55% | [-6.41%, -0.23%] | 37% | 756 | -1.65% | [-3.64%, 0.44%] | 40% | 29 | -1.90% | **fail** — gap -1.90%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 | 230 | -2.92% | [-6.16%, 0.73%] | 40% | 581 | -0.54% | [-2.50%, 1.53%] | 42% | 92 | -2.38% | **fail** — gap -2.38%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 (pre-suppression band) | 220 | -2.49% | [-5.52%, 1.00%] | 38% | 557 | -1.21% | [-3.11%, 0.92%] | 42% | 81 | -1.28% | **fail** — gap -1.28%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [1, 1.5) | 142 | 1.75% | [-3.93%, 9.46%] | 49% | 532 | -0.65% | [-2.76%, 1.51%] | 44% | 69 | 2.40% | **fail** — gap 2.40%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [1.5, 2.5) | 140 | -1.99% | [-7.06%, 3.89%] | 42% | 434 | -0.83% | [-3.41%, 1.86%] | 48% | 39 | -1.15% | **fail** — gap -1.15%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [2.5, 5) | 133 | 0.59% | [-5.60%, 7.98%] | 46% | 286 | -0.27% | [-3.66%, 3.03%] | 48% | 24 | 0.86% | **fail** — gap 0.86%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 | 108 | -0.72% | [-7.03%, 6.03%] | 47% | 262 | 2.22% | [-0.75%, 5.18%] | 55% | 66 | -2.94% | **fail** — gap -2.94%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 (pre-suppression band) | 111 | 0.23% | [-6.42%, 8.00%] | 48% | 250 | 3.33% | [0.09%, 6.81%] | 55% | 60 | -3.11% | **fail** — gap -3.11%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1, 1.5) | 142 | -2.63% | [-7.28%, 4.82%] | 35% | 532 | -1.88% | [-3.56%, -0.22%] | 41% | 69 | -0.76% | **fail** — gap -0.76%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1.5, 2.5) | 140 | -4.49% | [-8.18%, 0.76%] | 31% | 434 | -1.31% | [-3.34%, 0.96%] | 42% | 39 | -3.18% | **fail** — gap -3.18%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [2.5, 5) | 133 | -2.37% | [-6.77%, 3.39%] | 38% | 286 | -0.22% | [-2.97%, 2.78%] | 44% | 24 | -2.15% | **fail** — gap -2.15%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 | 108 | -1.06% | [-5.57%, 3.94%] | 44% | 262 | 1.06% | [-1.82%, 4.03%] | 49% | 66 | -2.12% | **fail** — gap -2.12%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 (pre-suppression band) | 111 | -3.04% | [-7.03%, 1.03%] | 42% | 250 | 1.16% | [-1.77%, 4.30%] | 50% | 60 | -4.21% | **fail** — gap -4.21%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1, 1.5) | 81 | 6.14% | [-1.83%, 14.92%] | 52% | 483 | 0.75% | [-1.79%, 3.38%] | 47% | 0 | 5.39% | **fail** — gap 5.39%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1.5, 2.5) | 97 | 6.14% | [-0.70%, 13.26%] | 54% | 366 | 1.12% | [-2.11%, 4.57%] | 46% | 4 | 5.02% | **fail** — gap 5.02%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [2.5, 5) | 85 | 1.81% | [-6.15%, 9.82%] | 46% | 256 | -1.23% | [-5.32%, 2.94%] | 45% | 5 | 3.04% | **fail** — gap 3.04%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 | 77 | 4.13% | [-4.45%, 13.29%] | 52% | 204 | 1.17% | [-3.10%, 5.33%] | 49% | 25 | 2.97% | **fail** — gap 2.97%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 (pre-suppression band) | 70 | -0.47% | [-9.98%, 9.31%] | 43% | 196 | 2.78% | [-1.32%, 7.19%] | 53% | 20 | -3.26% | **fail** — gap -3.26%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1, 1.5) | 81 | 0.97% | [-2.81%, 5.28%] | 48% | 483 | -1.52% | [-3.11%, 0.06%] | 39% | 0 | 2.50% | **fail** — gap 2.50%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1.5, 2.5) | 97 | 4.64% | [-0.02%, 11.35%] | 46% | 366 | -1.36% | [-3.30%, 0.83%] | 36% | 4 | 5.99% | **fail** — gap 5.99%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [2.5, 5) | 85 | 1.30% | [-2.87%, 5.42%] | 46% | 256 | -0.69% | [-3.61%, 2.62%] | 42% | 5 | 1.98% | **fail** — gap 1.98%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 | 77 | -3.44% | [-7.49%, 1.48%] | 36% | 204 | -2.05% | [-4.89%, 1.12%] | 37% | 25 | -1.39% | **fail** — gap -1.39%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 (pre-suppression band) | 70 | -1.85% | [-6.76%, 3.68%] | 34% | 196 | -2.74% | [-5.73%, 0.32%] | 37% | 20 | 0.89% | **fail** — gap 0.89%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1, 1.5) | 104 | -12.90% | [-17.36%, -8.24%] | 30% | 580 | -4.44% | [-6.44%, -2.40%] | 41% | 10 | -8.46% | **fail** — gap -8.46%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1.5, 2.5) | 126 | -8.66% | [-13.22%, -3.63%] | 30% | 456 | -4.78% | [-7.03%, -2.51%] | 41% | 10 | -3.88% | **fail** — gap -3.88%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [2.5, 5) | 102 | -9.14% | [-15.69%, -0.84%] | 26% | 235 | -4.28% | [-8.00%, -0.18%] | 41% | 0 | -4.87% | **fail** — gap -4.87%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 | 54 | -11.94% | [-19.57%, -4.59%] | 37% | 122 | -6.28% | [-11.55%, -0.81%] | 38% | 1 | -5.66% | **fail** — gap -5.66%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 (pre-suppression band) | 45 | -9.72% | [-17.96%, -1.01%] | 33% | 117 | -7.28% | [-12.65%, -2.13%] | 38% | 1 | -2.44% | **fail** — gap -2.44%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1, 1.5) | 82 | -9.77% | [-14.09%, -5.23%] | 21% | 555 | -7.66% | [-9.78%, -5.36%] | 25% | 3 | -2.11% | **fail** — gap -2.11%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1.5, 2.5) | 114 | -9.31% | [-13.58%, -4.56%] | 28% | 428 | -5.60% | [-8.53%, -2.44%] | 32% | 8 | -3.71% | **fail** — gap -3.71%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [2.5, 5) | 89 | -9.96% | [-14.93%, -3.20%] | 28% | 214 | -4.72% | [-8.68%, -0.14%] | 32% | 0 | -5.25% | **fail** — gap -5.25%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 | 45 | -6.48% | [-15.57%, 4.34%] | 33% | 115 | -1.51% | [-6.99%, 4.53%] | 35% | 1 | -4.97% | **fail** — gap -4.97%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 (pre-suppression band) | 39 | -2.06% | [-11.66%, 8.74%] | 33% | 111 | -3.85% | [-9.18%, 2.27%] | 34% | 1 | 1.78% | **fail** — gap 1.78%/yr; below-arm CI crosses 0 |

### H5 trend verdicts

| Regime | Horizon | Spearman(bucket, gap) | Monotonic decay | Top bucket ≤ 0 | Verdict |
|---|---|---|---|---|---|
| pooled | 1y | -0.800 | no | yes | **no-decay-evidence** |
| pooled | 3y | -1.000 | yes | yes | **supports-shrinkage** |
| pre-covid | 1y | -0.800 | no | yes | **no-decay-evidence** |
| pre-covid | 3y | -0.200 | no | yes | **no-decay-evidence** |
| covid | 1y | -1.000 | yes | no | **no-decay-evidence** |
| covid | 3y | -0.800 | no | yes | **no-decay-evidence** |
| post-2022 | 1y | 0.200 | no | yes | **no-decay-evidence** |
| post-2022 | 3y | -0.800 | no | yes | **no-decay-evidence** |

### H5 secondary — directed ratio (peer/own), exposing the two sides of the cliff

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | dir [0, 0.4) | 68 | 4.99% | [-5.81%, 19.08%] | 50% | 764 | 0.70% | [-1.39%, 3.06%] | 49% | 71 | 4.28% | **fail** — gap 4.28%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [0.4, 0.67) | 11 | 5.10% | [-12.74%, 24.77%] | 45% | 796 | 0.91% | [-1.19%, 2.90%] | 48% | 29 | 4.19% | **underpowered** — n(below)=11, n(at/above)=796 — below the 30-row verdict floor |
| pooled | 1y | dir [0.67, 1.5) | 327 | -1.82% | [-5.59%, 2.15%] | 43% | 1589 | -1.77% | [-2.96%, -0.51%] | 44% | 79 | -0.05% | **fail** — gap -0.05%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [1.5, 2.5) | 354 | -2.52% | [-5.66%, 1.02%] | 41% | 591 | -3.55% | [-5.86%, -1.47%] | 42% | 24 | 1.03% | **fail** — gap 1.03%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [2.5, 5) | 311 | -1.59% | [-5.65%, 3.64%] | 40% | 297 | -5.14% | [-8.24%, -1.94%] | 41% | 6 | 3.55% | **fail** — gap 3.55%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir >= 5 | 181 | -3.03% | [-8.00%, 2.67%] | 45% | 222 | -1.35% | [-5.21%, 2.54%] | 45% | 44 | -1.68% | **fail** — gap -1.68%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0, 0.4) | 66 | -3.60% | [-9.88%, 2.79%] | 42% | 753 | -0.41% | [-2.25%, 1.62%] | 43% | 71 | -3.19% | **fail** — gap -3.19%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0.4, 0.67) | 11 | -7.47% | [-14.95%, 2.13%] | 27% | 776 | -1.89% | [-3.68%, 0.14%] | 39% | 29 | -5.57% | **underpowered** — n(below)=11, n(at/above)=776 — below the 30-row verdict floor |
| pooled | 3y | dir [0.67, 1.5) | 305 | -3.60% | [-6.66%, 0.28%] | 34% | 1563 | -3.87% | [-4.90%, -2.84%] | 35% | 72 | 0.28% | **fail** — gap 0.28%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [1.5, 2.5) | 342 | -3.46% | [-6.06%, -0.48%] | 35% | 580 | -2.94% | [-4.82%, -0.79%] | 34% | 22 | -0.53% | **fail** — gap -0.53%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [2.5, 5) | 299 | -3.11% | [-6.03%, 0.08%] | 38% | 289 | -4.46% | [-7.13%, -1.86%] | 35% | 6 | 1.35% | **fail** — gap 1.35%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir >= 5 | 173 | -2.85% | [-6.73%, 1.38%] | 38% | 220 | -1.82% | [-4.97%, 1.66%] | 38% | 44 | -1.03% | **fail** — gap -1.03%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0, 0.4) | 33 | 5.27% | [-12.50%, 28.05%] | 45% | 310 | 2.25% | [-0.61%, 5.39%] | 53% | 53 | 3.03% | **fail** — gap 3.03%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0.4, 0.67) | 8 | 3.01% | [-17.41%, 25.89%] | 38% | 280 | 2.46% | [-0.82%, 5.89%] | 51% | 20 | 0.55% | **underpowered** — n(below)=8, n(at/above)=280 — below the 30-row verdict floor |
| pre-covid | 1y | dir [0.67, 1.5) | 142 | 1.75% | [-4.10%, 8.72%] | 49% | 530 | -0.92% | [-2.99%, 1.13%] | 44% | 69 | 2.67% | **fail** — gap 2.67%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [1.5, 2.5) | 133 | -2.37% | [-7.84%, 3.50%] | 42% | 195 | -4.32% | [-8.18%, -0.49%] | 45% | 19 | 1.96% | **fail** — gap 1.96%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [2.5, 5) | 130 | 0.95% | [-4.90%, 8.58%] | 46% | 108 | -5.51% | [-10.17%, -0.66%] | 42% | 5 | 6.46% | **fail** — gap 6.46%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir >= 5 | 80 | 0.56% | [-6.89%, 8.55%] | 49% | 103 | 1.29% | [-3.65%, 6.48%] | 50% | 32 | -0.73% | **fail** — gap -0.73%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0, 0.4) | 33 | 0.08% | [-9.05%, 9.30%] | 45% | 310 | 2.56% | [-0.11%, 5.44%] | 50% | 53 | -2.48% | **fail** — gap -2.48%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0.4, 0.67) | 8 | -6.30% | [-16.10%, 5.94%] | 25% | 280 | -0.91% | [-3.63%, 2.04%] | 44% | 20 | -5.39% | **underpowered** — n(below)=8, n(at/above)=280 — below the 30-row verdict floor |
| pre-covid | 3y | dir [0.67, 1.5) | 142 | -2.63% | [-7.70%, 3.76%] | 35% | 530 | -2.04% | [-3.58%, -0.41%] | 41% | 69 | -0.60% | **fail** — gap -0.60%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [1.5, 2.5) | 133 | -4.34% | [-8.43%, 0.29%] | 32% | 195 | -1.42% | [-4.32%, 1.65%] | 39% | 19 | -2.92% | **fail** — gap -2.92%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [2.5, 5) | 130 | -2.25% | [-6.87%, 3.67%] | 38% | 108 | -4.22% | [-7.83%, -0.03%] | 37% | 5 | 1.97% | **fail** — gap 1.97%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir >= 5 | 80 | -1.00% | [-6.48%, 5.01%] | 44% | 103 | -2.34% | [-5.79%, 1.39%] | 45% | 32 | 1.34% | **fail** — gap 1.34%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [0, 0.4) | 20 | 15.36% | [-0.46%, 33.00%] | 60% | 254 | 1.75% | [-2.10%, 5.75%] | 49% | 18 | 13.61% | **underpowered** — n(below)=20, n(at/above)=254 — below the 30-row verdict floor |
| covid | 1y | dir [0.4, 0.67) | 0 | — | — | — | 231 | 4.84% | [0.82%, 9.53%] | 51% | 2 | — | **underpowered** — n(below)=0, n(at/above)=231 — below the 30-row verdict floor |
| covid | 1y | dir [0.67, 1.5) | 81 | 6.14% | [-1.45%, 14.57%] | 52% | 481 | 0.67% | [-1.83%, 3.34%] | 48% | 0 | 5.47% | **fail** — gap 5.47%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [1.5, 2.5) | 97 | 6.14% | [-0.93%, 12.87%] | 54% | 192 | 0.76% | [-3.23%, 4.79%] | 46% | 2 | 5.38% | **fail** — gap 5.38%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [2.5, 5) | 83 | 2.38% | [-5.04%, 11.14%] | 46% | 105 | -1.65% | [-7.36%, 4.98%] | 46% | 1 | 4.03% | **fail** — gap 4.03%/yr; below-arm CI crosses 0 |
| covid | 1y | dir >= 5 | 59 | -0.56% | [-10.53%, 10.01%] | 49% | 79 | -1.94% | [-8.58%, 4.94%] | 42% | 11 | 1.38% | **fail** — gap 1.38%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [0, 0.4) | 20 | 1.79% | [-7.36%, 11.53%] | 50% | 254 | -2.02% | [-4.72%, 0.84%] | 39% | 18 | 3.82% | **underpowered** — n(below)=20, n(at/above)=254 — below the 30-row verdict floor |
| covid | 3y | dir [0.4, 0.67) | 0 | — | — | — | 231 | 0.56% | [-2.53%, 3.90%] | 39% | 2 | — | **underpowered** — n(below)=0, n(at/above)=231 — below the 30-row verdict floor |
| covid | 3y | dir [0.67, 1.5) | 81 | 0.97% | [-2.83%, 5.12%] | 48% | 481 | -1.59% | [-3.10%, 0.09%] | 39% | 0 | 2.57% | **fail** — gap 2.57%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [1.5, 2.5) | 97 | 4.64% | [-0.64%, 10.90%] | 46% | 192 | -1.54% | [-4.27%, 1.18%] | 36% | 2 | 6.18% | **fail** — gap 6.18%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [2.5, 5) | 83 | 1.61% | [-2.50%, 6.14%] | 47% | 105 | -0.38% | [-4.73%, 4.48%] | 40% | 1 | 2.00% | **fail** — gap 2.00%/yr; below-arm CI crosses 0 |
| covid | 3y | dir >= 5 | 59 | -5.50% | [-9.97%, -0.36%] | 31% | 79 | -2.33% | [-6.63%, 2.32%] | 34% | 11 | -3.18% | **fail** — gap -3.18%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [0, 0.4) | 15 | -9.47% | [-24.56%, 5.93%] | 47% | 200 | -3.02% | [-7.52%, 1.80%] | 44% | 0 | -6.45% | **underpowered** — n(below)=15, n(at/above)=200 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.4, 0.67) | 3 | 10.68% | — | 67% | 285 | -3.80% | [-6.88%, -0.28%] | 43% | 7 | 14.48% | **underpowered** — n(below)=3, n(at/above)=285 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.67, 1.5) | 104 | -12.90% | [-17.53%, -8.52%] | 30% | 578 | -4.57% | [-6.72%, -2.62%] | 41% | 10 | -8.33% | **fail** — gap -8.33%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [1.5, 2.5) | 124 | -9.45% | [-14.47%, -4.61%] | 29% | 204 | -6.85% | [-9.94%, -3.58%] | 35% | 3 | -2.59% | **fail** — gap -2.59%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [2.5, 5) | 98 | -8.34% | [-15.89%, -0.38%] | 27% | 84 | -9.03% | [-14.33%, -3.74%] | 33% | 0 | 0.69% | **fail** — gap 0.69%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir >= 5 | 42 | -13.36% | [-21.50%, -5.38%] | 33% | 40 | -7.01% | [-15.06%, 1.33%] | 40% | 1 | -6.35% | **fail** — gap -6.35%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [0, 0.4) | 13 | -21.25% | [-30.57%, -10.57%] | 23% | 189 | -3.11% | [-7.42%, 1.71%] | 35% | 0 | -18.15% | **underpowered** — n(below)=13, n(at/above)=189 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.4, 0.67) | 3 | -10.59% | — | 33% | 265 | -5.07% | [-8.58%, -1.01%] | 34% | 7 | -5.52% | **underpowered** — n(below)=3, n(at/above)=265 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.67, 1.5) | 82 | -9.77% | [-13.79%, -5.32%] | 21% | 552 | -7.62% | [-9.86%, -5.15%] | 25% | 3 | -2.16% | **fail** — gap -2.16%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [1.5, 2.5) | 112 | -9.44% | [-13.54%, -4.69%] | 28% | 193 | -5.85% | [-9.91%, -1.20%] | 27% | 1 | -3.59% | **fail** — gap -3.59%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [2.5, 5) | 86 | -8.97% | [-14.39%, -2.36%] | 29% | 76 | -10.44% | [-15.41%, -4.97%] | 24% | 0 | 1.46% | **fail** — gap 1.46%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir >= 5 | 34 | -2.58% | [-13.72%, 10.49%] | 35% | 38 | 0.64% | [-11.70%, 15.27%] | 29% | 1 | -3.22% | **fail** — gap -3.22%/yr; below-arm CI crosses 0 |

## H6 — anchor ablation (pooled; regime lens lives in H1)

Variants recompute the band from pre-suppression anchor subsets. Common support = rows where both own-3 and peer-6 bands exist.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | variant=production (common support) | 1547 | -1.25% | [-2.68%, 0.24%] | 46% | 3875 | -0.81% | [-1.61%, 0.03%] | 46% | 0 | -0.44% | **fail** — gap -0.44%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=production (unrestricted) | 2397 | -0.63% | [-1.80%, 0.61%] | 46% | 5054 | -0.80% | [-1.52%, -0.09%] | 46% | 6295 | 0.17% | **fail** — gap 0.17%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (common support) | 1512 | -1.22% | [-2.70%, 0.28%] | 45% | 3842 | -0.74% | [-1.60%, 0.09%] | 47% | 0 | -0.48% | **fail** — gap -0.48%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (unrestricted) | 2362 | -0.55% | [-1.79%, 0.71%] | 46% | 5030 | -0.70% | [-1.41%, 0.01%] | 47% | 6284 | 0.15% | **fail** — gap 0.15%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (common support) | 2169 | -0.91% | [-2.15%, 0.47%] | 45% | 3649 | -0.88% | [-1.66%, -0.09%] | 47% | 0 | -0.03% | **fail** — gap -0.03%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (unrestricted) | 2246 | -1.00% | [-2.34%, 0.30%] | 45% | 3739 | -1.03% | [-1.83%, -0.18%] | 47% | 26809 | 0.03% | **fail** — gap 0.03%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (common support) | 1876 | -1.31% | [-2.55%, 0.02%] | 45% | 3533 | -0.41% | [-1.29%, 0.49%] | 47% | 0 | -0.90% | **fail** — gap -0.90%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (unrestricted) | 2591 | -0.37% | [-1.46%, 0.85%] | 46% | 4728 | -0.36% | [-1.19%, 0.35%] | 47% | 7676 | -0.02% | **fail** — gap -0.02%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (common support) | 1519 | -2.40% | [-3.47%, -1.28%] | 40% | 3859 | -1.97% | [-2.63%, -1.22%] | 41% | 0 | -0.43% | **fail** — gap -0.43%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (unrestricted) | 2366 | -1.75% | [-2.65%, -0.91%] | 41% | 5041 | -1.47% | [-2.07%, -0.82%] | 42% | 6238 | -0.28% | **fail** — gap -0.28%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (common support) | 1488 | -2.45% | [-3.56%, -1.41%] | 39% | 3827 | -1.94% | [-2.66%, -1.20%] | 41% | 0 | -0.51% | **fail** — gap -0.51%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (unrestricted) | 2335 | -1.72% | [-2.63%, -0.80%] | 41% | 5018 | -1.42% | [-1.97%, -0.82%] | 42% | 6227 | -0.30% | **fail** — gap -0.30%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (common support) | 2132 | -2.64% | [-3.60%, -1.61%] | 38% | 3631 | -1.98% | [-2.69%, -1.30%] | 41% | 0 | -0.66% | **fail** — gap -0.66%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (unrestricted) | 2209 | -2.60% | [-3.65%, -1.61%] | 39% | 3722 | -2.01% | [-2.69%, -1.33%] | 41% | 26566 | -0.58% | **fail** — gap -0.58%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (common support) | 1849 | -1.95% | [-2.89%, -1.01%] | 40% | 3517 | -1.81% | [-2.58%, -1.10%] | 41% | 0 | -0.14% | **fail** — gap -0.14%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (unrestricted) | 2561 | -1.44% | [-2.25%, -0.64%] | 41% | 4715 | -1.25% | [-1.84%, -0.57%] | 42% | 7608 | -0.19% | **fail** — gap -0.19%/yr; below-arm CI crosses 0 |

### H6 anchor correlation structure

Pairwise Spearman of row-median-normalized implied prices. Effective anchor count ((Σλ)²/Σλ², non-negative eigenvalues over the active block): **4.95 of 9 active** (9 total). 0 pairs below the min-N floor render as — and enter the eigen step as 0.

| | peerMedianPE | peerMedianEVEBITDA | peerMedianPFCF | ownHistoricalPE | ownHistoricalEVEBITDA | ownHistoricalPFCF | normalizedPE | normalizedEVEBITDA | normalizedPFCF |
|---|---|---|---|---|---|---|---|---|---|
| **peerMedianPE** | 1.00 | -0.30 | -0.38 | -0.06 | -0.37 | -0.35 | 0.46 | -0.29 | -0.36 |
| **peerMedianEVEBITDA** | -0.30 | 1.00 | -0.10 | -0.39 | -0.10 | -0.41 | -0.21 | 0.63 | -0.05 |
| **peerMedianPFCF** | -0.38 | -0.10 | 1.00 | -0.40 | -0.41 | -0.05 | -0.29 | -0.17 | 0.54 |
| **ownHistoricalPE** | -0.06 | -0.39 | -0.40 | 1.00 | 0.46 | 0.30 | -0.36 | -0.41 | -0.26 |
| **ownHistoricalEVEBITDA** | -0.37 | -0.10 | -0.41 | 0.46 | 1.00 | 0.43 | -0.38 | -0.42 | -0.30 |
| **ownHistoricalPFCF** | -0.35 | -0.41 | -0.05 | 0.30 | 0.43 | 1.00 | -0.25 | -0.37 | -0.39 |
| **normalizedPE** | 0.46 | -0.21 | -0.29 | -0.36 | -0.38 | -0.25 | 1.00 | -0.09 | -0.27 |
| **normalizedEVEBITDA** | -0.29 | 0.63 | -0.17 | -0.41 | -0.42 | -0.37 | -0.09 | 1.00 | -0.02 |
| **normalizedPFCF** | -0.36 | -0.05 | 0.54 | -0.26 | -0.30 | -0.39 | -0.27 | -0.02 | 1.00 |

Eigenvalues: 2.78, 2.19, 1.76, 0.92, 0.61, 0.52, 0.29, 0.16, -0.23

---

**Verdict:** H1 pooled 3y: fail (gap -0.28%/yr); H2 3y: fail-economic (avg IC -0.022)
