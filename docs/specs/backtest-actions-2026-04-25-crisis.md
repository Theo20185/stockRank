# Spec: Engine changes from 2008-2011 crisis-window backtest

**Status:** draft v1 — fourth backtest run on 2026-04-25, an
attempted 2008-2011 financial-crisis regime check that EDGAR
data sparsity collapsed into a **2011-only single-year test**.
Limited but informative.

## 1. Why

The pre-COVID rerun
(`docs/specs/backtest-actions-2026-04-25-precovid.md`) found H11
regime-dependent and H12 (3y) regime-dependent. We needed a 3rd
regime sample to break the tie. The 2008-2010 financial crisis was
the natural choice — testing whether the §4 Quality floor protects
during a downturn (the strongest pro-floor argument).

## 2. Setup and the EDGAR-depth surprise

```
npm run backtest-ic -- --all-sp500 --years 18 \
                      --max-snapshot-date 2011-12-31 \
                      --test-period-start 2009-01-01 \
                      --horizons 1,3 --mc-iter 200 \
                      --weight-test --legacy-rule-audit \
                      --point-in-time
```

**The collapse:** SEC mandated XBRL filing in 2009. Many companies
didn't start tagging full XBRL until 2010-2011. As a result,
`synthesizeSnapshotAt` returned `null` for nearly every snapshot
attempt before 2011 — the per-company `EdgarCompanyFacts` either
had zero usable annual periods or zero usable quarterly periods at
those dates.

**Net result:** of the 36 monthly snapshot dates from 2009-01 to
2011-12 that we wanted to test, only **12 produced usable snapshot
universes — all in 2011**. The output's `Snapshot range:
2011-01-31 → 2011-12-31` reflects this.

The "crisis test" became "a 2011 single-year test on a recovery
mid-window" — useful but not what we set out to do.

## 3. Verdicts (with caveats)

### 3.1 Three-regime H11 verdict count

| Regime | Snapshot range | H11 (3y combined) gap | Verdict |
|---|---|---|---|
| PIT 2018-2023 (COVID) | 2018-04 → 2023-03, 60 snapshots | +2.95 pp | **pass** |
| PIT 2010-2018 (pre-COVID) | 2011-01 → 2018-12, 96 snapshots | -2.32 pp | **fail** |
| PIT 2008-2011 (intended crisis) | 2011-01 → 2011-12 only, 12 snapshots | **-2.66 pp** | **fail** |

H11 has now failed in **2 of 3 PIT regimes**. The PASS was
COVID-recovery; the two FAILS span normal-recovery regime.

### 3.2 H11 per-rule directional consistency across 3 regimes

| Rule | PIT 2018-23 | PIT 2010-18 | PIT 2011-only | Modal direction |
|---|---|---|---|---|
| profitable-3of5 | -7.87 | +3.17 | **+9.34** | mixed (positive in 2 of 3) |
| sector-relative-roic | +7.18 | -6.48 | **-11.80** | mixed (negative in 2 of 3) |
| interest-coverage | -11.12 | -2.28 | +0.64 | negative or neutral (0 positive) |
| **combined** | +2.95 | -2.32 | **-2.66** | net negative in 2 of 3 |

The per-rule signs partially flip between 2018-2023 and the other
two regimes — the COVID window appears to have inverted the
signal direction for profitable-3of5 and sector-relative-ROIC.

### 3.3 H12 — INCONCLUSIVE

Watchlist N=1 in the 2011 window. The 10Y avg ROIC requirement
filters out almost everything because EDGAR data doesn't go back 10
years from 2011 dates. No new evidence for or against H12 from
this run.

### 3.4 Weight validation under the 2011 single-year regime

| Candidate | 3y excess | Excess vs default | Verdict |
|---|---|---|---|
| **default (value-deep)** | (baseline) | (baseline) | — |
| **value-tilted-defensive-legacy** (35/25/15/15/10) | (default + 2.30 pp) | **+2.30 pp** | reject (below 3 pp threshold) |
| quality-tilt | (default + 2.95 pp) | +2.95 pp | reject (just below threshold) |
| momentum-on | (default + 0.58 pp) | +0.58 pp | reject |
| equal-weight | (default - 5.99 pp) | -5.99 pp | reject |

**The sign flipped on legacy in the recovery year.** Legacy and
quality-tilt both modestly outperform value-deep in 2011 → 2014
forward windows (recovery period). Neither clears the +3 pp
adoption threshold, but the directional evidence is real.

### 3.5 Three-regime weight-validation summary

| Candidate | PIT 2018-23 vs default | PIT 2010-18 vs default | PIT 2011-only vs default |
|---|---|---|---|
| value-tilted-defensive-legacy | -4.05 pp | -5.72 pp | **+2.30 pp** |
| equal-weight | -11.87 pp | -8.42 pp | -5.99 pp |
| quality-tilt | -11.35 pp | -8.22 pp | **+2.95 pp** |
| momentum-on | -2.37 pp | +0.22 pp | +0.58 pp |

value-deep wins 2 of 3 by meaningful margins; loses 1 (recovery
regime) by sub-threshold margins. Net: still the right default but
the case is no longer overwhelming.

### 3.6 IC heatmap

FDR check: 28 surviving / 5.4 expected = **3.5× → "real-signal"**
verdict (the strongest of any run today). BUT zero cells passed
the three-gate filter — the rolling-window sign-stability gate
killed everything because there's only ~4 snapshots per rolling
window in this 12-snapshot dataset. The cell-level signal is real,
but the gates are too strict for this small N.

## 4. Engine changes

### 4.1 Quality floor — STILL HOLD, but the case for change is mounting

H11 has now failed 2 of 3 PIT regimes. That's not enough to drop a
long-standing rule outright, but the §11.7 "evidence-pending"
status no longer captures the situation. Three honest options:

**Option A — drop the §4 floor entirely.** 2-of-3 PIT fails across
multiple regimes is reasonable evidence the rule has no robust
forward-return predictive power. Pro: simpler engine. Con: the v1
PIT implementation doesn't add delisted names (LEH, BS, etc.)
back — the floor's BIGGEST job (filtering names that actually went
bankrupt) is invisible to the audit. We may be measuring the floor
on the wrong question.

**Option B — weaken the floor to a soft warning.** Keep §4
exclusions but treat them as informational flags rather than hard
filters. Names below the floor stay in the rankings with a quality
warning. Pro: preserves the floor's "human review aid" value,
preserves the bucket structure; con: complicates classifier.

**Option C — wait for v2 delisted-name handling before deciding.**
Without delisted names in the audit, we're essentially testing the
floor on names that *all survived* their period. Of course the
distinction between floor-passed and floor-failed survivors is
weak — they all survived. The bias is structural and the only
clean fix is the v2 delisted-name implementation.

**Recommended: Option C.** The floor's most important function
isn't measurable by our v1 PIT pipeline. Drop the rule only after
a v2 audit that includes the bankruptcies.

### 4.2 Quality floor — note the 2018-2023 PASS-only pattern

Spec annotation only. The single regime where the floor PASSED
(2018-2023) was specifically the post-COVID recovery — a regime
where distressed names that survived were the biggest winners. The
floor's apparent value in that window was the floor *correctly
excluding* names whose distress was real but invisible to a
biased survivorship-affected audit.

Said differently: if survivors-only audits show the floor helps
in COVID and hurts otherwise, the most likely explanation is that
the floor's value comes from filtering true failures (which the
audit can't see), and the COVID PASS was an artifact of even more
extreme survivorship effects in that window.

### 4.3 Turnaround watchlist — no new evidence

H12 inconclusive in this run. Prior verdict (from
`docs/specs/backtest-actions-2026-04-25-precovid.md` §4.2)
stands: 1y signal robust, 3y signal regime-dependent. Treat the
watchlist as a short-horizon trade flag, not a long-term hold
thesis.

### 4.4 value-deep default — KEEP, with a soft caveat

Wins 2 of 3 PIT regimes; loses 1 (recovery) by sub-threshold
margin. The defensive (legacy) weights modestly outperform during
recovery periods, but value-deep wins under both pre-COVID
mid-cycle and COVID-recovery regimes. No change to default;
spec annotation will note the recovery-regime caveat.

### 4.5 Spec edits

- `ranking.md` §11.7: H11 verdict updated from
  "regime-dependent" to "**failed 2 of 3 PIT regimes**;
  decision blocked on v2 delisted-name handling per `Option C`
  above."
- `ranking.md` §8.1: append note that value-deep underperforms
  defensive weights in recovery regimes (legacy +2.30 pp in 2011),
  but wins on net across the three regimes tested.
- `backtest-test-log.md`: append rows from this run.
- `backtest.md` §3.6: update the v1-PIT-limitation note to
  emphasize that the missing-delisted-names limitation is now
  blocking a real engine decision (the floor).

## 5. Implementation

One PR — annotations only. No code changes.

## 6. Open follow-ups (priority order)

1. **v2 delisted-name handling** — promoted from "out of scope" to
   **the blocking item**. Without it, H11 audits are
   structurally biased and we can't decide on §4. Spec for v2:
   recover historical chart data + EDGAR for delisted symbols
   from the Wikipedia changes table; treat genuinely-bankrupt
   names as -100% realized return.
2. **2003-2007 mid-cycle window** — tempting but blocked by the
   same EDGAR-depth issue we hit in this run. SEC mandated XBRL
   in 2009; pre-2007 data is sparse to non-existent.
3. **Test value-deep on a 4th regime** — would need either the
   v2 delisted-name expansion OR a future window (e.g., 2026
   onwards as time passes).
