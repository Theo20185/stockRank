# IC analysis — 2026-04-25

**Calibration:** `calibration.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 3 | 217 | 0 | 6 | 46 |
| 3y | 7 | 213 | 0 | 6 | 46 |

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
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | +0.694 | — | — | — | — | +0.722 | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | -0.602 | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Energy | RevG7 | +0.722 | [0.000, 0.907] | 7 | +/?/+ |
| Energy | Accr | +0.694 | [-0.121, 0.907] | 7 | +/?/+ |
| Consumer Discretionary | Accr | -0.602 | [-0.901, -0.015] | 12 | -/?/- |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | -0.421 | — | -0.512 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | +0.527 | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | -0.849 | — | — | — | +0.849 | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | -0.705 | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | -0.595 | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | EV/EBITDA | -0.849 | [-0.989, -0.416] | 7 | ?/-/- |
| Banks & Lending | D/EBITDA | +0.849 | [0.416, 0.989] | 7 | ?/+/+ |
| Capital Markets | IntCov | -0.705 | [-0.852, -0.386] | 26 | -/-/- |
| Consumer Discretionary | Accr | -0.595 | [-0.877, -0.053] | 12 | -/?/- |
| Semiconductors & Hardware | Accr | +0.527 | [0.165, 0.755] | 26 | +/+/+ |
| Software & Internet | P/E | -0.512 | [-0.699, -0.300] | 66 | -/-/- |
| Software & Internet | EV/EBITDA | -0.421 | [-0.672, -0.129] | 42 | -/-/- |
