# IC analysis — 2026-04-26

**Calibration:** `backtest-ic-calibration-2026-04-26.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 4 | 232 | 0 | 0 | 36 |
| 3y | 14 | 222 | 0 | 0 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.401 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | -0.332 | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | +0.552 | — | — | — | -0.630 | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Media & Telecom | Accr | -0.630 | [-0.812, -0.382] | 30 | -/-/- |
| Media & Telecom | D/EBITDA | +0.552 | [0.178, 0.832] | 26 | ?/+/+ |
| Software & Internet | D/EBITDA | +0.401 | [0.219, 0.575] | 99 | +/+/+ |
| REITs & Real Estate | BBY | -0.332 | [-0.549, -0.034] | 48 | -/-/- |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.403 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | +0.322 | — | +0.273 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.573 | — | — | — | +0.575 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.252 | +0.273 | — | +0.284 | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | -0.387 | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | +0.300 | +0.260 | — | — | +0.312 | — | — | — | — | — | — | — | — | — | -0.219 | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | +0.483 | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Utilities | D/EBITDA | +0.575 | [0.295, 0.758] | 39 | +/+/+ |
| Utilities | EV/EBITDA | +0.573 | [0.312, 0.747] | 39 | +/+/+ |
| Media & Telecom | DivG5 | +0.483 | [0.112, 0.741] | 28 | +/+/+ |
| Software & Internet | D/EBITDA | +0.403 | [0.224, 0.563] | 99 | +/+/+ |
| Transportation & Autos | DivG5 | -0.387 | [-0.636, -0.057] | 48 | -/-/- |
| Semiconductors & Hardware | EV/EBITDA | +0.322 | [0.122, 0.495] | 100 | +/+/+ |
| Consumer Discretionary | D/EBITDA | +0.312 | [0.132, 0.465] | 102 | +/+/+ |
| Consumer Discretionary | EV/EBITDA | +0.300 | [0.093, 0.492] | 102 | +/+/+ |
| Industrials | P/B | +0.284 | [0.162, 0.406] | 244 | +/+/+ |
| Semiconductors & Hardware | P/E | +0.273 | [0.084, 0.451] | 108 | +/+/+ |
| Industrials | P/FCF | +0.273 | [0.120, 0.428] | 160 | +/+/+ |
| Consumer Discretionary | P/FCF | +0.260 | [0.108, 0.410] | 159 | +/+/+ |
| Industrials | EV/EBITDA | +0.252 | [0.056, 0.431] | 86 | -/+/+ |
| Consumer Discretionary | EpsG7 | -0.219 | [-0.356, -0.074] | 187 | -/-/- |
