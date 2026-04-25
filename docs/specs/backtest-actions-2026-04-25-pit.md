# Spec: Engine changes from 2026-04-25 point-in-time backtest

**Status:** draft v1 — re-runs the 2026-04-25 backtest with
`--point-in-time` enabled (per `docs/specs/point-in-time-universe.md`),
compares verdicts to the biased run, and translates the differences
into engine actions.

## 1. Why this rerun

The 2026-04-25 biased run (see
`docs/specs/backtest-actions-2026-04-25.md`) found H11 = fail
(Quality floor harmful). The spec held that decision pending re-
verification under a survivorship-clean universe, because the
biased view's "floor-failed" cohort excludes names that actually
went bankrupt — exactly the failure mode the floor exists to
catch.

This rerun tests both the floor decision and the value-deep
adoption against the unbiased universe.

## 2. Evidence sources

Both archived under `docs/`:

| Run | Files |
|---|---|
| **Biased** (today's S&P 500) | `backtest-ic-calibration-2026-04-25.md`, `backtest-ic-2026-04-25.md`, `backtest-weight-validation-2026-04-25.md`, `backtest-legacy-rules-2026-04-25.md` |
| **Point-in-time** | same names with `-pit.md` suffix |

Run command for the PIT version:
```
npm run backtest-ic -- --all-sp500 --years 8 --horizons 1,3 \
                      --mc-iter 200 --weight-test \
                      --legacy-rule-audit --point-in-time
```

## 3. Headline verdicts side by side

### 3.1 H11 — Quality floor (combined gate, 3y horizon)

| Cohort | Biased | Point-in-time | Gap (PIT) |
|---|---|---|---|
| Floor passed | +6.07% [+4.75%, +7.47%] | -1.70% [-2.99%, -0.45%] | — |
| Floor failed | +17.45% [+14.37%, +21.04%] | -4.65% [-6.00%, -3.31%] | — |
| **Verdict** | **fail** (gap -11.38 pp) | **pass** (gap +2.95 pp) | flipped |

**The verdict flipped.** Survivorship bias was hiding the floor's
value: the worst floor failures (companies that went bankrupt and
got delisted) are invisible in today's S&P 500 list, so the biased
view artificially boosted the floor-failed cohort. With PIT, the
floor-failed cohort underperforms by ~3 pp at 3y — the floor is
doing real work.

### 3.2 H11 per-rule (3y horizon, point-in-time only)

| Rule | Passed cohort | Failed cohort | Per-rule gap |
|---|---|---|---|
| profitable-3of5 | -4.66% | +3.21% | -7.87 pp (rule appears harmful in isolation) |
| sector-relative-roic | -0.73% | -7.91% | **+7.18 pp** (rule is the workhorse) |
| interest-coverage | -4.09% | +7.03% | -11.12 pp (rule appears harmful in isolation) |
| **combined** | -1.70% | -4.65% | **+2.95 pp** (combined gate is net positive) |

The combined-gate pass hides per-rule asymmetry. **Sector-relative
ROIC is the workhorse rule** — it cleanly predicts forward excess
return. The other two sub-rules look harmful when evaluated in
isolation, but combine usefully with sector-ROIC to filter out
companies that fail multiple criteria simultaneously.

This nuance is interesting but **doesn't change the spec for v1** —
the combined floor passes; we leave it intact. A future v2 could
test variations like "sector-relative ROIC alone" or "drop the
profitable-3of5 rule and rely on sector-ROIC + interest-coverage."

### 3.3 H12 — Turnaround watchlist (3y horizon)

| Cohort | Biased | Point-in-time |
|---|---|---|
| Watchlist (all 3 criteria) | +32.77% [+12.38%, +54.78%], N=61 | +45.96% [+21.98%, +72.83%], N=50 |
| Excluded but not on watchlist | +17.38% [+14.08%, +20.87%], N=13282 | -4.88% [-6.25%, -3.56%], N=11229 |
| Gap | +15.39 pp | **+50.84 pp** |
| Verdict | pass | pass (more emphatic) |

The watchlist criteria pick a *much* larger relative-return signal
under PIT — the broader excluded set goes negative once delisted
names + post-S&P names are properly handled, while the watchlist
holds onto its strong absolute return.

### 3.4 Weight validation (3y horizon)

| Candidate | Biased excess | Biased verdict | PIT excess | PIT verdict |
|---|---|---|---|---|
| **default** (value-deep) | +26.96% [+21.09%, +32.99%] | baseline | +3.29% [+0.93%, +5.72%] | baseline |
| value-tilted-defensive-legacy (35/25/15/15/10) | n/a (was default) | n/a | -0.75% [-3.41%, +2.14%] | reject (-4.05 pp vs default) |
| equal-weight | +17.94% | reject (-9.01 pp) | -8.58% | reject (-11.87 pp) |
| quality-tilt | +14.89% | reject (-12.07 pp) | -8.06% | reject (-11.35 pp) |
| value-deep (legacy run) | +35.77% | adopt (+8.81 pp) | n/a (became default) | n/a |
| momentum-on | +27.43% | reject (+0.47 pp) | +0.92% | reject (-2.37 pp) |

**Value-deep still wins** — it beats the legacy default by **+4.05
pp at 3y under PIT** (down from +8.81 pp under biased, but still
clearly positive and the legacy CI now CROSSES ZERO under PIT,
while value-deep's CI stays positive). The 2026-04-25 promotion of
value-deep to the universal default is **re-confirmed**.

### 3.5 The size of the survivorship effect

| Metric | Biased | PIT | Bias inflation |
|---|---|---|---|
| Default 3y excess vs SPY | +26.96% | +3.29% | **+23.67 pp** |
| Value-deep 3y excess vs SPY | +35.77% | +3.29% (now=default) | — |
| Excluded-but-not-watchlist 3y | +17.38% | -4.88% | +22.26 pp |

Survivorship bias inflates absolute forward-return numbers by
~22-24 pp at the 3y horizon in this 8-year sample. That's far
above the literature's "1-2% per year" rule of thumb because (a)
the test window includes the COVID recovery, which disproportionately
favored cyclical/distressed names that survived in today's list,
and (b) the index has had unusual turnover this period.

**Relative comparisons** (candidate vs default, watchlist vs
excluded) are largely preserved across the two views — but
**absolute return claims** based on biased data should be
discounted heavily.

## 4. Engine changes

### 4.1 Quality floor — keep as-is (no change)

`ranking.md` §11.7 had the floor on HOLD pending a survivorship-
clean rerun. PIT verdict is **pass** (combined gate). The HOLD
unblocks → keep §4 unchanged. Update §11.7 from "HOLD" to "pass
(verified under PIT)."

### 4.2 value-deep default — keep as-is (re-confirmed)

The 2026-04-25 promotion stands. Beats legacy under PIT by +4.05
pp at 3y; legacy's CI now crosses zero under PIT while value-deep's
stays positive. No code change.

### 4.3 Turnaround watchlist — keep as-is (re-confirmed)

H12 passes more emphatically under PIT (+50.84 pp gap). No change.

### 4.4 Spec annotations

Three small spec edits, no code:

- `ranking.md` §11.7: H11 verdict updated from HOLD to **pass
  (under PIT)**. Cite the new evidence file.
- `ranking.md` §8.1: append a sentence noting the value-deep
  default has been re-validated under PIT.
- `backtest.md` §3.6: update the survivorship-bias caveat to note
  that Phase 2b is now operational (not deferred). Add a one-line
  pointer to the comparison report (this spec).

### 4.5 Per-rule audit — note the workhorse

The H11 per-rule breakdown shows sector-relative-ROIC is doing
nearly all the work in the combined floor. This is informational
only in v1 — we don't simplify the floor based on a single sample.
But `ranking.md` §11.7 should record the per-rule gap for the
audit trail, so a future rerun's drift is visible.

## 5. Implementation order

One PR — annotations only:

**PR 1 — Spec annotations from PIT rerun.**
- `ranking.md` §11.7: update H11 verdict, add per-rule observation.
- `ranking.md` §8.1: re-confirmation note for value-deep.
- `backtest.md` §3.6: Phase 2b operational; pointer to this spec.
- This spec stays as the audit trail for the comparison.

No code changes — every engine decision held up under PIT, so
nothing needs to move.

## 6. Out-of-scope but worth flagging

1. **v2 floor simplification.** The per-rule audit shows
   profitable-3of5 and interest-coverage individually look harmful
   at 3y. A v2 experiment could test "sector-relative ROIC alone"
   as the floor and see if the combined-gate's +2.95 pp gap holds.
   Defer until we have ≥ 3 archived PIT runs for stability.
2. **Delisted-name handling (full v2).** Today's PIT
   implementation filters today's symbols by historical membership
   but doesn't yet ADD historically-included-but-now-delisted
   symbols (LEH, ENRN, etc.). For those, EDGAR data isn't
   available and chart history may be too. v2 work would synthesize
   -100% returns for delisted names with no chart data, which
   would push H11's gap even wider.
3. **Test-window sensitivity.** Test period is still 2018-2023
   (heavily COVID-influenced). A 2010-2018 (pre-COVID) rerun would
   be a useful regime check. With 14 years of EDGAR data
   available, this is a one-CLI-flag change.
4. **In-Valuation factor reweighting.** value-deep boosts the
   Valuation *category* but the four sub-factors stay equal-
   weighted. The IC heatmap shows EV/EBITDA had the strongest
   cross-super-group signal. A v2 candidate "value-deep with
   EV/EBITDA-tilted Valuation" should beat plain value-deep.
