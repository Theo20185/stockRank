# IC analysis — 2026-08-21

**Calibration:** `backtest-ic-calibration-2026-08-21.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 6 | 229 | 0 | 1 | 36 |
| 3y | 15 | 219 | 0 | 2 | 36 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | -0.203 | — | — | — | +0.226 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | -0.223 | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | +0.594 | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.341 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | -0.259 | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.594 | [0.178, 0.846] | 16 | +/+/+ |
| Utilities | EV/EBITDA | +0.341 | [0.049, 0.593] | 42 | -/+/+ |
| Materials & Construction | IntCov | -0.259 | [-0.420, -0.096] | 164 | -/+/- |
| Software & Internet | D/EBITDA | +0.226 | [0.057, 0.389] | 139 | +/+/+ |
| Semiconductors & Hardware | P/E | -0.223 | [-0.377, -0.072] | 161 | -/-/- |
| Software & Internet | EV/EBITDA | -0.203 | [-0.357, -0.036] | 139 | -/-/- |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | +0.250 | — | — | — | — | — | — | — | — | — | — | — |
| Semiconductors & Hardware | -0.222 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | +0.311 | — | — | — | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | +0.652 | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | -0.561 | -0.461 | — | — | — | — | — | — | — | — |
| Insurance | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | +0.628 | — | — | — | +0.606 | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.206 | +0.197 | — | — | -0.194 | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | -0.256 | — | -0.247 | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | +0.197 | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | — | — | — | — | — | — | — | — | -0.194 | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Banks & Lending | IntCov | +0.652 | [0.260, 0.850] | 16 | +/+/+ |
| Utilities | EV/EBITDA | +0.628 | [0.379, 0.783] | 42 | +/+/+ |
| Utilities | D/EBITDA | +0.606 | [0.345, 0.789] | 42 | +/+/+ |
| Capital Markets | IntCov | -0.561 | [-0.731, -0.333] | 52 | -/-/- |
| Capital Markets | ROIC | -0.461 | [-0.600, -0.308] | 119 | -/-/- |
| Healthcare Equipment & Diagnostics | DivG5 | +0.311 | [-0.063, 0.608] | 38 | ?/+/+ |
| Materials & Construction | IntCov | -0.256 | [-0.385, -0.112] | 164 | -/-/- |
| Software & Internet | D/EBITDA | +0.250 | [0.071, 0.422] | 138 | +/+/+ |
| Materials & Construction | Accr | -0.247 | [-0.436, -0.045] | 89 | ?/-/- |
| Semiconductors & Hardware | EV/EBITDA | -0.222 | [-0.374, -0.053] | 153 | -/-/- |
| Industrials | EV/EBITDA | +0.206 | [0.052, 0.354] | 136 | -/+/+ |
| Industrials | P/FCF | +0.197 | [0.078, 0.318] | 257 | +/+/+ |
| Consumer Staples | IntCov | +0.197 | [0.032, 0.354] | 151 | +/+/+ |
| Industrials | D/EBITDA | -0.194 | [-0.359, -0.018] | 136 | +/-/- |
| Consumer Discretionary | DivG5 | -0.194 | [-0.353, -0.022] | 120 | -/-/- |
