# FV-trend audit (H10) — 2026-04-26

**Snapshot range:** 2018-04-30 → 2023-03-31

**Hypothesis:** Names with declining FV-trend at T underperform stable+improving cohort on 3y forward excess return (validates the §FV-trend demotion-to-Watch rule)

**Verdict:** **fail** — declining cohort 3y excess -4.76% vs stable+improving -10.05% — gap +5.30 pp (declining OUTPERFORMED, demotion harmful)

## Per-trend × per-horizon excess return

| Trend | Horizon | N | Mean excess | CI (95%) |
|---|---|---|---|---|
| declining | 1y | 10433 | -0.93% | [-1.62%, -0.21%] |
| stable | 1y | 1781 | 0.93% | [-0.42%, 2.46%] |
| improving | 1y | 12768 | -1.43% | [-1.92%, -0.94%] |
| insufficient_data | 1y | 2573 | -1.83% | [-2.90%, -0.88%] |
| declining | 3y | 10433 | -4.76% | [-6.33%, -3.20%] |
| stable | 3y | 1781 | -9.74% | [-12.93%, -6.73%] |
| improving | 3y | 12768 | -10.10% | [-11.29%, -8.94%] |
| insufficient_data | 3y | 2573 | -13.12% | [-15.47%, -10.60%] |

## Classification breakdown

How many (symbol, snapshot date) observations landed in each FV-trend bucket. The 2-year window + ≥4-sample minimum means the earliest backtest dates land in `insufficient_data` (no trailing FV history yet built up).

| Trend | Count |
|---|---|
| declining | 10433 |
| stable | 1781 |
| improving | 12768 |
| insufficient_data | 2573 |
