# IC analysis — 2026-11-03

**Calibration:** `backtest-ic-calibration-2026-11-03.md` — per-cell statistical thresholds derived from Monte Carlo Phase 0 (backtest.md §3.10.1).

**Survivorship-bias caveat:** the universe is today's S&P 500. Realized returns are biased upward by an unknown amount (literature suggests 1–2%/yr). Phase 2b (point-in-time membership) is not yet built.

## Summary

| Horizon | Passing | Fail (statistical) | Fail (economic) | Fail (sign-stability) | Fail (insufficient data) |
|---|---|---|---|---|---|
| 1y | 12 | 378 | 0 | 1 | 34 |
| 3y | 38 | 352 | 0 | 1 | 34 |

## Heatmap — 1y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | — | — | — | — | — | — | — | -0.173 | +0.165 | — | — | — | — | — | — | — |
| Semiconductors & Hardware | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Pharma & Biotech | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | — | — | — | +0.142 | — |
| Healthcare Services | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | +0.407 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Energy | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.174 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | -0.174 | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | -0.164 | — | — | — | — | — | — | — | — | — | — | — | — |
| Media & Telecom | — | — | — | — | — | — | — | — | -0.335 | — | — | — | — | — | — | — |

### 1y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Insurance | EV/EBITDA | +0.407 | [0.135, 0.605] | 34 | ?/+/+ |
| Media & Telecom | Accr | -0.335 | [-0.500, -0.139] | 107 | -/-/- |
| REITs & Real Estate | GP/A | +0.212 | [-0.034, 0.451] | 75 | +/+/+ |
| Transportation & Autos | GMTrend | +0.208 | [-0.010, 0.402] | 98 | +/+/+ |
| Industrials | EV/EBITDA | +0.174 | [0.035, 0.313] | 224 | +/+/+ |
| Materials & Construction | IntCov | -0.174 | [-0.286, -0.069] | 328 | -/-/- |
| Software & Internet | ROIC | -0.173 | [-0.274, -0.058] | 301 | -/-/+ |
| Software & Internet | Accr | +0.165 | [0.053, 0.271] | 319 | +/+/+ |
| Consumer Discretionary | P/B | -0.164 | [-0.251, -0.070] | 431 | -/-/- |
| Consumer Discretionary | D/EBITDA* | +0.154 | [0.047, 0.257] | 363 | +/+/+ |
| Healthcare Equipment & Diagnostics | IntCov* | +0.145 | [0.026, 0.269] | 271 | -/+/+ |
| Healthcare Equipment & Diagnostics | EpsG7 | +0.142 | [0.018, 0.258] | 271 | +/+/+ |

## Heatmap — 3y horizon

Cells render the IC value when all three gates of §3.10 pass; otherwise `—`. See drill-down table for per-cell verdicts.

| Super-group | EV/EBITDA | P/FCF | P/E | P/B | D/EBITDA | CurR | IntCov | ROIC | Accr | DivY | BBY | DivG5 | NetIss | RevG7 | EpsG7 | Mom12-1 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Software & Internet | -0.171 | — | — | — | — | — | — | — | +0.154 | — | — | — | — | — | -0.173 | — |
| Semiconductors & Hardware | -0.170 | — | — | — | — | — | — | — | — | — | — | — | — | +0.176 | — | — |
| Pharma & Biotech | — | — | — | -0.333 | — | — | — | — | — | — | — | — | — | — | — | — |
| Healthcare Equipment & Diagnostics | — | — | — | — | — | — | — | — | — | — | — | +0.172 | — | — | — | — |
| Healthcare Services | — | — | +0.254 | — | -0.285 | — | — | — | — | — | — | — | — | — | — | — |
| Banks & Lending | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Capital Markets | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Insurance | +0.500 | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| REITs & Real Estate | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Utilities | — | — | — | — | — | — | — | — | — | — | — | — | — | — | +0.217 | — |
| Energy | — | +0.204 | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Industrials | +0.340 | +0.174 | — | — | — | — | — | — | — | — | +0.169 | — | — | — | — | — |
| Materials & Construction | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Transportation & Autos | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Consumer Staples | — | — | — | — | — | — | +0.159 | — | — | — | — | — | — | — | — | — |
| Consumer Discretionary | — | — | — | -0.195 | — | — | — | — | — | — | — | — | — | -0.143 | — | — |
| Media & Telecom | -0.353 | — | — | — | — | — | — | — | — | — | — | +0.344 | — | — | — | — |

### 3y — passing cells

| Super-group | Factor | IC | 95% CI | N | Sign-stability |
|---|---|---|---|---|---|
| Insurance | GP/A | +0.595 | [0.066, 0.869] | 16 | ?/+/+ |
| Insurance | EV/EBITDA | +0.500 | [0.174, 0.748] | 34 | ?/+/+ |
| Transportation & Autos | GMTrend | +0.436 | [0.284, 0.575] | 98 | +/+/+ |
| Media & Telecom | GP/A | +0.396 | [0.133, 0.616] | 44 | +/+/+ |
| Media & Telecom | P/E* | -0.365 | [-0.534, -0.162] | 103 | -/-/- |
| Media & Telecom | EV/EBITDA | -0.353 | [-0.529, -0.162] | 82 | -/-/- |
| Media & Telecom | DivG5 | +0.344 | [0.139, 0.522] | 95 | +/+/+ |
| Industrials | EV/EBITDA | +0.340 | [0.215, 0.453] | 223 | +/+/+ |
| Pharma & Biotech | P/B | -0.333 | [-0.468, -0.181] | 157 | -/-/- |
| Media & Telecom | GMTrend | +0.332 | [0.037, 0.590] | 42 | +/+/+ |
| Healthcare Services | D/EBITDA | -0.285 | [-0.476, -0.040] | 77 | -/-/- |
| Transportation & Autos | RI-V/P | -0.283 | [-0.409, -0.151] | 204 | -/-/- |
| Healthcare Services | GP/A | -0.271 | [-0.461, -0.060] | 85 | -/+/- |
| Healthcare Services | P/E | +0.254 | [0.095, 0.415] | 137 | +/+/+ |
| Pharma & Biotech | GMTrend | +0.219 | [0.015, 0.404] | 90 | +/+/+ |
| Industrials | EV/EBITDA* | +0.218 | [0.124, 0.304] | 462 | +/+/+ |
| Utilities | EpsG7 | +0.217 | [0.103, 0.329] | 309 | +/+/+ |
| REITs & Real Estate | GP/A | +0.214 | [-0.009, 0.425] | 75 | -/+/+ |
| Transportation & Autos | GP/A | +0.205 | [0.052, 0.371] | 126 | +/+/+ |
| Energy | P/FCF | +0.204 | [0.009, 0.380] | 112 | +/+/+ |
| Software & Internet | EpsG7* | -0.202 | [-0.319, -0.075] | 246 | -/-/- |
| Consumer Discretionary | P/B | -0.195 | [-0.285, -0.106] | 430 | -/-/- |
| Semiconductors & Hardware | RevG7 | +0.176 | [0.064, 0.292] | 308 | -/+/+ |
| Consumer Staples | IntCov* | +0.174 | [0.064, 0.288] | 337 | -/+/+ |
| Industrials | P/FCF | +0.174 | [0.062, 0.282] | 299 | +/-/+ |
| Software & Internet | EpsG7 | -0.173 | [-0.289, -0.053] | 322 | -/-/+ |
| Healthcare Equipment & Diagnostics | DivG5 | +0.172 | [0.009, 0.332] | 163 | +/+/+ |
| Software & Internet | EV/EBITDA | -0.171 | [-0.310, -0.038] | 221 | -/-/- |
| Semiconductors & Hardware | EV/EBITDA | -0.170 | [-0.309, -0.022] | 197 | -/-/- |
| Industrials | BBY | +0.169 | [0.070, 0.264] | 477 | +/+/+ |
| Semiconductors & Hardware | EV/EBITDA* | -0.169 | [-0.286, -0.059] | 324 | -/-/- |
| Materials & Construction | EpsG7* | +0.164 | [0.037, 0.282] | 246 | -/+/+ |
| Consumer Staples | IntCov | +0.159 | [0.044, 0.280] | 337 | -/+/+ |
| Software & Internet | Accr | +0.154 | [0.049, 0.259] | 317 | +/+/- |
| Consumer Staples | GP/A | +0.149 | [0.046, 0.257] | 374 | -/+/+ |
| Consumer Discretionary | RevG7 | -0.143 | [-0.238, -0.049] | 462 | -/-/- |
| Consumer Staples | D/EBITDA* | +0.137 | [0.020, 0.250] | 343 | -/+/+ |
| Consumer Staples | ROIC* | +0.132 | [0.028, 0.233] | 404 | -/+/+ |
