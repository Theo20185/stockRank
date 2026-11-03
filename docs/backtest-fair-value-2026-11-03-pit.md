# Fair-value backtest (H1–H6) — 2026-11-03 (PIT)

**Snapshot range:** 2011-11-30 → 2023-10-31 · horizons 1y, 3y

**Coverage:** 115888 observations, 546 symbols, 144 snapshot dates. 2095 no-band rows (kept, reported per cell), 0 engine-error rows (excluded, counted here).

## Point-in-time caveats (restated per protocol)

- **Restatement bias** — EDGAR companyfacts returns the latest-filed value per period; filing-lag cutoffs prevent lookahead on unfiled periods, but later restatements of already-visible periods are not masked.
- **Industry membership** — peer cohorts use TODAY's Yahoo industry classification at every historical date. Not reconstructible from existing data (the Wikipedia changes table carries no GICS, EDGAR exposes only the current SIC, and the dated snapshot archive starts 2026-04). Exposure is bounded by the coarse-cohort stress rerun (super-group membership is far stickier than sub-industry) and quantified by the cap-bucket churn figure (that component of cohort assignment IS computed point-in-time).
- **Cap-bucket churn** (the cohort-drift component this harness DOES capture): 20.55% of (symbol, date) rows sit in a different cap bucket at the snapshot than at the run's final date.

**Conventions:** valuation-basis prices vs bands; total-return excess vs SPY; yearly dedup per §3.9.3 in every cell; annualized = cumulative ÷ horizon; verdicts need ≥ 30 deduped rows/arm; pass bar = gap ≥ 1.00%/yr with below-arm CI excluding 0 (§3.11.1 parity). All thresholds frozen before the run.

## H1 — directional: does `price < p25` predict positive forward excess?

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | all | 1848 | 0.31% | [-1.21%, 1.71%] | 48% | 5076 | -0.73% | [-1.39%, -0.01%] | 47% | 1079 | 1.04% | **fail** — gap 1.04%/yr; below-arm CI crosses 0 |
| pooled | 3y | all | 1793 | -2.28% | [-3.27%, -1.16%] | 40% | 5056 | -1.44% | [-2.00%, -0.76%] | 42% | 1016 | -0.84% | **fail** — gap -0.84%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | all | 939 | 2.31% | [0.27%, 4.37%] | 52% | 2890 | 0.93% | [0.04%, 1.83%] | 50% | 557 | 1.38% | **pass** — gap 1.38%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 3y | all | 939 | -1.98% | [-3.39%, -0.60%] | 42% | 2890 | 0.21% | [-0.49%, 0.87%] | 47% | 557 | -2.19% | **fail** — gap -2.19%/yr; below-arm CI crosses 0 |
| covid | 1y | all | 534 | 1.25% | [-1.89%, 4.44%] | 47% | 1293 | -2.67% | [-4.20%, -1.17%] | 42% | 355 | 3.92% | **fail** — gap 3.92%/yr; below-arm CI crosses 0 |
| covid | 3y | all | 534 | 0.20% | [-1.70%, 2.15%] | 42% | 1293 | -1.34% | [-2.41%, -0.27%] | 41% | 355 | 1.55% | **fail** — gap 1.55%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | all | 375 | -6.05% | [-8.87%, -3.35%] | 39% | 893 | -3.32% | [-5.05%, -1.62%] | 44% | 167 | -2.73% | **fail** — gap -2.73%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | all | 320 | -7.28% | [-10.13%, -4.13%] | 28% | 873 | -7.04% | [-8.82%, -5.30%] | 27% | 104 | -0.24% | **fail** — gap -0.24%/yr; below-arm CI crosses 0 |

### H1 stress — coarse (super-group) cohorts, bounding today's-industry-classification exposure

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | coarse-cohort | 1864 | 0.03% | [-1.30%, 1.53%] | 46% | 5067 | -0.55% | [-1.23%, 0.19%] | 47% | 952 | 0.58% | **fail** — gap 0.58%/yr; below-arm CI crosses 0 |
| pooled | 3y | coarse-cohort | 1814 | -2.69% | [-3.69%, -1.59%] | 39% | 5048 | -1.46% | [-2.02%, -0.88%] | 42% | 893 | -1.23% | **fail** — gap -1.23%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | coarse-cohort | 964 | 1.72% | [-0.11%, 3.71%] | 48% | 2899 | 0.90% | [0.03%, 1.82%] | 50% | 540 | 0.82% | **fail** — gap 0.82%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | coarse-cohort | 964 | -3.19% | [-4.53%, -1.92%] | 40% | 2899 | 0.15% | [-0.58%, 0.87%] | 46% | 540 | -3.34% | **fail** — gap -3.34%/yr; below-arm CI crosses 0 |
| covid | 1y | coarse-cohort | 543 | 0.42% | [-2.49%, 3.63%] | 46% | 1273 | -1.94% | [-3.53%, -0.34%] | 43% | 255 | 2.37% | **fail** — gap 2.37%/yr; below-arm CI crosses 0 |
| covid | 3y | coarse-cohort | 543 | 0.10% | [-1.74%, 2.12%] | 43% | 1273 | -1.04% | [-2.08%, 0.16%] | 41% | 255 | 1.14% | **fail** — gap 1.14%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | coarse-cohort | 357 | -5.13% | [-8.16%, -2.19%] | 42% | 895 | -3.28% | [-5.02%, -1.39%] | 44% | 157 | -1.85% | **fail** — gap -1.85%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | coarse-cohort | 307 | -6.05% | [-9.29%, -2.29%] | 29% | 876 | -7.39% | [-9.23%, -5.53%] | 27% | 98 | 1.34% | **fail** — gap 1.34%/yr; below-arm CI crosses 0 |

## H2 — monotonic: does `upsideToP25Pct` rank-predict forward excess?

Primary estimator: per-snapshot cross-sectional Spearman (dates with ≥ 10 names), equal-weighted across dates; three gates vs a shuffled-returns null (permutation within date × super-group — same structure preservation as the IC calibration).

| Horizon | Dates (skipped) | avg IC | CI (dates) | null 99th | Gate1 stat | Gate2 econ | Window ICs | Gate3 sign | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1y | 144 (0) | -0.004 | [-2.17%, 1.51%] | 0.018 | FAIL | FAIL | -0.005 / -0.031 / 0.024 | pass | **fail-statistical** |
| 3y | 137 (0) | -0.028 | [-4.50%, -1.00%] | 0.015 | pass | FAIL | 0.003 / -0.130 / 0.043 | FAIL | **fail-economic** |

Secondary (consistency check): pooled + yearly-deduped Spearman — the estimator family the IC heatmap uses.

| Horizon | n (deduped) | IC | CI |
|---|---|---|---|
| 1y | 5374 | -0.000 | [-2.92%, 2.74%] |
| 3y | 5367 | -0.019 | [-4.72%, 0.95%] |

## H3 — convergence: do below-p25 names actually reach p25?

Weekly-close resolution (±1 week). Control = at-or-above rows required to rise by the treatment arm's median required rise over the same window.

| Regime | Horizon | n<p25 (path) | Converged | CI | Time-to-p25 days (p25/med/p75) | Non-conv terminal price/p25 (p25/med/p75) | Control n | Control target | Control converged | Control CI |
|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | 1848 (1848) | 1159 (62.7%) | [60.49%, 64.89%] | 12/43/115.5 | 0.53/0.70/0.81 | 5076 | 11.0% | 3602 (71.0%) | [69.70%, 72.19%] |
| pooled | 3y | 1793 (1793) | 1395 (77.8%) | [75.82%, 79.67%] | 17/70/297 | 0.40/0.55/0.70 | 5056 | 11.2% | 4506 (89.1%) | [88.23%, 89.95%] |
| pre-covid | 1y | 939 (939) | 603 (64.2%) | [61.10%, 67.22%] | 15/47/130.5 | 0.54/0.70/0.82 | 2890 | 9.7% | 2273 (78.7%) | [77.12%, 80.11%] |
| pre-covid | 3y | 939 (939) | 732 (78.0%) | [75.19%, 80.49%] | 20/74.5/248.25 | 0.41/0.57/0.72 | 2890 | 9.7% | 2675 (92.6%) | [91.55%, 93.46%] |
| covid | 1y | 534 (534) | 355 (66.5%) | [62.37%, 70.35%] | 9/38/97 | 0.53/0.69/0.82 | 1293 | 13.3% | 954 (73.8%) | [71.32%, 76.11%] |
| covid | 3y | 534 (534) | 443 (83.0%) | [79.54%, 85.91%] | 13.5/65/301 | 0.41/0.53/0.69 | 1293 | 13.3% | 1158 (89.6%) | [87.77%, 91.11%] |
| post-2022 | 1y | 375 (375) | 201 (53.6%) | [48.54%, 58.59%] | 13/37/108 | 0.52/0.70/0.81 | 893 | 11.5% | 415 (46.5%) | [43.22%, 49.75%] |
| post-2022 | 3y | 320 (320) | 220 (68.8%) | [63.47%, 73.58%] | 21/76.5/433 | 0.35/0.51/0.68 | 873 | 13.4% | 648 (74.2%) | [71.22%, 77.02%] |

## H4 — do the confidence / divergence / deep-cyclical flags discriminate?

The deep-cyclical stratum (loss in annual[1:4] + positive TTM — the NEM signature) was pre-declared 2026-08-20, before this run.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | confidence=high | 75 | -4.10% | [-9.31%, 0.92%] | 45% | 274 | -3.32% | [-5.74%, -0.84%] | 45% | 0 | -0.78% | **fail** — gap -0.78%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=medium | 539 | 0.21% | [-2.02%, 2.72%] | 49% | 2014 | -0.51% | [-1.62%, 0.62%] | 48% | 0 | 0.72% | **fail** — gap 0.72%/yr; below-arm CI crosses 0 |
| pooled | 1y | confidence=low | 1429 | 0.44% | [-1.27%, 2.12%] | 47% | 4079 | -0.80% | [-1.61%, 0.05%] | 47% | 1079 | 1.24% | **fail** — gap 1.24%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=true | 152 | -2.75% | [-9.56%, 4.67%] | 39% | 609 | 0.77% | [-1.39%, 3.04%] | 50% | 18 | -3.52% | **fail** — gap -3.52%/yr; below-arm CI crosses 0 |
| pooled | 1y | divergent=false | 1799 | 0.78% | [-0.75%, 2.35%] | 48% | 5023 | -0.76% | [-1.44%, -0.04%] | 47% | 1061 | 1.54% | **fail** — gap 1.54%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=true | 258 | -0.43% | [-5.65%, 4.66%] | 43% | 743 | -2.24% | [-4.13%, -0.25%] | 46% | 55 | 1.81% | **fail** — gap 1.81%/yr; below-arm CI crosses 0 |
| pooled | 1y | deep-cyclical=false | 1672 | 0.42% | [-1.17%, 2.05%] | 48% | 4688 | -0.42% | [-1.18%, 0.22%] | 47% | 1024 | 0.84% | **fail** — gap 0.84%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=high | 66 | -4.38% | [-7.30%, -1.10%] | 38% | 263 | -5.98% | [-7.26%, -4.60%] | 28% | 0 | 1.60% | **fail** — gap 1.60%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=medium | 524 | -3.40% | [-5.11%, -1.33%] | 38% | 1969 | -1.52% | [-2.43%, -0.62%] | 41% | 0 | -1.89% | **fail** — gap -1.89%/yr; below-arm CI crosses 0 |
| pooled | 3y | confidence=low | 1384 | -2.25% | [-3.38%, -0.95%] | 40% | 4036 | -1.52% | [-2.21%, -0.75%] | 42% | 1016 | -0.74% | **fail** — gap -0.74%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=true | 143 | -2.02% | [-6.58%, 3.25%] | 39% | 593 | -0.13% | [-2.03%, 1.81%] | 43% | 18 | -1.89% | **fail** — gap -1.89%/yr; below-arm CI crosses 0 |
| pooled | 3y | divergent=false | 1744 | -2.17% | [-3.24%, -0.99%] | 40% | 5001 | -1.47% | [-2.09%, -0.88%] | 42% | 998 | -0.70% | **fail** — gap -0.70%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=true | 253 | -2.28% | [-5.80%, 1.61%] | 39% | 738 | -1.71% | [-3.34%, 0.11%] | 41% | 48 | -0.57% | **fail** — gap -0.57%/yr; below-arm CI crosses 0 |
| pooled | 3y | deep-cyclical=false | 1619 | -2.37% | [-3.52%, -1.17%] | 39% | 4666 | -1.39% | [-2.01%, -0.80%] | 42% | 968 | -0.98% | **fail** — gap -0.98%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=high | 34 | 0.83% | [-4.82%, 6.10%] | 62% | 105 | -1.72% | [-4.55%, 1.22%] | 44% | 0 | 2.56% | **fail** — gap 2.56%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=medium | 229 | 2.89% | [-0.52%, 6.31%] | 55% | 1020 | 2.66% | [1.12%, 4.26%] | 52% | 0 | 0.22% | **fail** — gap 0.22%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | confidence=low | 755 | 1.88% | [-0.31%, 4.19%] | 50% | 2365 | 0.65% | [-0.34%, 1.66%] | 49% | 557 | 1.23% | **fail** — gap 1.23%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=true | 61 | -0.47% | [-9.88%, 9.18%] | 43% | 287 | 4.44% | [1.33%, 7.67%] | 58% | 9 | -4.91% | **fail** — gap -4.91%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | divergent=false | 916 | 2.78% | [0.87%, 4.78%] | 52% | 2867 | 0.88% | [-0.01%, 1.78%] | 50% | 548 | 1.91% | **pass** — gap 1.91%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | deep-cyclical=true | 122 | 0.05% | [-6.40%, 6.54%] | 48% | 401 | 0.31% | [-2.07%, 2.91%] | 51% | 34 | -0.26% | **fail** — gap -0.26%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | deep-cyclical=false | 848 | 2.89% | [0.87%, 5.05%] | 52% | 2671 | 0.95% | [0.08%, 1.86%] | 50% | 523 | 1.95% | **pass** — gap 1.95%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 3y | confidence=high | 34 | -2.09% | [-4.92%, 0.70%] | 44% | 105 | -2.18% | [-3.90%, -0.44%] | 40% | 0 | 0.09% | **fail** — gap 0.09%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=medium | 229 | 0.55% | [-2.76%, 4.72%] | 45% | 1020 | 1.81% | [0.70%, 3.14%] | 50% | 0 | -1.27% | **fail** — gap -1.27%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | confidence=low | 755 | -3.18% | [-4.53%, -1.72%] | 40% | 2365 | -0.27% | [-1.04%, 0.60%] | 46% | 557 | -2.91% | **fail** — gap -2.91%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=true | 61 | -2.68% | [-9.10%, 4.60%] | 39% | 287 | 1.86% | [-1.05%, 4.77%] | 48% | 9 | -4.54% | **fail** — gap -4.54%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | divergent=false | 916 | -1.90% | [-3.30%, -0.37%] | 42% | 2867 | 0.10% | [-0.64%, 0.91%] | 47% | 548 | -2.00% | **fail** — gap -2.00%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=true | 122 | -2.67% | [-7.26%, 2.31%] | 45% | 401 | 0.03% | [-2.01%, 2.38%] | 48% | 34 | -2.71% | **fail** — gap -2.71%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | deep-cyclical=false | 848 | -2.10% | [-3.41%, -0.63%] | 41% | 2671 | 0.15% | [-0.59%, 0.92%] | 46% | 523 | -2.25% | **fail** — gap -2.25%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=high | 18 | -4.43% | [-16.75%, 9.91%] | 39% | 89 | -5.03% | [-9.60%, -0.23%] | 40% | 0 | 0.60% | **underpowered** — n(below)=18, n(at/above)=89 — below the 30-row verdict floor |
| covid | 1y | confidence=medium | 178 | 2.13% | [-2.21%, 7.37%] | 49% | 593 | -2.66% | [-4.75%, -0.72%] | 43% | 0 | 4.79% | **fail** — gap 4.79%/yr; below-arm CI crosses 0 |
| covid | 1y | confidence=low | 404 | 1.95% | [-2.12%, 5.86%] | 47% | 1017 | -1.82% | [-3.59%, 0.13%] | 44% | 355 | 3.77% | **fail** — gap 3.77%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=true | 48 | 4.30% | [-10.42%, 22.64%] | 44% | 204 | 1.20% | [-2.55%, 5.31%] | 49% | 9 | 3.10% | **fail** — gap 3.10%/yr; below-arm CI crosses 0 |
| covid | 1y | divergent=false | 517 | 1.81% | [-1.41%, 5.04%] | 47% | 1278 | -2.83% | [-4.46%, -1.17%] | 42% | 346 | 4.64% | **fail** — gap 4.64%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=true | 73 | 9.39% | [-1.94%, 21.35%] | 51% | 186 | -5.22% | [-9.63%, -0.95%] | 40% | 12 | 14.61% | **fail** — gap 14.61%/yr; below-arm CI crosses 0 |
| covid | 1y | deep-cyclical=false | 486 | 0.54% | [-2.38%, 3.68%] | 47% | 1207 | -1.99% | [-3.55%, -0.30%] | 43% | 343 | 2.53% | **fail** — gap 2.53%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=high | 18 | -1.73% | [-8.21%, 5.96%] | 39% | 89 | -7.94% | [-10.08%, -5.56%] | 21% | 0 | 6.21% | **underpowered** — n(below)=18, n(at/above)=89 — below the 30-row verdict floor |
| covid | 3y | confidence=medium | 178 | -2.73% | [-4.69%, -0.70%] | 39% | 593 | -1.74% | [-3.04%, -0.16%] | 40% | 0 | -0.99% | **fail** — gap -0.99%/yr; below-arm CI crosses 0 |
| covid | 3y | confidence=low | 404 | 1.38% | [-1.00%, 3.99%] | 43% | 1017 | -1.39% | [-2.60%, -0.03%] | 41% | 355 | 2.77% | **fail** — gap 2.77%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=true | 48 | -3.03% | [-9.26%, 3.99%] | 38% | 204 | -2.56% | [-5.32%, 0.33%] | 38% | 9 | -0.47% | **fail** — gap -0.47%/yr; below-arm CI crosses 0 |
| covid | 3y | divergent=false | 517 | 0.63% | [-1.30%, 2.59%] | 43% | 1278 | -1.13% | [-2.27%, 0.05%] | 41% | 346 | 1.76% | **fail** — gap 1.76%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=true | 73 | 5.65% | [-2.05%, 13.89%] | 42% | 186 | -2.57% | [-5.44%, 0.64%] | 35% | 12 | 8.22% | **fail** — gap 8.22%/yr; below-arm CI crosses 0 |
| covid | 3y | deep-cyclical=false | 486 | -0.20% | [-2.21%, 1.69%] | 42% | 1207 | -1.25% | [-2.30%, -0.08%] | 41% | 343 | 1.05% | **fail** — gap 1.05%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=high | 23 | -11.12% | [-20.31%, -1.24%] | 26% | 80 | -3.52% | [-8.47%, 1.28%] | 50% | 0 | -7.61% | **underpowered** — n(below)=23, n(at/above)=80 — below the 30-row verdict floor |
| post-2022 | 1y | confidence=medium | 132 | -7.01% | [-11.06%, -3.12%] | 39% | 401 | -5.40% | [-7.70%, -3.13%] | 41% | 0 | -1.60% | **fail** — gap -1.60%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | confidence=low | 270 | -5.83% | [-9.38%, -1.76%] | 39% | 697 | -4.23% | [-6.42%, -2.00%] | 42% | 167 | -1.60% | **fail** — gap -1.60%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=true | 43 | -13.84% | [-22.32%, -5.29%] | 30% | 118 | -8.89% | [-14.10%, -3.86%] | 36% | 0 | -4.96% | **fail** — gap -4.96%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | divergent=false | 366 | -5.68% | [-8.59%, -2.60%] | 39% | 878 | -3.08% | [-4.79%, -1.20%] | 45% | 167 | -2.59% | **fail** — gap -2.59%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=true | 63 | -12.73% | [-19.96%, -4.72%] | 27% | 156 | -5.24% | [-8.95%, -1.39%] | 42% | 9 | -7.49% | **fail** — gap -7.49%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | deep-cyclical=false | 338 | -5.97% | [-9.09%, -2.97%] | 40% | 810 | -2.60% | [-4.29%, -0.86%] | 45% | 158 | -3.37% | **fail** — gap -3.37%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=high | 14 | -13.34% | [-20.78%, -4.61%] | 21% | 69 | -9.24% | [-12.16%, -6.08%] | 17% | 0 | -4.10% | **underpowered** — n(below)=14, n(at/above)=69 — below the 30-row verdict floor |
| post-2022 | 3y | confidence=medium | 117 | -12.16% | [-14.99%, -9.46%] | 21% | 356 | -10.68% | [-12.66%, -8.51%] | 21% | 0 | -1.48% | **fail** — gap -1.48%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | confidence=low | 225 | -5.68% | [-9.46%, -1.62%] | 32% | 654 | -6.21% | [-8.58%, -3.88%] | 29% | 104 | 0.53% | **fail** — gap 0.53%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=true | 34 | 0.60% | [-12.17%, 14.30%] | 41% | 102 | -0.84% | [-7.18%, 5.81%] | 39% | 0 | 1.43% | **fail** — gap 1.43%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | divergent=false | 311 | -7.60% | [-10.44%, -4.47%] | 28% | 856 | -7.20% | [-8.91%, -5.38%] | 27% | 104 | -0.40% | **fail** — gap -0.40%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=true | 58 | -11.43% | [-17.49%, -4.41%] | 21% | 151 | -5.26% | [-9.92%, -0.30%] | 30% | 2 | -6.17% | **fail** — gap -6.17%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | deep-cyclical=false | 285 | -6.86% | [-10.01%, -3.65%] | 29% | 788 | -6.80% | [-8.77%, -4.86%] | 27% | 102 | -0.06% | **fail** — gap -0.06%/yr; below-arm CI crosses 0 |

### H4 discrimination verdicts (below-arm vs below-arm)

| Comparison | Regime | Horizon | Gap/yr | Verdict |
|---|---|---|---|---|
| confidence high vs low | pooled | 1y | -4.54% | **decorative** — below-arm gap -4.54%/yr, CIs overlap |
| divergent false vs true | pooled | 1y | 3.53% | **decorative** — below-arm gap 3.53%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 1y | 0.84% | **decorative** — below-arm gap 0.84%/yr, CIs overlap |
| confidence high vs low | pooled | 3y | -2.12% | **decorative** — below-arm gap -2.12%/yr, CIs overlap |
| divergent false vs true | pooled | 3y | -0.15% | **decorative** — below-arm gap -0.15%/yr, CIs overlap |
| deep-cyclical false vs true | pooled | 3y | -0.09% | **decorative** — below-arm gap -0.09%/yr, CIs overlap |
| confidence high vs low | pre-covid | 1y | -1.04% | **decorative** — below-arm gap -1.04%/yr, CIs overlap |
| divergent false vs true | pre-covid | 1y | 3.25% | **decorative** — below-arm gap 3.25%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 1y | 2.84% | **decorative** — below-arm gap 2.84%/yr, CIs overlap |
| confidence high vs low | pre-covid | 3y | 1.09% | **decorative** — below-arm gap 1.09%/yr, CIs overlap |
| divergent false vs true | pre-covid | 3y | 0.78% | **decorative** — below-arm gap 0.78%/yr, CIs overlap |
| deep-cyclical false vs true | pre-covid | 3y | 0.57% | **decorative** — below-arm gap 0.57%/yr, CIs overlap |
| confidence high vs low | covid | 1y | — | **underpowered** — below-arm n: 18 vs 404 (floor 30) |
| divergent false vs true | covid | 1y | -2.49% | **decorative** — below-arm gap -2.49%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 1y | -8.85% | **decorative** — below-arm gap -8.85%/yr, CIs overlap |
| confidence high vs low | covid | 3y | — | **underpowered** — below-arm n: 18 vs 404 (floor 30) |
| divergent false vs true | covid | 3y | 3.66% | **decorative** — below-arm gap 3.66%/yr, CIs overlap |
| deep-cyclical false vs true | covid | 3y | -5.85% | **decorative** — below-arm gap -5.85%/yr, CIs overlap |
| confidence high vs low | post-2022 | 1y | — | **underpowered** — below-arm n: 23 vs 270 (floor 30) |
| divergent false vs true | post-2022 | 1y | 8.17% | **decorative** — below-arm gap 8.17%/yr, CIs overlap |
| deep-cyclical false vs true | post-2022 | 1y | 6.76% | **decorative** — below-arm gap 6.76%/yr, CIs overlap |
| confidence high vs low | post-2022 | 3y | — | **underpowered** — below-arm n: 14 vs 225 (floor 30) |
| divergent false vs true | post-2022 | 3y | -8.20% | **decorative** — below-arm gap -8.20%/yr, CIs overlap |
| deep-cyclical false vs true | post-2022 | 3y | 4.57% | **decorative** — below-arm gap 4.57%/yr, CIs overlap |

## H5 — peer contamination: does predictive power decay with peer premium?

Primary buckets on the SYMMETRIC ratio max(peer/own, own/peer) — the quantity the production 5.0 cliff gates on. The `>= 5.0 (pre-suppression band)` stratum recomputes belowP25 from the full-9 pre-suppression anchors: production's band past the cliff is own-only by construction, so this is the only view of raw contamination there.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | sym [1, 1.5) | 739 | 1.52% | [-0.58%, 3.65%] | 53% | 3493 | -1.00% | [-1.75%, -0.18%] | 46% | 13 | 2.52% | **fail** — gap 2.52%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [1.5, 2.5) | 805 | -0.01% | [-2.31%, 2.27%] | 46% | 2605 | -1.00% | [-1.97%, 0.01%] | 47% | 5 | 0.98% | **fail** — gap 0.98%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym [2.5, 5) | 446 | -2.17% | [-5.59%, 1.12%] | 41% | 1201 | -1.32% | [-2.98%, 0.46%] | 47% | 6 | -0.85% | **fail** — gap -0.85%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 | 152 | -2.75% | [-9.74%, 4.42%] | 39% | 609 | 0.77% | [-1.47%, 3.06%] | 50% | 18 | -3.52% | **fail** — gap -3.52%/yr; below-arm CI crosses 0 |
| pooled | 1y | sym >= 5 (pre-suppression band) | 179 | -1.93% | [-8.09%, 4.44%] | 42% | 579 | 1.05% | [-1.04%, 3.21%] | 51% | 14 | -2.98% | **fail** — gap -2.98%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1, 1.5) | 694 | -2.15% | [-3.56%, -0.68%] | 40% | 3446 | -1.23% | [-1.96%, -0.54%] | 42% | 6 | -0.92% | **fail** — gap -0.92%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [1.5, 2.5) | 778 | -2.58% | [-4.18%, -0.68%] | 40% | 2554 | -1.43% | [-2.28%, -0.59%] | 42% | 5 | -1.15% | **fail** — gap -1.15%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym [2.5, 5) | 428 | -2.23% | [-5.04%, 0.65%] | 38% | 1170 | -1.83% | [-3.21%, -0.28%] | 37% | 6 | -0.40% | **fail** — gap -0.40%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 | 143 | -2.02% | [-7.09%, 3.62%] | 39% | 593 | -0.13% | [-2.23%, 1.90%] | 43% | 18 | -1.89% | **fail** — gap -1.89%/yr; below-arm CI crosses 0 |
| pooled | 3y | sym >= 5 (pre-suppression band) | 170 | -1.86% | [-6.08%, 2.94%] | 38% | 565 | -0.17% | [-2.20%, 1.95%] | 42% | 14 | -1.69% | **fail** — gap -1.69%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [1, 1.5) | 385 | 3.20% | [0.64%, 5.75%] | 55% | 2000 | 0.87% | [-0.13%, 1.84%] | 49% | 4 | 2.34% | **pass** — gap 2.34%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | sym [1.5, 2.5) | 409 | 1.17% | [-1.41%, 3.94%] | 49% | 1371 | 1.02% | [-0.31%, 2.36%] | 51% | 5 | 0.15% | **fail** — gap 0.15%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym [2.5, 5) | 202 | 0.80% | [-3.62%, 5.65%] | 45% | 582 | 1.06% | [-1.38%, 3.50%] | 51% | 3 | -0.26% | **fail** — gap -0.26%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 | 61 | -0.47% | [-9.25%, 9.06%] | 43% | 287 | 4.44% | [1.26%, 8.09%] | 58% | 9 | -4.91% | **fail** — gap -4.91%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | sym >= 5 (pre-suppression band) | 72 | -0.63% | [-9.85%, 8.68%] | 46% | 278 | 4.49% | [1.55%, 7.69%] | 57% | 5 | -5.12% | **fail** — gap -5.12%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1, 1.5) | 385 | -1.21% | [-3.04%, 0.78%] | 43% | 2000 | 0.43% | [-0.39%, 1.35%] | 47% | 4 | -1.64% | **fail** — gap -1.64%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [1.5, 2.5) | 409 | -2.70% | [-4.72%, -0.27%] | 41% | 1371 | 0.13% | [-0.95%, 1.17%] | 47% | 5 | -2.84% | **fail** — gap -2.84%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym [2.5, 5) | 202 | -2.11% | [-6.12%, 2.56%] | 38% | 582 | -0.36% | [-2.04%, 1.64%] | 41% | 3 | -1.75% | **fail** — gap -1.75%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 | 61 | -2.68% | [-9.84%, 3.88%] | 39% | 287 | 1.86% | [-0.91%, 4.83%] | 48% | 9 | -4.54% | **fail** — gap -4.54%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | sym >= 5 (pre-suppression band) | 72 | -3.69% | [-9.81%, 2.65%] | 40% | 278 | 1.86% | [-1.00%, 4.87%] | 46% | 5 | -5.55% | **fail** — gap -5.55%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1, 1.5) | 196 | 4.60% | [-0.15%, 9.31%] | 56% | 874 | -2.78% | [-4.29%, -1.07%] | 42% | 0 | 7.38% | **fail** — gap 7.38%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [1.5, 2.5) | 238 | 3.40% | [-1.39%, 8.77%] | 47% | 742 | -1.23% | [-3.21%, 0.79%] | 44% | 0 | 4.63% | **fail** — gap 4.63%/yr; below-arm CI crosses 0 |
| covid | 1y | sym [2.5, 5) | 136 | -0.37% | [-6.73%, 6.25%] | 45% | 380 | -2.05% | [-4.73%, 0.95%] | 44% | 3 | 1.68% | **fail** — gap 1.68%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 | 48 | 4.30% | [-10.89%, 21.26%] | 44% | 204 | 1.20% | [-2.89%, 4.98%] | 49% | 9 | 3.10% | **fail** — gap 3.10%/yr; below-arm CI crosses 0 |
| covid | 1y | sym >= 5 (pre-suppression band) | 56 | 6.51% | [-8.46%, 22.29%] | 48% | 198 | 1.40% | [-2.52%, 5.48%] | 49% | 9 | 5.11% | **fail** — gap 5.11%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1, 1.5) | 196 | 0.42% | [-2.08%, 2.98%] | 45% | 874 | -0.97% | [-2.10%, 0.14%] | 42% | 0 | 1.39% | **fail** — gap 1.39%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [1.5, 2.5) | 238 | 1.62% | [-1.30%, 4.63%] | 44% | 742 | -1.06% | [-2.26%, 0.17%] | 42% | 0 | 2.68% | **fail** — gap 2.68%/yr; below-arm CI crosses 0 |
| covid | 3y | sym [2.5, 5) | 136 | 3.17% | [-0.89%, 7.51%] | 43% | 380 | -1.97% | [-4.24%, 0.46%] | 35% | 3 | 5.14% | **fail** — gap 5.14%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 | 48 | -3.03% | [-9.40%, 3.35%] | 38% | 204 | -2.56% | [-5.07%, 0.31%] | 38% | 9 | -0.47% | **fail** — gap -0.47%/yr; below-arm CI crosses 0 |
| covid | 3y | sym >= 5 (pre-suppression band) | 56 | -3.06% | [-8.03%, 2.72%] | 32% | 198 | -2.60% | [-5.44%, 0.30%] | 38% | 9 | -0.46% | **fail** — gap -0.46%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1, 1.5) | 158 | -6.41% | [-10.26%, -2.71%] | 44% | 619 | -4.52% | [-6.47%, -2.48%] | 42% | 9 | -1.89% | **fail** — gap -1.89%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [1.5, 2.5) | 158 | -8.22% | [-12.45%, -3.63%] | 34% | 492 | -6.27% | [-8.43%, -3.91%] | 39% | 0 | -1.95% | **fail** — gap -1.95%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym [2.5, 5) | 108 | -10.01% | [-17.11%, -2.78%] | 28% | 239 | -5.96% | [-9.67%, -1.96%] | 41% | 0 | -4.05% | **fail** — gap -4.05%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 | 43 | -13.84% | [-22.77%, -4.54%] | 30% | 118 | -8.89% | [-14.14%, -3.99%] | 36% | 0 | -4.96% | **fail** — gap -4.96%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | sym >= 5 (pre-suppression band) | 51 | -13.01% | [-19.78%, -6.58%] | 29% | 103 | -8.90% | [-14.94%, -2.72%] | 36% | 0 | -4.11% | **fail** — gap -4.11%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1, 1.5) | 113 | -9.81% | [-13.36%, -6.35%] | 21% | 572 | -7.42% | [-9.51%, -5.33%] | 26% | 2 | -2.39% | **fail** — gap -2.39%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [1.5, 2.5) | 131 | -9.85% | [-14.34%, -5.14%] | 30% | 441 | -6.94% | [-9.65%, -3.94%] | 28% | 0 | -2.91% | **fail** — gap -2.91%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym [2.5, 5) | 90 | -10.66% | [-15.94%, -4.50%] | 28% | 208 | -5.68% | [-9.94%, -1.16%] | 32% | 0 | -4.98% | **fail** — gap -4.98%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 | 34 | 0.60% | [-11.71%, 14.53%] | 41% | 102 | -0.84% | [-7.16%, 6.36%] | 39% | 0 | 1.43% | **fail** — gap 1.43%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | sym >= 5 (pre-suppression band) | 42 | 2.87% | [-9.29%, 17.72%] | 40% | 89 | -1.12% | [-7.64%, 6.66%] | 38% | 0 | 3.99% | **fail** — gap 3.99%/yr; below-arm CI crosses 0 |

### H5 trend verdicts

| Regime | Horizon | Spearman(bucket, gap) | Monotonic decay | Top bucket ≤ 0 | Verdict |
|---|---|---|---|---|---|
| pooled | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| pooled | 3y | -0.400 | no | yes | **no-decay-evidence** |
| pre-covid | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| pre-covid | 3y | -0.800 | no | yes | **no-decay-evidence** |
| covid | 1y | -0.800 | no | no | **no-decay-evidence** |
| covid | 3y | -0.200 | no | yes | **no-decay-evidence** |
| post-2022 | 1y | -1.000 | yes | yes | **supports-shrinkage** |
| post-2022 | 3y | 0.200 | no | no | **no-decay-evidence** |

### H5 secondary — directed ratio (peer/own), exposing the two sides of the cliff

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | dir [0, 0.4) | 37 | 11.37% | [-2.34%, 34.65%] | 59% | 968 | 0.95% | [-0.78%, 2.82%] | 50% | 22 | 10.42% | **fail** — gap 10.42%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [0.4, 0.67) | 29 | 7.63% | [-4.66%, 22.63%] | 52% | 1515 | -0.64% | [-1.90%, 0.77%] | 47% | 0 | 8.27% | **underpowered** — n(below)=29, n(at/above)=1515 — below the 30-row verdict floor |
| pooled | 1y | dir [0.67, 1.5) | 739 | 1.52% | [-0.49%, 3.42%] | 53% | 3486 | -1.01% | [-1.81%, -0.23%] | 46% | 13 | 2.53% | **fail** — gap 2.53%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [1.5, 2.5) | 780 | -0.15% | [-2.31%, 2.06%] | 46% | 1285 | -1.49% | [-2.92%, -0.21%] | 46% | 5 | 1.34% | **fail** — gap 1.34%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir [2.5, 5) | 441 | -2.40% | [-5.66%, 1.12%] | 40% | 459 | -3.87% | [-6.38%, -1.27%] | 45% | 1 | 1.47% | **fail** — gap 1.47%/yr; below-arm CI crosses 0 |
| pooled | 1y | dir >= 5 | 122 | -3.55% | [-11.45%, 5.58%] | 35% | 204 | -3.41% | [-7.21%, 0.27%] | 45% | 1 | -0.14% | **fail** — gap -0.14%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0, 0.4) | 36 | -0.93% | [-9.00%, 8.32%] | 42% | 951 | -0.62% | [-2.23%, 1.14%] | 39% | 22 | -0.32% | **fail** — gap -0.32%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [0.4, 0.67) | 26 | -7.18% | [-14.27%, 0.10%] | 35% | 1488 | -0.93% | [-2.05%, 0.27%] | 43% | 0 | -6.25% | **underpowered** — n(below)=26, n(at/above)=1488 — below the 30-row verdict floor |
| pooled | 3y | dir [0.67, 1.5) | 694 | -2.15% | [-3.56%, -0.64%] | 40% | 3438 | -1.24% | [-1.96%, -0.52%] | 42% | 6 | -0.91% | **fail** — gap -0.91%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [1.5, 2.5) | 756 | -2.40% | [-4.04%, -0.60%] | 40% | 1255 | -2.11% | [-3.18%, -0.94%] | 41% | 5 | -0.29% | **fail** — gap -0.29%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir [2.5, 5) | 423 | -2.34% | [-4.90%, 0.32%] | 38% | 444 | -3.27% | [-5.39%, -1.16%] | 37% | 1 | 0.92% | **fail** — gap 0.92%/yr; below-arm CI crosses 0 |
| pooled | 3y | dir >= 5 | 113 | -1.26% | [-6.71%, 4.36%] | 39% | 200 | -3.52% | [-6.61%, -0.07%] | 39% | 1 | 2.26% | **fail** — gap 2.26%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [0, 0.4) | 22 | 17.16% | [-4.87%, 48.56%] | 55% | 471 | 3.83% | [1.29%, 6.44%] | 56% | 10 | 13.33% | **underpowered** — n(below)=22, n(at/above)=471 — below the 30-row verdict floor |
| pre-covid | 1y | dir [0.4, 0.67) | 15 | 22.26% | [2.55%, 42.01%] | 67% | 773 | 0.84% | [-0.85%, 2.51%] | 50% | 0 | 21.43% | **underpowered** — n(below)=15, n(at/above)=773 — below the 30-row verdict floor |
| pre-covid | 1y | dir [0.67, 1.5) | 385 | 3.20% | [0.50%, 5.84%] | 55% | 1996 | 0.85% | [-0.11%, 1.88%] | 49% | 4 | 2.35% | **pass** — gap 2.35%/yr ≥ 1.00%/yr and below-arm CI excludes 0 |
| pre-covid | 1y | dir [1.5, 2.5) | 397 | 0.60% | [-2.09%, 3.41%] | 49% | 685 | 0.96% | [-0.99%, 2.87%] | 52% | 5 | -0.37% | **fail** — gap -0.37%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir [2.5, 5) | 200 | 0.09% | [-4.36%, 4.88%] | 44% | 230 | -2.18% | [-5.79%, 1.53%] | 48% | 1 | 2.27% | **fail** — gap 2.27%/yr; below-arm CI crosses 0 |
| pre-covid | 1y | dir >= 5 | 42 | 1.03% | [-11.93%, 14.37%] | 40% | 94 | -1.01% | [-5.79%, 4.05%] | 49% | 1 | 2.04% | **fail** — gap 2.04%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [0, 0.4) | 22 | 3.81% | [-8.05%, 15.56%] | 50% | 471 | 2.24% | [0.12%, 4.48%] | 45% | 10 | 1.56% | **underpowered** — n(below)=22, n(at/above)=471 — below the 30-row verdict floor |
| pre-covid | 3y | dir [0.4, 0.67) | 15 | -1.52% | [-10.47%, 7.83%] | 47% | 773 | 0.87% | [-0.72%, 2.51%] | 48% | 0 | -2.40% | **underpowered** — n(below)=15, n(at/above)=773 — below the 30-row verdict floor |
| pre-covid | 3y | dir [0.67, 1.5) | 385 | -1.21% | [-3.12%, 0.85%] | 43% | 1996 | 0.41% | [-0.44%, 1.30%] | 47% | 4 | -1.63% | **fail** — gap -1.63%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [1.5, 2.5) | 397 | -2.69% | [-4.81%, -0.24%] | 41% | 685 | -1.07% | [-2.32%, 0.14%] | 45% | 5 | -1.63% | **fail** — gap -1.63%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir [2.5, 5) | 200 | -2.45% | [-6.44%, 2.57%] | 38% | 230 | -2.88% | [-5.49%, -0.07%] | 39% | 1 | 0.43% | **fail** — gap 0.43%/yr; below-arm CI crosses 0 |
| pre-covid | 3y | dir >= 5 | 42 | -2.60% | [-10.18%, 5.83%] | 38% | 94 | -4.85% | [-8.14%, -1.32%] | 39% | 1 | 2.25% | **fail** — gap 2.25%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [0, 0.4) | 10 | 3.39% | [-10.70%, 15.59%] | 70% | 313 | -0.75% | [-3.77%, 2.54%] | 45% | 12 | 4.14% | **underpowered** — n(below)=10, n(at/above)=313 — below the 30-row verdict floor |
| covid | 1y | dir [0.4, 0.67) | 7 | -8.28% | [-30.32%, 14.87%] | 29% | 439 | -0.21% | [-2.65%, 2.24%] | 45% | 0 | -8.07% | **underpowered** — n(below)=7, n(at/above)=439 — below the 30-row verdict floor |
| covid | 1y | dir [0.67, 1.5) | 196 | 4.60% | [-0.37%, 9.56%] | 56% | 871 | -2.82% | [-4.49%, -1.22%] | 42% | 0 | 7.41% | **fail** — gap 7.41%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [1.5, 2.5) | 232 | 3.84% | [-0.88%, 9.28%] | 48% | 376 | -1.95% | [-4.72%, 0.93%] | 42% | 0 | 5.79% | **fail** — gap 5.79%/yr; below-arm CI crosses 0 |
| covid | 1y | dir [2.5, 5) | 135 | -0.01% | [-6.43%, 6.42%] | 45% | 139 | -2.39% | [-6.39%, 1.80%] | 44% | 0 | 2.39% | **fail** — gap 2.39%/yr; below-arm CI crosses 0 |
| covid | 1y | dir >= 5 | 39 | 3.16% | [-15.33%, 26.16%] | 36% | 65 | 0.91% | [-5.69%, 7.00%] | 48% | 0 | 2.25% | **fail** — gap 2.25%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [0, 0.4) | 10 | -7.62% | [-18.31%, 4.55%] | 30% | 313 | -3.25% | [-5.50%, -0.90%] | 33% | 12 | -4.37% | **underpowered** — n(below)=10, n(at/above)=313 — below the 30-row verdict floor |
| covid | 3y | dir [0.4, 0.67) | 7 | -11.47% | [-23.12%, 0.42%] | 14% | 439 | -0.47% | [-2.29%, 1.45%] | 43% | 0 | -11.00% | **underpowered** — n(below)=7, n(at/above)=439 — below the 30-row verdict floor |
| covid | 3y | dir [0.67, 1.5) | 196 | 0.42% | [-2.15%, 2.92%] | 45% | 871 | -0.99% | [-2.08%, 0.01%] | 42% | 0 | 1.41% | **fail** — gap 1.41%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [1.5, 2.5) | 232 | 2.00% | [-0.81%, 5.54%] | 45% | 376 | -1.48% | [-3.19%, 0.23%] | 41% | 0 | 3.47% | **fail** — gap 3.47%/yr; below-arm CI crosses 0 |
| covid | 3y | dir [2.5, 5) | 135 | 3.34% | [-0.66%, 7.81%] | 44% | 139 | -0.99% | [-4.39%, 2.63%] | 39% | 0 | 4.33% | **fail** — gap 4.33%/yr; below-arm CI crosses 0 |
| covid | 3y | dir >= 5 | 39 | -2.28% | [-9.42%, 5.37%] | 38% | 65 | -3.12% | [-6.32%, 0.35%] | 42% | 0 | 0.84% | **fail** — gap 0.84%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [0, 0.4) | 5 | 1.84% | [-25.19%, 30.59%] | 60% | 184 | -3.52% | [-8.09%, 1.29%] | 43% | 0 | 5.37% | **underpowered** — n(below)=5, n(at/above)=184 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.4, 0.67) | 7 | -7.83% | [-26.15%, 10.40%] | 43% | 303 | -5.04% | [-7.96%, -1.86%] | 41% | 0 | -2.79% | **underpowered** — n(below)=7, n(at/above)=303 — below the 30-row verdict floor |
| post-2022 | 1y | dir [0.67, 1.5) | 158 | -6.41% | [-10.27%, -2.89%] | 44% | 619 | -4.50% | [-6.46%, -2.53%] | 42% | 9 | -1.92% | **fail** — gap -1.92%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [1.5, 2.5) | 151 | -8.24% | [-12.45%, -3.83%] | 34% | 224 | -8.22% | [-11.41%, -5.34%] | 35% | 0 | -0.02% | **fail** — gap -0.02%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir [2.5, 5) | 106 | -10.15% | [-17.16%, -2.40%] | 27% | 90 | -10.50% | [-15.28%, -5.93%] | 37% | 0 | 0.35% | **fail** — gap 0.35%/yr; below-arm CI crosses 0 |
| post-2022 | 1y | dir >= 5 | 41 | -14.63% | [-22.81%, -7.40%] | 29% | 45 | -14.64% | [-21.80%, -6.83%] | 31% | 0 | 0.02% | **fail** — gap 0.02%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [0, 0.4) | 4 | -10.31% | — | 25% | 167 | -3.75% | [-8.90%, 2.11%] | 36% | 0 | -6.56% | **underpowered** — n(below)=4, n(at/above)=167 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.4, 0.67) | 4 | -20.88% | — | 25% | 276 | -6.68% | [-9.92%, -2.96%] | 30% | 0 | -14.19% | **underpowered** — n(below)=4, n(at/above)=276 — below the 30-row verdict floor |
| post-2022 | 3y | dir [0.67, 1.5) | 113 | -9.81% | [-13.12%, -6.49%] | 21% | 571 | -7.38% | [-9.41%, -5.08%] | 26% | 2 | -2.43% | **fail** — gap -2.43%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [1.5, 2.5) | 127 | -9.50% | [-13.92%, -4.74%] | 30% | 194 | -6.99% | [-10.75%, -2.41%] | 26% | 0 | -2.51% | **fail** — gap -2.51%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir [2.5, 5) | 88 | -10.83% | [-16.28%, -4.03%] | 28% | 75 | -8.70% | [-13.62%, -4.04%] | 28% | 0 | -2.14% | **fail** — gap -2.14%/yr; below-arm CI crosses 0 |
| post-2022 | 3y | dir >= 5 | 32 | 1.74% | [-10.12%, 16.71%] | 41% | 41 | -1.10% | [-12.80%, 12.90%] | 34% | 0 | 2.83% | **fail** — gap 2.83%/yr; below-arm CI crosses 0 |

## H6 — anchor ablation (pooled; regime lens lives in H1)

Variants recompute the band from pre-suppression anchor subsets. Common support = rows where both own-3 and peer-6 bands exist.

| Regime | Horizon | Stratum | n<p25 | below ann. | below CI | below hit | n≥p25 | at/above ann. | at/above CI | at/above hit | no-band | Gap/yr | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pooled | 1y | variant=production (common support) | 1761 | -0.09% | [-1.59%, 1.46%] | 48% | 5008 | -0.78% | [-1.47%, -0.10%] | 47% | 0 | 0.68% | **fail** — gap 0.68%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=production (unrestricted) | 1848 | 0.31% | [-1.19%, 1.82%] | 48% | 5076 | -0.73% | [-1.44%, -0.01%] | 47% | 1079 | 1.04% | **fail** — gap 1.04%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (common support) | 1744 | -0.13% | [-1.57%, 1.39%] | 48% | 4992 | -0.76% | [-1.47%, -0.04%] | 47% | 0 | 0.63% | **fail** — gap 0.63%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=full9 (unrestricted) | 1831 | 0.19% | [-1.27%, 1.82%] | 48% | 5060 | -0.72% | [-1.44%, -0.03%] | 47% | 1075 | 0.90% | **fail** — gap 0.90%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (common support) | 1928 | 0.22% | [-1.30%, 1.67%] | 48% | 5007 | -0.96% | [-1.61%, -0.20%] | 46% | 0 | 1.18% | **fail** — gap 1.18%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=own3 (unrestricted) | 1930 | 0.25% | [-1.16%, 1.83%] | 48% | 5026 | -0.97% | [-1.64%, -0.30%] | 46% | 2385 | 1.22% | **fail** — gap 1.22%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (common support) | 2545 | -1.14% | [-2.23%, -0.12%] | 46% | 4518 | -0.57% | [-1.33%, 0.25%] | 47% | 0 | -0.57% | **fail** — gap -0.57%/yr; below-arm CI crosses 0 |
| pooled | 1y | variant=peer6 (unrestricted) | 2614 | -0.76% | [-1.90%, 0.39%] | 46% | 4568 | -0.47% | [-1.22%, 0.32%] | 47% | 1375 | -0.28% | **fail** — gap -0.28%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (common support) | 1705 | -2.40% | [-3.50%, -1.27%] | 39% | 4985 | -1.47% | [-2.11%, -0.84%] | 42% | 0 | -0.93% | **fail** — gap -0.93%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=production (unrestricted) | 1793 | -2.28% | [-3.39%, -1.19%] | 40% | 5056 | -1.44% | [-2.00%, -0.85%] | 42% | 1016 | -0.84% | **fail** — gap -0.84%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (common support) | 1691 | -2.29% | [-3.37%, -1.10%] | 39% | 4969 | -1.43% | [-2.04%, -0.82%] | 42% | 0 | -0.86% | **fail** — gap -0.86%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=full9 (unrestricted) | 1779 | -2.20% | [-3.31%, -1.06%] | 40% | 5040 | -1.40% | [-1.96%, -0.79%] | 42% | 1012 | -0.80% | **fail** — gap -0.80%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (common support) | 1854 | -1.95% | [-3.09%, -0.73%] | 40% | 4981 | -1.54% | [-2.12%, -0.95%] | 41% | 0 | -0.41% | **fail** — gap -0.41%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=own3 (unrestricted) | 1857 | -1.92% | [-2.96%, -0.75%] | 40% | 5000 | -1.54% | [-2.15%, -0.96%] | 41% | 2245 | -0.38% | **fail** — gap -0.38%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (common support) | 2505 | -2.42% | [-3.22%, -1.59%] | 39% | 4488 | -1.40% | [-2.05%, -0.74%] | 42% | 0 | -1.02% | **fail** — gap -1.02%/yr; below-arm CI crosses 0 |
| pooled | 3y | variant=peer6 (unrestricted) | 2573 | -2.32% | [-3.10%, -1.53%] | 39% | 4541 | -1.37% | [-2.02%, -0.73%] | 42% | 1304 | -0.95% | **fail** — gap -0.95%/yr; below-arm CI crosses 0 |

### H6 anchor correlation structure

Pairwise Spearman of row-median-normalized implied prices. Effective anchor count ((Σλ)²/Σλ², non-negative eigenvalues over the active block): **4.83 of 9 active** (9 total). 0 pairs below the min-N floor render as — and enter the eigen step as 0.

| | peerMedianPE | peerMedianEVEBITDA | peerMedianPFCF | ownHistoricalPE | ownHistoricalEVEBITDA | ownHistoricalPFCF | normalizedPE | normalizedEVEBITDA | normalizedPFCF |
|---|---|---|---|---|---|---|---|---|---|
| **peerMedianPE** | 1.00 | -0.10 | -0.32 | 0.08 | -0.28 | -0.37 | 0.45 | -0.20 | -0.23 |
| **peerMedianEVEBITDA** | -0.10 | 1.00 | -0.25 | -0.36 | -0.08 | -0.38 | -0.14 | 0.69 | -0.22 |
| **peerMedianPFCF** | -0.32 | -0.25 | 1.00 | -0.29 | -0.28 | 0.13 | -0.23 | -0.18 | 0.55 |
| **ownHistoricalPE** | 0.08 | -0.36 | -0.29 | 1.00 | 0.55 | 0.38 | -0.32 | -0.47 | -0.28 |
| **ownHistoricalEVEBITDA** | -0.28 | -0.08 | -0.28 | 0.55 | 1.00 | 0.45 | -0.35 | -0.35 | -0.29 |
| **ownHistoricalPFCF** | -0.37 | -0.38 | 0.13 | 0.38 | 0.45 | 1.00 | -0.35 | -0.41 | -0.31 |
| **normalizedPE** | 0.45 | -0.14 | -0.23 | -0.32 | -0.35 | -0.35 | 1.00 | 0.03 | -0.07 |
| **normalizedEVEBITDA** | -0.20 | 0.69 | -0.18 | -0.47 | -0.35 | -0.41 | 0.03 | 1.00 | -0.06 |
| **normalizedPFCF** | -0.23 | -0.22 | 0.55 | -0.28 | -0.29 | -0.31 | -0.07 | -0.06 | 1.00 |

Eigenvalues: 2.82, 2.06, 1.82, 0.79, 0.60, 0.41, 0.22, 0.16, 0.12

---

**Verdict:** H1 pooled 3y: fail (gap -0.84%/yr); H2 3y: fail-economic (avg IC -0.028)
