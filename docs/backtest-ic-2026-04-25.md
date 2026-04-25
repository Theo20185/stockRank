# IC analysis — 2026-04-25

**Calibration:** `calibration.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 4 | 232 | 0 | 0 | 36 |
| 3y | 10 | 226 | 0 | 0 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | +0.353 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | +0.252 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | +0.415 | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | -0.260 | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Transportation & Autos | BBY | +0.415 | [0.204, 0.599] | 63 | +/+/+ |
| Utilities | D/EBITDA | +0.353 | [0.035, 0.613] | 44 | +/-/+ |
| Consumer Staples | NetIss | -0.260 | [-0.461, -0.054] | 73 | -/-/- |
| Materials & Construction | EV/EBITDA | +0.252 | [0.032, 0.475] | 79 | +/+/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | +0.388 | +0.224 | +0.286 | — | — | — | — | — | -0.231 | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.430 | — | — | — | +0.581 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | -0.442 | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | -0.257 | — | — | — |
| Consumer Discretionary | +0.293 | +0.241 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Utilities | D/EBITDA | +0.581 | [0.319, 0.771] | 44 | +/+/+ |
| Transportation & Autos | D/EBITDA | -0.442 | [-0.677, -0.130] | 36 | +/-/- |
| Utilities | EV/EBITDA | +0.430 | [0.140, 0.665] | 44 | +/+/+ |
| Semiconductors & Hardware | EV/EBITDA | +0.388 | [0.233, 0.529] | 127 | +/+/+ |
| Consumer Discretionary | EV/EBITDA | +0.293 | [0.056, 0.503] | 93 | +/+/+ |
| Semiconductors & Hardware | P/E | +0.286 | [0.096, 0.455] | 121 | +/+/+ |
| Consumer Staples | NetIss | -0.257 | [-0.470, -0.004] | 73 | -/-/- |
| Consumer Discretionary | P/FCF | +0.241 | [0.086, 0.388] | 158 | +/+/+ |
| Semiconductors & Hardware | Accr | -0.231 | [-0.388, -0.067] | 138 | -/-/- |
| Semiconductors & Hardware | P/FCF | +0.224 | [0.059, 0.377] | 153 | +/+/+ |
