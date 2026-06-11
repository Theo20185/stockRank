# IC analysis — 2026-06-11

**Calibration:** `backtest-ic-calibration-2026-06-11.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 5 | 231 | 0 | 0 | 36 |
| 3y | 13 | 223 | 0 | 0 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.370 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | +0.501 | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.385 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | +0.552 | — | — | — | -0.694 | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Media & Telecom | Accr | -0.694 | [-0.850, -0.459] | 26 | ?/-/- |
| Media & Telecom | D/EBITDA | +0.552 | [0.178, 0.832] | 26 | -/+/+ |
| Pharma & Biotech | DivG5 | +0.501 | [0.008, 0.812] | 18 | ?/+/+ |
| Utilities | EV/EBITDA | +0.385 | [0.064, 0.639] | 39 | +/+/+ |
| Software & Internet | D/EBITDA | +0.370 | [0.190, 0.541] | 100 | +/+/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.377 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | +0.285 | +0.220 | +0.280 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | -0.425 | -0.464 | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.573 | — | — | — | +0.575 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.257 | +0.267 | — | +0.287 | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | +0.240 | — | — | — | +0.294 | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Utilities | D/EBITDA | +0.575 | [0.295, 0.758] | 39 | +/+/+ |
| Utilities | EV/EBITDA | +0.573 | [0.312, 0.747] | 39 | +/+/+ |
| Capital Markets | ROIC | -0.464 | [-0.647, -0.253] | 67 | -/-/- |
| Capital Markets | IntCov | -0.425 | [-0.725, -0.035] | 30 | -/-/- |
| Software & Internet | D/EBITDA | +0.377 | [0.192, 0.544] | 99 | +/+/+ |
| Consumer Discretionary | D/EBITDA | +0.294 | [0.089, 0.458] | 94 | +/+/+ |
| Industrials | P/B | +0.287 | [0.165, 0.405] | 243 | +/+/+ |
| Semiconductors & Hardware | EV/EBITDA | +0.285 | [0.057, 0.485] | 95 | +/+/+ |
| Semiconductors & Hardware | P/E | +0.280 | [0.082, 0.460] | 108 | +/+/+ |
| Industrials | P/FCF | +0.267 | [0.116, 0.411] | 161 | +/+/+ |
| Industrials | EV/EBITDA | +0.257 | [0.066, 0.427] | 85 | -/+/+ |
| Consumer Discretionary | EV/EBITDA | +0.240 | [0.022, 0.444] | 94 | +/+/+ |
| Semiconductors & Hardware | P/FCF | +0.220 | [0.014, 0.405] | 133 | +/+/+ |
