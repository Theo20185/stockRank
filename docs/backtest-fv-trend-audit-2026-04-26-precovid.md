# FV-trend audit (H10) — 2026-04-26

**Snapshot range:** 2011-01-31 → 2018-12-31

**Hypothesis:** Names with declining FV-trend at T underperform stable+improving cohort on 3y forward excess return (validates the §FV-trend demotion-to-Watch rule)

**Verdict:** **inconclusive** — declining vs stable+improving within 2 pp — no clear edge

## Per-trend × per-horizon excess return

| Trend | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| declining | 1y | 11953 | 2.40% | [1.93%, 2.90%] |
| stable | 1y | 2745 | 2.06% | [1.19%, 2.93%] |
| improving | 1y | 19533 | 0.32% | [-0.03%, 0.72%] |
| insufficient_data | 1y | 2724 | 0.17% | [-0.91%, 1.31%] |
| declining | 3y | 11953 | -0.13% | [-1.29%, 1.06%] |
| stable | 3y | 2745 | -2.08% | [-4.16%, 0.21%] |
| improving | 3y | 19533 | -1.39% | [-2.20%, -0.53%] |
| insufficient_data | 3y | 2724 | 6.18% | [3.74%, 8.43%] |

## Classification breakdown

How many (symbol, snapshot date) observations landed in each FV-trend bucket. The 2-year window + ≥4-sample minimum means the earliest backtest dates land in `insufficient_data` (no trailing FV history yet built up).

| Trend | Count |
|---|---|
| declining | 11953 |
| stable | 2745 |
| improving | 19533 |
| insufficient_data | 2724 |
