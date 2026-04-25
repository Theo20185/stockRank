# Spec: Engine changes from Phase 1 backtests (2026-04-25)

**Status:** Phase 1 of `docs/specs/backtest-roadmap.md` complete.
Two verdicts: 1A REJECTED, 1C produced concrete validation signal.

## 1. Phase 1A — In-Valuation factor reweighting → REJECT

**Hypothesis:** the value-deep category boost is right, but the four
sub-factors (EV/EBITDA, P/FCF, P/E, P/B) shouldn't be equal-weighted
within. The 2026-04-25 IC heatmap showed EV/EBITDA had the strongest
cross-super-group signal at 3y; tilting Valuation toward EV/EBITDA
should beat plain value-deep.

**Implementation:** added `value-deep-evtilt` candidate (60%
EV/EBITDA, 20% P/FCF, 10% P/E, 10% P/B) via the new
`SubFactorWeights` mechanism in
`packages/ranking/src/backtest/weight-validation/`.

**Decision rule (from roadmap):** adopt only if it beats plain
value-deep by ≥ 1%/yr × 3y across at least 2 of 3 PIT regimes.

**Results:**

| Regime | value-deep-evtilt 3y excess vs default | Verdict |
|---|---|---|
| PIT 2018-2023 | -1.95 pp (CI [-0.33%, +3.22%] crosses zero) | reject |
| PIT 2010-2018 | -2.90 pp | reject |

**Verdict at 0/2 ⇒ cannot reach 2/3 ⇒ REJECT.** No need to run the
third regime.

### Why the IC heatmap finding didn't translate

The IC heatmap measured EV/EBITDA's rank-correlation with forward
return *averaged across the population of stocks* in each super-
group. The validation backtest measures *top-decile* selection
performance. Three plausible reasons for the discrepancy:

1. **Concentration risk.** EV/EBITDA is the strongest single factor
   on average but tilting 60% to it concentrates risk in cases
   where it specifically fails (e.g., capital-intensive turnarounds
   where the metric punishes early-cycle leverage).
2. **Factor diversification.** When the four valuation factors
   AGREE (a stock is cheap on all of them), we have high
   conviction. When they DISAGREE, the noise cancels under
   equal-weighting. Tilting breaks that diversification.
3. **IC vs top-decile mismatch.** Strong IC at the population
   level can come from the middle of the distribution, not the
   tails. Top-decile selection is a tail operation; equal-
   weighting captures more of the tail consensus.

**Engine action:** none — keep the equal-weight-within-Valuation
default. Update the test log to record this verdict.

## 2. Phase 1C — User-picks validation → 1 strong signal, 1 mixed, 1 missing

**Hypothesis:** value-deep surfaces the user's actual buys at
appropriate ranks at the time of purchase. If it doesn't, the
engine is missing something the user can see, and we should
investigate what.

**Implementation:** new `--user-picks SYM:DATE,SYM:DATE` CLI mode +
`packages/ranking/src/backtest/user-picks/` engine + report.

**Picks evaluated:**

| Pick | Date | SG rank | Universe rank | Verdict |
|---|---|---|---|---|
| **INTC** | 2025-08-22 | **1 / 36** in Semis & Hardware | 42 / 484 (top 8.7%) | **engine confirmed user instinct** |
| **TGT** | 2026-04-09 | 11 / 35 in Consumer Staples | 200 / 500 (top 40%) | engine was lukewarm |
| **NVO** | 2026-03-06 | (not in universe) | — | not in S&P 500 (Danish ADR) |

### 2.1 INTC — strong validation

Engine ranked INTC as the **single best name** in Semiconductors &
Hardware on the user's purchase date. Composite 72.37; closest
peers at universe rank 41 and 43. The §4 Quality floor would
exclude INTC (TTM EPS was negative), but the user-picks engine
ranks pre-floor — it's measuring whether the composite picks the
name out, not whether the floor lets it through.

**Implication:** the value-deep composite IS finding deep-value
turnaround opportunities like INTC at exactly the moments the user
identifies them. This is the single strongest validation result
across all 2026-04-25 backtest work.

### 2.2 TGT — middling rank, with credible alternatives above

Engine ranked TGT 11th of 35 Consumer Staples names. The 5 names
that ranked higher in the same super-group:

| SG rank | Symbol | Composite |
|---|---|---|
| 1 | TAP (Molson Coors) | 76.82 |
| 2 | STZ (Constellation Brands) | 74.14 |
| 3 | KDP (Keurig Dr Pepper) | 69.74 |
| 4 | GIS (General Mills) | 69.37 |
| 5 | CPB (Campbell Soup) | 66.48 |

These are credible alternative value-deep picks — three branded
beverage companies and two packaged-food names, all trading at
discounted multiples in early 2026. The forward 3y windows haven't
closed; we can't yet judge whether the engine's ranking of these
above TGT was correct.

**Implication:** this is a "watch this space" result. The engine
isn't WRONG on TGT — it just sees stronger value elsewhere in the
super-group. Worth re-running this validation in 2029 when the 3y
forward windows close to see whether the engine's preferences
realized better returns.

### 2.3 NVO — universe gap

NVO (Novo Nordisk) is a Danish ADR. The S&P 500 universe doesn't
include it. The user actively trades it (the case-study golden
fixture at `validation.test.ts:NVO_AT_ENTRY` confirms), but the
backtest pipeline can't see it because:
- The S&P 500 list from Wikipedia excludes ADRs of foreign
  companies
- EDGAR filings exist for many ADRs (NVO files 20-F not 10-K)
  but our `getEdgarFundamentals` is mapped against the S&P 500
  universe

**Implication:** there's a real engine gap here for foreign-ADR
holdings. The user demonstrably cares about NVO. Two options for
v2:
1. **Add an extended universe option** — allow the user to specify
   non-S&P 500 symbols of personal interest, fetch their EDGAR
   data (or Yahoo fallback), include them in the snapshot
   universe.
2. **Accept the gap** — document NVO is out of scope; if user
   tracks it manually, that's fine.

Recommend option 1 — small effort, high value for a
personal-project user with international holdings. Spec it as a
follow-up.

## 3. Engine changes

### 3.1 No changes to default weights

Phase 1A's REJECT means the equal-weight-within-Valuation
convention stays. `DEFAULT_WEIGHTS` unchanged.

### 3.2 No changes to ranking logic

INTC validation confirms the composite is correctly identifying
deep-value names. TGT validation isn't a flag — the engine just
sees stronger value elsewhere in the super-group.

### 3.3 Spec annotations

- `ranking.md` §8.1: append a note pointing to the user-picks
  report as evidence that value-deep correctly surfaces the user's
  actual buys (INTC #1 in semis at purchase date).
- `backtest-test-log.md`: append Phase 1A reject rows + Phase 1C
  signal/mixed/missing rows.
- `backtest-roadmap.md`: mark Phase 1 complete; note the NVO/ADR
  gap as a new follow-up.

### 3.4 New follow-up — extended universe for non-S&P 500 holdings

Open question raised by the NVO miss. Spec'd separately if
prioritized. Tier-3 (deferred) for now; revisit when the user
explicitly wants ADR coverage.

## 4. Implementation

One PR — annotations only. The Phase 1A code (sub-factor weight
machinery) stays in place (it's small, harmless, and supports
future per-category-internal experiments). The Phase 1C code
(user-picks engine + CLI) stays since it's now a useful tool for
ad-hoc validation.

## 5. Phase 2 unblocks

With Phase 1 complete:
- B (combined-screen stacking) — ready
- D (v2 delisted-name handling) — still high-value, blocking the
  §4 floor decision
- The new follow-up "extended universe for personal holdings" can
  be slotted into Phase 3 alongside E if prioritized.

Recommended next: Phase 2 (B + D in parallel per the roadmap).
