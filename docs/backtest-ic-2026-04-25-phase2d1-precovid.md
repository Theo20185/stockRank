# IC analysis — 2026-04-25

**Calibration:** `calibration.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 2 | 223 | 0 | 4 | 43 |
| 3y | 6 | 217 | 0 | 6 | 43 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | +0.801 | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | +0.694 | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.801 | [0.448, 0.889] | 10 | +/+/+ |
| Energy | Accr | +0.694 | [-0.121, 0.907] | 7 | +/?/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | -0.502 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | +0.525 | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | -0.849 | — | — | — | +0.849 | — | +0.870 | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | -0.705 | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.870 | [0.703, 0.892] | 10 | +/+/+ |
| Banks & Lending | EV/EBITDA | -0.849 | [-0.989, -0.416] | 7 | ?/-/- |
| Banks & Lending | D/EBITDA | +0.849 | [0.416, 0.989] | 7 | ?/+/+ |
| Capital Markets | IntCov | -0.705 | [-0.852, -0.386] | 26 | -/-/- |
| Semiconductors & Hardware | Accr | +0.525 | [0.180, 0.750] | 27 | +/+/+ |
| Software & Internet | P/E | -0.502 | [-0.678, -0.278] | 67 | -/-/- |
