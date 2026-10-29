# IC analysis — 2026-10-29

**Calibration:** `backtest-ic-calibration-2026-10-29.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 8 | 228 | 0 | 0 | 36 |
| 3y | 15 | 221 | 0 | 0 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | — | +0.171 | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | +0.187 | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | +0.439 | — | — | — | — | — | — | — | — | — |
| Capital Markets | -0.262 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.163 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | -0.224 | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | -0.165 | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | -0.397 | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.439 | [0.165, 0.658] | 34 | +/+/+ |
| Media & Telecom | Accr | -0.397 | [-0.584, -0.183] | 74 | -/-/- |
| Capital Markets | EV/EBITDA | -0.262 | [-0.513, 0.005] | 55 | -/-/- |
| Materials & Construction | IntCov | -0.224 | [-0.357, -0.092] | 260 | -/-/- |
| Semiconductors & Hardware | RevG7 | +0.187 | [0.027, 0.345] | 162 | +/-/+ |
| Software & Internet | Accr | +0.171 | [0.034, 0.299] | 208 | +/+/+ |
| Consumer Discretionary | P/B | -0.165 | [-0.255, -0.066] | 430 | -/-/- |
| Industrials | EV/EBITDA | +0.163 | [0.003, 0.296] | 212 | +/+/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | — | — | — | — | — | — | — | -0.187 | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | +0.275 | — | — |
| Pharma & Biotech | — | — | — | -0.326 | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | +0.624 | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | -0.343 | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | +0.215 | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.362 | +0.181 | — | — | — | — | — | — | — | — | +0.168 | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | -0.217 | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | +0.162 | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | -0.190 | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | -0.370 | — | — | — | — | — | — | — | -0.311 | — | — | +0.374 | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.624 | [0.420, 0.777] | 34 | +/+/+ |
| Media & Telecom | DivG5 | +0.374 | [0.164, 0.563] | 82 | +/+/+ |
| Media & Telecom | EV/EBITDA | -0.370 | [-0.564, -0.135] | 67 | -/-/- |
| Industrials | EV/EBITDA | +0.362 | [0.239, 0.469] | 211 | +/+/+ |
| Capital Markets | IntCov | -0.343 | [-0.536, -0.119] | 78 | -/-/- |
| Pharma & Biotech | P/B | -0.326 | [-0.463, -0.176] | 157 | -/-/- |
| Media & Telecom | Accr | -0.311 | [-0.515, -0.086] | 74 | -/+/- |
| Semiconductors & Hardware | RevG7 | +0.275 | [0.132, 0.431] | 162 | -/+/+ |
| Materials & Construction | IntCov | -0.217 | [-0.340, -0.094] | 260 | -/+/- |
| Utilities | EpsG7 | +0.215 | [0.101, 0.327] | 309 | +/+/+ |
| Consumer Discretionary | P/B | -0.190 | [-0.282, -0.098] | 430 | -/-/- |
| Software & Internet | EpsG7 | -0.187 | [-0.297, -0.067] | 322 | -/-/+ |
| Industrials | P/FCF | +0.181 | [0.052, 0.302] | 243 | +/-/+ |
| Industrials | BBY | +0.168 | [0.068, 0.263] | 477 | +/+/+ |
| Consumer Staples | IntCov | +0.162 | [0.037, 0.291] | 306 | -/+/+ |
