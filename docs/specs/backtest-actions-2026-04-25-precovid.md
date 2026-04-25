# Spec: Engine changes from pre-COVID regime check (2010-2018, PIT)

**Status:** draft v1 — third backtest run on 2026-04-25, this one
restricted to a pre-COVID window (snapshots 2011-01 through
2018-12, test period 2016-01 through 2018-12). Compares verdicts
to the 2018-2023 PIT run from earlier today.

## 1. Why

The 2018-2023 PIT run (`backtest-actions-2026-04-25-pit.md`)
re-confirmed value-deep as default and flipped H11 from `fail` to
`pass`. But the test window included COVID — a major recession +
recovery — and the spec §6 flagged "pre-COVID regime check" as
the cheapest sanity test once the `--max-snapshot-date` flag
existed.

This rerun answers: are the 2018-2023 PIT verdicts robust to a
different regime, or were they COVID-recovery artifacts?

**The answer: the value-deep default is robust, but H11 and H12
flipped back to FAIL.** Read on.

## 2. Setup

```
npm run backtest-ic -- --all-sp500 --years 16 \
                      --max-snapshot-date 2018-12-31 \
                      --test-period-start 2016-01-01 \
                      --horizons 1,3 --mc-iter 200 \
                      --weight-test --legacy-rule-audit \
                      --point-in-time
```

- 503 symbols (today's S&P 500), filtered by Wikipedia
  point-in-time membership at each backtest date.
- 96 monthly snapshots from 2011-01 through 2018-12 (6,048
  potential observations per horizon, after dedup ~4× that
  effective N).
- 63,120 IC observations.
- Test period for weight validation: 2016-01-01 through 2018-12-31
  (3 years). Train period: 2011-01 through 2016-01 (5 years).

Evidence files: `docs/backtest-*-2026-04-25-precovid.md`.

## 3. Headline verdicts side by side (3 runs)

### 3.1 H11 — Quality floor combined gate (3y)

| Run | Passed cohort | Failed cohort | Gap | Verdict |
|---|---|---|---|---|
| Biased 2018-2023 | +6.07% | +17.45% | -11.38 pp | fail |
| **PIT 2018-2023** | **-1.70%** | **-4.65%** | **+2.95 pp** | **pass** |
| **PIT 2010-2018 (pre-COVID)** | **+4.99%** | **+7.31%** | **-2.32 pp** | **fail** |

Two regimes, two verdicts. The PIT 2018-2023 PASS verdict was
**not robust** to the pre-COVID window. The Quality floor's
apparent value in the 2018-2023 sample was a COVID-recovery
artifact: the worst floor failures (companies that survived COVID
and bounced) made the floor-failed cohort look bad in 2018-2023,
but in the steadier 2010-2018 sample the floor-failed cohort
slightly outperforms.

**Implication:** the Quality floor combined gate has **no robust
forward-return predictive power** in this universe across the two
PIT regimes we've tested. The floor's value is regime-dependent.

### 3.2 H11 per-rule (3y, both PIT runs)

| Rule | PIT 2018-2023 gap | PIT 2010-2018 gap | Direction stable? |
|---|---|---|---|
| profitable-3of5 | -7.87 pp (harmful) | **+3.17 pp** (helpful) | **NO** — flipped |
| sector-relative-roic | **+7.18 pp** (helpful) | **-6.48 pp** (harmful) | **NO** — flipped |
| interest-coverage | -11.12 pp (harmful) | -2.28 pp (slightly harmful) | yes (same direction, smaller) |

Two of the three sub-rules **flipped sign** between regimes. The
sector-relative-ROIC rule was the workhorse in 2018-2023 (+7.18
pp) but the worst in 2010-2018 (-6.48 pp). This is exactly the
regime-dependence pattern that real factor-investing literature
warns about.

**Implication:** none of the three sub-rules has a regime-stable
predictive signal at 3y. The combined floor's apparent
2018-2023-PIT signal was driven by the temporary alignment of
the three rules in the COVID-recovery window.

### 3.3 H12 — Turnaround watchlist (3y)

| Run | Watchlist | Excluded-not-watchlist | Gap | Verdict |
|---|---|---|---|---|
| Biased 2018-2023 | +32.77% | +17.38% | +15.39 pp | pass |
| PIT 2018-2023 | +45.96% | -4.88% | +50.84 pp | pass |
| **PIT 2010-2018** | **-5.76%** | **+7.38%** | **-13.15 pp** | **fail** |

The watchlist also fails outside COVID. Watchlist N=79 in the
pre-COVID window, with a wide CI [-20.04%, +8.59%] crossing zero.

**Important sub-result:** at the 1y horizon the watchlist still
strongly outperforms in pre-COVID (+22.99% vs +3.19%, gap +19.8
pp). The signal is real at 1y but reverses by 3y. This suggests
turnaround names get a bounce that doesn't sustain — exactly the
opposite of the §7 spec's hold-for-the-long-term thesis.

### 3.4 Weight validation (3y)

| Candidate | PIT 2018-2023 vs default | PIT 2010-2018 vs default | Direction stable? |
|---|---|---|---|
| value-tilted-defensive-legacy (35/25/15/15/10) | -4.05 pp (reject) | -5.72 pp (reject) | yes |
| equal-weight | -11.87 pp (reject) | -8.42 pp (reject) | yes |
| quality-tilt | -11.35 pp (reject) | -8.22 pp (reject) | yes |
| momentum-on | -2.37 pp (reject) | +0.22 pp (reject) | yes (both within noise of default) |

**value-deep wins both regimes.** The 4-5 pp advantage over the
legacy default is robust. This is the one finding that holds up
across our three runs.

### 3.5 Survivorship-bias size by regime

| Universe | Default 3y excess (PIT 2018-2023) | Default 3y excess (PIT 2010-2018) |
|---|---|---|
| value-deep top decile | +3.29% | +8.29% |
| Bias delta vs biased view | -23.67 pp | not measured (no biased-2010-2018 run yet) |

The 2018-2023 "noise" FDR ratio became 3.5× in 2010-2018
("marginal"). More signal density in pre-COVID — the cleaner
regime amplifies real factor predictability while the COVID
window drowns it in distress-recovery noise.

## 4. Engine changes

### 4.1 Quality floor — REVISIT

The PIT 2018-2023 PASS verdict was the basis for keeping §4
intact. With pre-COVID FAIL, the floor's signal is **not regime-
stable**. Three options:

**Option A — drop the floor entirely.** The combined gate has no
robust predictive power; let all names through and rely on the
ranker to surface the good ones. Pro: simpler, removes a rule
that may be cargo-cult; con: floor exists for non-return reasons
too (e.g., excluding obvious junk to keep the candidate list
manageable for human review).

**Option B — weaken the floor to a manual review filter.** Keep
the floor but treat it as informational, not a hard exclusion.
Names below the floor stay in the rankings but get a warning
flag. Pro: preserves the human-review value; con: complicates
the bucket classifier.

**Option C — wait for more regime samples before acting.** Two
PIT regimes is a small sample. A third regime test (e.g., a
2008-2010 financial-crisis window or a 2003-2007 mid-cycle
window) would give us three independent verdicts. If 2 of 3 fail,
act; if 2 of 3 pass, keep.

**Recommended: Option C.** We don't have enough regime samples
to drop a long-standing rule. Mark §4 as "evidence: regime-
dependent" in §11.7 and schedule the additional regime tests.

### 4.2 Turnaround watchlist — REVISIT, similar to §4.1

The 1y signal is real and consistent across regimes (always
positive). The 3y signal is regime-dependent — strong in COVID
recovery, negative in pre-COVID.

**Implication:** the §7 watchlist is a **short-horizon trade
flag**, not a long-term hold thesis. The spec language ("evaluate
qualitatively, the user does the rest") is actually consistent
with this — the watchlist surfaces names worth evaluating
manually for short-term trades, not for buy-and-hold.

**Recommended:** update `ranking.md` §7 prose to clarify that the
watchlist is a short-horizon (1y or shorter) signal, not a 3y
hold thesis. No code change.

### 4.3 value-deep default — KEEP (re-re-confirmed)

Wins both PIT regimes by 4-5 pp at 3y vs legacy. No change.

### 4.4 Spec annotations

- `ranking.md` §11.7: H11 verdict from "pass (under PIT)" to
  "**regime-dependent — pass under PIT 2018-2023, fail under PIT
  2010-2018**." Recommend Option C (more regime samples before
  acting).
- `ranking.md` §11.7: H12 same — pass-then-fail across regimes;
  signal is short-horizon only.
- `ranking.md` §7: append paragraph noting the watchlist is a
  short-horizon flag. Spec language already implicitly supports
  this; make it explicit.
- `docs/specs/backtest-test-log.md`: append rows for this run.

## 5. Implementation

One PR — annotations only. No code changes.

## 6. Open follow-ups

1. **Third regime test** — a 2003-2007 mid-cycle window would
   give us a third independent PIT verdict on H11 and H12.
   `--max-snapshot-date 2007-12-31 --test-period-start 2005-01-01
   --years 22`. Cache should support this; EDGAR XBRL was
   mandated in 2009 so this would test EDGAR's 2007-2009 sparse
   coverage as a side effect.
2. **2008-2010 crisis test** — a fourth regime test focused on
   the 2008 financial crisis period would specifically test how
   the floor and watchlist perform in a downturn. The Quality
   floor SHOULD shine in a crisis (excluding the bankruptcies
   that defined that period); if it doesn't, the floor's value
   is even more questionable.
3. **value-deep on a fifth window** to pad confidence — but
   value-deep has won every test so far, so this is lower
   priority.
4. **Per-super-group weight presets** — still deferred; need
   step-2 validation. The IC heatmap differences between regimes
   are themselves informative — passing cells in 2018-2023 may
   not pass in 2010-2018, which is actually a *useful* check on
   the IC-derived preset proposals.
