# Spec: Backtest roadmap (post-2026-04-25)

**Status:** living document. Captures the phased plan agreed
2026-04-25 for what backtests to run next, in what order, and
why. Update this file when phases ship or when priorities change.

## Context — what's already settled

Four backtest runs on 2026-04-25 produced:
- `value-deep` weights adopted as universal default (regime-stable
  across 2 of 3 PIT regimes; sub-threshold loss in the 3rd)
- `H11` Quality floor decision blocked on v2 delisted-name handling
- `H12` Turnaround watchlist confirmed as 1y signal only
- `momentum-on` rejected (no IC evidence in any super-group)
- IC heatmap step-1 evidence recorded for 5 super-groups; step-2
  validation deferred

Full audit trail in `docs/specs/backtest-test-log.md`.

## The plan

Three phases, in priority order.

### Phase 1 — A + C — **COMPLETE 2026-04-25**

**A — REJECTED** (0/2 PIT regimes; per decision rule, can't reach
2/3). value-deep-evtilt 3y excess vs default: -1.95 pp (PIT
2018-2023), -2.90 pp (PIT 2010-2018). Equal-weighting within
Valuation outperforms tilting toward EV/EBITDA. See
`docs/specs/backtest-actions-2026-04-25-phase1.md` §1.

**C — STRONG SIGNAL on INTC, MIXED on TGT, GAP on NVO.** INTC
@ 2025-08-22: SG rank 1/36 (engine confirms user instinct). TGT
@ 2026-04-09: SG rank 11/35 (engine sees more value elsewhere).
NVO @ 2026-03-06: not in S&P 500 universe (Danish ADR — engine
gap, queued as v2 follow-up "extended universe for personal
holdings"). See `docs/specs/backtest-actions-2026-04-25-phase1.md` §2.

Original spec preserved below for reference.

---

### Phase 1 — A + C (cheap, high-value, do first)

**A. In-Valuation factor reweighting.**

- *Hypothesis:* the value-deep category boost is right, but the
  four sub-factors (EV/EBITDA, P/FCF, P/E, P/B) shouldn't be
  equal-weighted within. The 2026-04-25 IC heatmap showed
  EV/EBITDA had the strongest cross-super-group signal at 3y.
- *Implementation:* extend the candidate-loading machinery in
  `scripts/backtest-ic.ts` to accept a sub-category weight vector
  (today only category-level weights are tested). Add a
  `value-deep-evtilt` candidate with EV/EBITDA at 60%, P/FCF at
  20%, P/E and P/B at 10% each.
- *Decision rule:* `value-deep-evtilt` adopted only if it beats
  plain value-deep by ≥ 1%/yr × 3y under the §3.11.1 adoption
  rule across at least 2 of the 3 PIT regimes.
- *Cost:* 1 day. Most of the work is the sub-category weight
  plumbing in `runWeightValidation`; the validation runs
  themselves reuse the existing pipeline.

**C. User-picks validation.**

- *Hypothesis:* the user's actual historical buys (NVO 2026-03,
  TGT 2026-04, INTC 2025-08) ranked highly under value-deep at
  the time of purchase. If they didn't, the engine is missing
  something the user can see and we should figure out what.
- *Implementation:* new CLI mode
  `npm run backtest-ic -- --user-picks <symbol:date>,<symbol:date>`
  that, for each (symbol, date) pair, reconstructs the snapshot
  universe at that date, computes composite scores under value-
  deep, and reports:
  - The user pick's composite score
  - Its industry-rank, super-group-rank, and universe-rank
  - The top 5 names in its industry at that date
  - Whether it was in Candidates / Watch / Excluded
  - For names *above* it in the rankings: realized 3y forward
    return, so we can see whether the engine "left money on the
    table" by ranking them higher
- *Decision rule:* qualitative — does the engine surface the
  user's actual buys at the right time? Look for cases where
  value-deep ranks the pick low and ask why; those gaps are the
  highest-value engine improvements.
- *Cost:* 1-2 days. New CLI mode + a small report renderer; no
  changes to the ranker itself.

**Why A + C first:**
1. Both are cheap (no infrastructure work).
2. A directly tests whether we're leaving signal on the table
   inside Valuation.
3. C is the gold-standard validation for a personal project —
   does this engine work for the actual investor it's built for?
4. Neither blocks on anything.

### Phase 2 — B + D — **COMPLETE-WITH-CAVEAT 2026-04-25**

**B — REJECTED** (regime-stable: +0.20 pp PIT 2018-2023, -5.36 pp
PIT 2010-2018). Filtering "declining fundamentals" actively hurts
in recovery regimes — kicks out names emerging from troughs that
value-deep wants to buy. PreDecileFilter machinery stays in code
as a reusable mechanism. See
`docs/specs/backtest-actions-2026-04-25-phase2.md` §1.

**D — INFRASTRUCTURE BUILT, EDGAR RECOVERY 0%.** Of 345 delisted
S&P 500 symbols identified from the Wikipedia changes table, we
recovered Yahoo chart data for 41.4% but EDGAR fundamentals for
0%. Local CIK lookup excludes delisted tickers (only knows current
S&P 500). H11 verdict unchanged because no delisted snapshots got
built. **§4 Quality floor decision STILL on HOLD — now blocked
specifically on CIK lookup expansion.** See
`docs/specs/backtest-actions-2026-04-25-phase2.md` §2.

**Phase 2D.1 — CIK lookup fallback** (new, blocks the §4 decision):
extend `cikFor` to fall back to SEC's broader `company_tickers.json`
when the local lookup misses. Should recover ~70-80% of cap-change
removals (still-trading delisted names) — small fix, big payoff.

Original Phase 2 spec preserved below.

---

### Phase 2 — B + D (after Phase 1, in parallel if possible)

**B. Combined-screen stacking.**

- *Hypothesis:* we have multiple validated signals (value-deep
  composite + fundamentalsDirection ≠ declining + fvTrend ≠
  declining). Stacking them on the top-decile reduces the worst
  names without hurting the best, improving forward returns.
- *Implementation:* extend `runWeightValidation` to accept
  optional pre-decile filter predicates (e.g.,
  `excludeFundamentalsDeclining: true`,
  `excludeFvTrendDeclining: true`). Test value-deep top-decile
  with each filter individually, then stacked.
- *Decision rule:* a stacked-screen candidate is adopted only if
  it beats unfiltered value-deep by ≥ 1%/yr × 3y AND the dropped-
  names cohort underperforms the kept-names cohort. Both
  conditions matter — if the dropped names were just neutral, the
  stack adds complexity without value.
- *Cost:* 1-2 days.

**D. v2 delisted-name handling.**

- *Hypothesis:* the v1 PIT pipeline only audits survivors, so
  H11 (Quality floor) verdicts are structurally biased — the
  floor's biggest job (filtering names that actually went
  bankrupt) is invisible. v2 fixes this by adding delisted names
  back into each historical universe with realized return = -100%
  (or actual takeout price where available).
- *Implementation:*
  1. Extend `wikipedia-history.ts` to capture full IndexChange
     metadata including the removed company's name.
  2. New `delisted-names.ts` module that, for each delisted
     ticker in the membership history:
     - Attempts EDGAR fetch (CIK lookup may still work for
       recently-delisted names)
     - Falls back to Yahoo chart history (some delisted symbols
       have multi-year cached charts before delisting date)
     - Synthesizes a -100% return at delisting date if no
       takeout price is recoverable
  3. Wire delisted snapshots into the backtest universe at each
     historical date — they appear with `delisted: true` flag and
     `forward3yReturn: -1.00` (or actual takeout price).
- *Decision rule:* the v2 audit is the **deciding evidence** for
  the §4 Quality floor. Re-run the H11 audit with delisted names;
  the verdict from that run determines whether §4 stays, weakens,
  or drops.
- *Cost:* 3-5 days. Substantial new module + integration. The
  unknown is how many delisted tickers we can actually recover
  EDGAR data for (recently delisted may still be in SEC's system;
  older may not).

**Why B + D in Phase 2:**
- Both are larger than Phase 1 work but build on the existing
  pipeline.
- B can ship independently of D.
- D unblocks the §4 floor decision that's been on HOLD across
  three regimes — high-value but high-effort.

### Phase 3 — E (after Phase 2, when D is done)

**E. Per-super-group weight presets — step 2 validation.**

- *Hypothesis:* the IC evidence step-1 results from
  `docs/backtest-ic-2026-04-25.md` (5 super-groups with passing
  cells) translate into per-super-group weight presets that beat
  the universal default within each super-group. From the spec:
  - Utilities: boost Valuation + Health (passing: EV/EBITDA,
    D/EBITDA)
  - Semiconductors & Hardware: boost Valuation + Quality
    (passing: 4 cells incl. accruals)
  - Consumer Discretionary: boost Valuation
  - Consumer Staples: boost Shareholder Return
  - Transportation & Autos: boost Health
- *Implementation:*
  1. Extend `runWeightValidation` to accept a per-super-group
     weight-override map. The validation runs the candidate
     vector ONLY on names mapped to that super-group, with the
     baseline being the same super-group's universe ranked under
     default weights.
  2. Define candidate per-super-group preset vectors (already
     sketched in `backtest-actions-2026-04-25.md` §2.2 before
     they were scratched).
  3. Run validation across all 3 PIT regimes for each preset.
- *Decision rule:* a per-super-group preset adopted only if it
  passes the §3.11.1 adoption rule (≥ 1%/yr × 3y excess vs
  default) in at least 2 of 3 PIT regimes — same regime-stability
  bar as value-deep had to clear.
- *Cost:* 2-3 days, mostly the per-super-group weight resolution
  in `rank()` if any preset gets adopted (otherwise just the
  validation runs).

**Why E last:**
- Per-super-group presets are the lowest-marginal-value of the
  five — even successful ones add complexity to the ranker for a
  per-cohort excess that's likely smaller than value-deep's
  +4-6 pp gap.
- Depends on (D) being done so we can validate against an
  unbiased universe.
- Many proposed presets will likely fail step-2 because IC
  evidence in one regime doesn't replicate.

## Deferred — Tier 3 hypotheses worth flagging

These are recorded so we don't forget but aren't priority work:

- **F. Top-N concentration sweep** — top-decile vs top-quintile vs
  fixed top-25. Trade-off study; unlikely to produce a clear
  winner.
- **G. Within-category dominance** — does ROIC do all the work in
  Quality? D/EBITDA in Health? Same machinery as A but for the
  small categories.
- **H. Sector vs super-group cohorts for ranking** — the ranker
  uses narrow industry for percentiles; the IC uses super-groups.
  Test whether widening the ranker's cohort improves forward
  returns.
- **I. Extended universe for personal holdings** (added 2026-04-25
  from Phase 1C NVO miss) — let the user specify non-S&P 500
  symbols of personal interest (NVO, foreign ADRs, etc.); fetch
  their EDGAR (or Yahoo fallback) data; include them in the
  snapshot universe. Small effort, high value for users with
  international holdings.

Move any of these up if Phase 1-3 work surfaces a reason.

## Phase entry/exit checklist

For each phase, before starting:
- [ ] Spec annotated with the specific hypothesis being tested
- [ ] Candidate weight vectors / filter predicates defined in code
- [ ] Decision rule written down BEFORE running the test (avoids
      post-hoc rationalization)

For each phase, after running:
- [ ] Results archived to `docs/backtest-*-<date>-<phase>.md`
- [ ] Test rows appended to `docs/specs/backtest-test-log.md`
- [ ] Verdicts recorded in `ranking.md` §11.7 if rules changed
- [ ] Memory entry created if findings non-obvious
- [ ] This roadmap updated to mark the phase complete and surface
      the next phase's blockers if any

## Re-prioritization triggers

The order above reflects 2026-04-25 priorities. Reorder when:
- Phase 1 (A or C) reveals a gap that makes a deferred Tier 3 test
  more important
- The user's investing focus shifts (e.g., heavy interest in a
  specific super-group makes E for that super-group higher
  priority)
- A regime change (e.g., a new market crisis) creates a 4th PIT
  regime sample worth re-running everything against
