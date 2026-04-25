# IC analysis — 2026-04-25

**Calibration:** `calibration.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 5 | 231 | 0 | 0 | 36 |
| 3y | 10 | 226 | 0 | 0 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.382 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
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
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | +0.423 | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | +0.470 | — | — | — | -0.572 | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Media & Telecom | Accr | -0.572 | [-0.778, -0.279] | 27 | -/-/- |
| Media & Telecom | D/EBITDA | +0.470 | [0.018, 0.794] | 23 | ?/+/+ |
| Transportation & Autos | BBY | +0.423 | [0.209, 0.602] | 62 | +/+/+ |
| Utilities | EV/EBITDA | +0.385 | [0.064, 0.639] | 39 | +/+/+ |
| Software & Internet | D/EBITDA | +0.382 | [0.188, 0.553] | 90 | +/+/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.391 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | +0.344 | — | +0.297 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.573 | — | — | — | +0.575 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.259 | +0.273 | — | +0.306 | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | -0.442 | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | +0.488 | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Utilities | D/EBITDA | +0.575 | [0.295, 0.758] | 39 | +/+/+ |
| Utilities | EV/EBITDA | +0.573 | [0.312, 0.747] | 39 | +/+/+ |
| Media & Telecom | DivG5 | +0.488 | [0.090, 0.764] | 24 | +/+/+ |
| Transportation & Autos | D/EBITDA | -0.442 | [-0.677, -0.130] | 36 | +/-/- |
| Software & Internet | D/EBITDA | +0.391 | [0.217, 0.564] | 90 | +/+/+ |
| Semiconductors & Hardware | EV/EBITDA | +0.344 | [0.142, 0.520] | 88 | +/+/+ |
| Industrials | P/B | +0.306 | [0.184, 0.438] | 239 | +/+/+ |
| Semiconductors & Hardware | P/E | +0.297 | [0.081, 0.484] | 102 | +/+/+ |
| Industrials | P/FCF | +0.273 | [0.125, 0.426] | 159 | +/+/+ |
| Industrials | EV/EBITDA | +0.259 | [0.073, 0.435] | 85 | -/+/+ |
