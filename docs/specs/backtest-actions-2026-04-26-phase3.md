# Spec: Engine changes from Phase 3 backtests (2026-04-26)

**Status:** Phase 3 complete. **All 5 IC-derived per-super-group
presets REJECTED** by the cross-regime adoption rule. Each won at
most one regime. No engine change.

## 1. What was tested

Per `docs/specs/backtest-roadmap.md` Phase 3 E (per-super-group
preset step-2 validation). Five presets, each derived from the
2026-04-25 IC heatmap's passing cells in its target super-group:

| Preset | Target | Boost | Source IC cell(s) |
|---|---|---|---|
| utilities-health-tilt | utilities | Health 20→30% | D/EBITDA +0.58, EV/EBITDA +0.43 |
| semis-hardware-quality-tilt | semis-hardware | Quality 10→25% | EV/EBITDA +0.39, P/E +0.29, P/FCF +0.22, Accruals -0.23 |
| consumer-discretionary-deep-value | consumer-discretionary | Valuation 50→55% | EV/EBITDA +0.29, P/FCF +0.24 |
| consumer-staples-shareholder-return-tilt | consumer-staples | ShareholderReturn 10→25% | NetIssuance -0.26 |
| transport-autos-health-tilt | transport-autos | Health 20→30% | D/EBITDA -0.44 |

Each preset is tested against the §8.1 default applied to the same
super-group cohort. Adoption rule (per roadmap): preset adopted
only if it passes the §3.11.1 rule (≥1%/yr × 3y excess vs default,
CI not crossing zero) in **at least 2 of N PIT regimes**. We tested
two regimes: PIT 2018-2023 + delisted, PIT 2010-2018 + delisted.

## 2. Verdicts

| Preset | PIT 2018-23 | PIT 2010-18 | 2-of-2? | Final |
|---|---|---|---|---|
| utilities-health-tilt | -1.77 pp (reject) | +1.19 pp (reject) | 0/2 | REJECT |
| semis-hardware-quality-tilt | **+13.24 pp (adopt)** | +0.00 pp (reject) | 1/2 | REJECT |
| consumer-discretionary-deep-value | +0.78 pp (reject) | **+6.44 pp (adopt)** | 1/2 | REJECT |
| consumer-staples-shareholder-return-tilt | -3.40 pp (reject) | +4.17 pp (reject — CI crosses 0) | 0/2 | REJECT |
| transport-autos-health-tilt | -2.46 pp (reject) | -5.83 pp (reject) | 0/2 | REJECT |

**Each preset wins at most one regime.** This is the classic
regime-instability pattern the cross-regime rule was built to catch.
The two big single-regime wins (semis +13.24 pp in COVID, consumer-
discretionary +6.44 pp pre-COVID) are real signals in their
respective windows but don't generalize.

## 3. Why the IC evidence didn't translate

The IC heatmap measured rank correlation between factor percentile
and forward excess return at the *population* level within each
super-group. The validation backtest measures *top-decile selection*
performance — a tail operation. The two operate on different
signal-to-noise ratios.

Three plausible reasons:

1. **Single-regime IC is biased toward winning factors of that
   regime.** The 2026-04-25 IC heatmap was computed on the COVID-era
   PIT data; semis-hardware-quality-tilt's pre-COVID flatness
   suggests the +13.24 pp COVID-era signal was capturing the
   COVID-recovery boost specific to high-Quality semis (NVDA,
   AVGO, etc. that survived 2022-2023 drawdowns).
2. **Per-super-group sample size is small.** N per cohort × per
   snapshot ranges from ~20 to ~80 names. Top decile = ~2-8 names.
   Bootstrap CIs are wide; small differences in top-decile
   composition swing the mean excess substantially.
3. **The IC values were borderline.** None of the passing cells had
   |IC| > 0.6; most were 0.2-0.4. Translating "modest population-
   level rank correlation" into "structurally better top-decile
   selection" was always optimistic.

This is consistent with Phase 1A's REJECT (EV/EBITDA tilt within
Valuation also lost, despite being the IC heatmap's strongest single
factor). The pattern is:
- IC heatmap surfaces real cross-sectional signal in each regime
- That signal does NOT robustly translate to a winning top-decile
  candidate vs the universal default

## 4. Engine changes

**None.** The §11.5 mechanism stays in place (the per-super-group
weight resolution machinery is built and tested), but no preset is
populated. The reusable infrastructure is value for any future
candidate that DOES pass the cross-regime rule.

## 5. Spec annotations

- `ranking.md` §11.5: update "Status as of 2026-04-25" paragraph.
  Step-1 (IC evidence) found cells in 5 super-groups; step-2
  (validation, this run) rejected all 5 by the cross-regime
  adoption rule. The §11.5 hard non-goal of "no auto-derivation
  from IC" was the right call.
- `ranking.md` §11.5: explicitly call out the cross-regime
  rejection pattern as evidence that single-regime IC alone is not
  a sufficient basis for preset adoption.
- `backtest-roadmap.md`: Phase 3 marked complete with REJECT
  verdict.
- `backtest-test-log.md`: append rows for the 5 × 2 = 10 cells
  tested.

## 6. What's left in the long arc

With Phase 3 done, the original `docs/specs/backtest-roadmap.md`
plan is fully executed. Recap of all phases:

| Phase | Decision | Outcome |
|---|---|---|
| **Default migration to value-deep** | Adopt | shipped (commit `5e1d2f7`) |
| Phase 1A — In-Valuation reweighting | Reject | shipped as machinery only |
| **Phase 1C — User-picks** | Strong validation | INTC ranked 1/36 |
| Phase 2B — Combined-screen stacking | Reject | shipped as machinery only |
| **Phase 2D + 2D.1 — delisted-name handling** | Adopt | shipped (commit `c9dbf95`); §4 unblocked |
| **§4 Quality floor decision** | Pass, regime-stable | shipped as spec change |
| H12 watchlist downgrade | Adopt | shipped (commit `7d5bb00` removing fundamentalsDirection rule, plus §7 prose) |
| **fundamentalsDirection bucket rule** | Remove | shipped (commit `7d5bb00`) |
| Phase 3 — Per-super-group presets | Reject all 5 | this commit |

**Concrete production code changes from this multi-day arc:**
- DEFAULT_WEIGHTS migrated to value-deep (50/20/10/10/10/0)
- Three new factors (Accruals, Net Issuance, Momentum @ 0%)
- Super-groups module + Wikipedia history scraper + delisted-name
  recovery
- Removed: options-liquid bucket gate, fundamentalsDirection bucket
  demotion
- §4 floor stays unchanged (validated)
- §7 watchlist criteria stay unchanged (validated as
  regime-dependent short-horizon flag, prose updated)

## 7. Tier-3 follow-ups still open

From the roadmap, NOT prioritized but recorded:

- F. Top-N concentration sweep (top decile vs quintile)
- G. Within-category dominance audit (small categories)
- H. Sector vs super-group ranker cohorts
- I. Extended universe for personal holdings (NVO ADR gap)
- v3 historical-filer index (covers the 218 still-missing
  pre-2009 inactive filers)

Recommend: ship the current state, run with it for a quarter, and
let Tier-3 surface based on actual usage.
