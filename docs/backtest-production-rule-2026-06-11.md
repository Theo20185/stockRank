# Production CSP rule backtest — 2026-06-11

Re-validation of the 2026-05-13 production put-selection rule
(`packages/ranking/src/options/index.ts`), which shipped without a
backtest. The rule replaced max-time-value-yield with: strictly-OTM
strikes, ≥ 0.75 × spot cap, ≥ $10/contract premium floor, pick the
strike **closest to target** — where target = OLS-projected price at
expiry (the projections module) when trend samples allow, else spot.

Simulator: `scripts/backtest-portfolio-csp.ts`, new
`STRATEGY_MODE=production` with `PROJECTION_TARGETING=on|off`. All
other mechanics held identical to the April yield-aware run (30-day
cycles, Tasty 50% close, CC at p25 365d, parity-corrected synthetic
pricing, $65k + $2k/mo DCA, 2017-12-31 → 2026-04-22, ex-Mag-7).
Projections in-sim use the SAME `projectFromQuarterlySamples` code
path as production, fed by point-in-time quarterly samples recorded
as the sim advances (no lookahead; cold start mirrors production).

## Results

| Config | IRR | vs ex-Mag-7 (14.47%) | vs SPY (13.44%) | CSPs sold | Assigned |
|---|---|---|---|---|---|
| production, projection **on** | 12.03%/yr | **−2.44 pp** | −1.41 pp | 413 | 28.3% |
| production, projection **off** | 12.88%/yr | **−1.59 pp** | −0.56 pp | 359 | 38.2% |
| (ref) yield-aware, 2026-04-27 run | 12.97%/yr | −1.73 pp¹ | −0.47 pp | 334 | 41.3% |

¹ The April run's benchmark printed 14.70%; this rerun prints 14.47%
on the same window (snapshot universe drifted between runs — 82 vs
~80 Ranked names feeding slightly different candidate sets). Compare
configs within a run, not across runs, to the benchmark.

Outputs: `tmp/backtest-portfolio-csp-production-proj-on.json`,
`tmp/backtest-portfolio-csp-production-proj-off.json`.

## Findings

1. **Projection targeting costs ~0.85 pp/yr** (12.88 → 12.03). The
   OLS price projection drags the put strike away from near-ATM
   (where real time value peaks) toward wherever the trailing 2-year
   trend points; in recovering regimes it targets too low (less
   premium), and its assignment-avoidance (28.3% vs 38.2%) does not
   pay for the foregone income. This is the same failure shape as
   H10 (FV-trend demotion, removed in Phase 4: trend extrapolation
   is anti-predictive at turning points).
2. **The production rule with projection OFF is statistically
   indistinguishable from the April yield-aware rule** (12.88 vs
   12.97 within run-to-run universe drift). Expected: closest-to-
   current OTM ≈ max-time-value-yield because real time value peaks
   near ATM — the data-quality filters changed, not the economics.
3. **No CSP/CC configuration tested to date beats holding the same
   universe.** Both production variants, yield-aware, and wheel all
   land 1–2.5 pp/yr below ex-Mag-7 equal-weight with identical DCA.
   Consistent with the 2026-06-11 weight-validation barbell run
   (`docs/backtest-weight-validation-2026-06-11.md`): VOO+CSP
   statics all rejected, and after blended taxes the gap widens
   (premium income is STCG).

## Caveats

Synthetic premiums (trailing-30d realized vol, no variance risk
premium, no skew, no spreads/commissions) — these runs RANK
configurations; they do not measure absolute alpha. The dated chain
archive (`data/options-archive/`, started 2026-06-11) exists to make
a real-premium rerun possible in 6–12 months.

## Action

- Default the Plan screen / strike selection to **projection OFF for
  put-strike targeting** (keep projections as display-only context),
  or re-validate with real premiums once the archive matures.
- §3.3's strike rule itself (OTM-only + floors + closest-to-current)
  is fine to keep: it matches yield-aware economics with honest
  data filters.
