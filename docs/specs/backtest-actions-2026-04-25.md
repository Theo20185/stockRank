# Spec: Engine changes from 2026-04-25 backtest

**Status:** draft v1 — translates the first EDGAR-deep IC + weight-
validation + legacy-audit run (2026-04-25) into concrete engine
changes. Each change cites its evidence file so the audit trail is
reproducible.

## 1. Evidence sources

All findings here come from a single archived run:

- `docs/backtest-ic-calibration-2026-04-25.md` — Phase 0 Monte Carlo
  thresholds (200 iterations, per-cell 99th-percentile null).
- `docs/backtest-ic-2026-04-25.md` — IC heatmap, 1y + 3y horizons,
  three-gate filter applied.
- `docs/backtest-weight-validation-2026-04-25.md` — five candidate
  weight vectors compared against the §8.1 default.
- `docs/backtest-legacy-rules-2026-04-25.md` — H11 (Quality floor)
  and H12 (Turnaround watchlist) verdicts.

Run: `npm run backtest-ic -- --all-sp500 --years 8 --horizons 1,3
--mc-iter 200 --weight-test --legacy-rule-audit`. 503 symbols, 60
month-end snapshots over 8 years, EDGAR-derived fundamentals,
57,752 IC observations.

## 2. Three findings, three engine changes

### 2.1 Promote `value-deep` to the new universal default

**Evidence:** weight-validation §3.11.1 adoption rule passed for
the value-deep candidate.

| Vector | 3y excess | CI (95%) | Verdict |
|---|---|---|---|
| default (Val 35%) | +26.96% | [+21.09%, +32.99%] | baseline |
| **value-deep** (Val 50%) | **+35.77%** | **[+30.84%, +40.99%]** | **adopt (+8.81 pp vs default)** |
| momentum-on | +27.43% | [+20.80%, +33.95%] | reject (+0.47 pp) |
| equal-weight | +17.94% | [+11.97%, +25.82%] | reject (-9.01 pp) |
| quality-tilt | +14.89% | [+10.10%, +19.98%] | reject (-12.07 pp) |

**Engine change:** update `DEFAULT_WEIGHTS` in
`packages/ranking/src/weights.ts` to the value-deep vector. Update
`ranking.md` §8.1 to reflect the new default and preserve the prior
35/25/15/15/10 in the prose for traceability.

```ts
// packages/ranking/src/weights.ts
export const DEFAULT_WEIGHTS: CategoryWeights = {
  valuation: 0.50,        // was 0.35
  health: 0.20,           // was 0.25
  quality: 0.10,          // was 0.15
  shareholderReturn: 0.10, // was 0.15
  growth: 0.10,           // unchanged
  momentum: 0,            // unchanged
};
```

**UI change:** none in v1 — the weight-slider panel reads
`DEFAULT_WEIGHTS` for its initial values and the reset-to-defaults
button. With `DEFAULT_WEIGHTS` now value-deep, both behaviors update
automatically. A "presets" dropdown listing the prior
"value-tilted-defensive (legacy)" weights for users who want to
A/B compare in-app is a v2 enhancement.

**Why promote to universal default rather than ship as preset:**
the `backtest.md` §3.11.1 adoption rule was purpose-built to be
conservative (≥1%/yr excess at 3y, CI not crossing zero). value-deep
cleared it cleanly with +8.81 pp at 3y. The whole point of the
evidence pipeline is to update beliefs based on data; refusing to
act on a passing verdict undercuts the workflow. Caveats on the
test window (2018-2023, COVID recovery) apply equally to the prior
default — the relative comparison is still apples-to-apples.

**Regression-test impact:** the NVO/TGT/INTC golden fixture in
`packages/ranking/src/validation.test.ts` will shift since composite
scores are weighted differently. The structural assertions (NVO in
top quartile of Pharma, TGT in top quartile of Discount Stores,
INTC on turnaround watchlist) should still hold because they test
relative rankings, not absolute composites. If any structural
assertion breaks, that's a real regression to investigate, not just
a fixture refresh.

### 2.2 Per-super-group presets — DEFERRED pending validation

**Status:** the original draft of this section proposed five
per-super-group presets (Utilities, Semiconductors & Hardware,
Consumer Discretionary, Consumer Staples, Transportation & Autos)
based on the IC heatmap's 10 passing 3y cells. **Decision (2026-04-25):
do not ship those presets in v1.**

**Why deferred:** the IC heatmap is *step 1* (evidence) of the §11.5
two-step adoption process. Step 2 is the §3.11 weight-validation
backtest — each candidate per-super-group preset must clear the
same +1%/yr × 3y bar that value-deep cleared in §2.1 above. We
have not run that validation. Shipping presets on IC evidence alone
sidesteps the curve-fit guard the spec is built around.

**Evidence still recorded** (for the next iteration):

| Super-group | Passing 3y cells | Suggests |
|---|---|---|
| Utilities | EV/EBITDA +0.430, D/EBITDA +0.581 | Test a "boost Valuation + Health" preset |
| Semiconductors & Hardware | EV/EBITDA +0.388, P/E +0.286, P/FCF +0.224, Accruals -0.231 | Test a "boost Valuation + Quality" preset (Sloan-accruals working) |
| Consumer Discretionary | EV/EBITDA +0.293, P/FCF +0.241 | Test a deeper Valuation tilt |
| Consumer Staples | NetIssuance -0.257 | Test a "boost Shareholder Return" preset |
| Transportation & Autos | D/EBITDA -0.442 | Test a "boost Health" preset |

**Next-iteration plan** (separate spec when revisited):
1. Hand-set candidate per-super-group presets informed by the table
   above, redistributing ~10 pp toward categories with passing IC.
2. Pass each candidate through `runWeightValidation` constrained to
   the relevant super-group's universe.
3. Adopt only those presets that beat the §8.1 default by the
   §3.11.1 floor (+1%/yr × 3y, CI not crossing zero).
4. Each adopted preset gets an `evidenceRef` pointing at both the
   IC report **and** the per-super-group validation report.

This deferral does not affect §2.1 — the universe-wide value-deep
validation already passed on the universe-wide composite, so it can
ship now.

### 2.3 Hold the Quality floor pending a survivorship-clean rerun

**Evidence:** H11 verdict was **fail** — combined-floor passed
cohort 3y excess +6.07% vs failed +17.45% (gap -11.38 pp, floor
harmful).

**Engine change:** **none yet**, but the spec gets updated to
reflect the open evidence question.

The result is too contaminated by two confounds to act on:
1. **COVID-recovery effect.** Test period 2018–2023 includes the
   pandemic shock and recovery. Distressed and unprofitable names
   (the floor-failed cohort) bounced hardest. A 3y window starting
   in 2020-21 ends near the recovery peak.
2. **Survivorship bias.** Today's S&P 500 list silently excludes
   names that went bankrupt or were dropped — the floor-failed
   cohort under-represents the true downside of holding distressed
   names. Per `backtest.md` §3.6, this bias is uncapped without the
   Phase 2b point-in-time universe scraper.

**Decision rule:** revisit the Quality floor only after **either**:
- A Phase 2b point-in-time-universe rerun re-confirms H11=fail with
  delisted names included, **or**
- A non-COVID test window (e.g., 2010–2018) shows the same pattern
  in the existing universe.

If both above also fail H11, then drop the combined floor entirely
and let the §7 turnaround watchlist (which validated cleanly —
§2.4 below) handle the fallen-angel surfacing on its own.

Until then, `ranking.md` §4 stays unchanged. `ranking.md` §11.7
gets an evidence-pending line citing this report.

### 2.4 Confirm the Turnaround watchlist criteria — no change

**Evidence:** H12 verdict was **pass** — watchlist 3y excess
+32.77% vs broader §4-excluded set +17.38% (gap +15.39 pp).
Watchlist N=61 with CI [+12.38%, +54.78%] (does not cross zero).

**Engine change:** none. The §7 criteria (10Y avg ROIC > 12% +
TTM trough + 40% off 52w high) are picking real fallen-angel
signal.

`ranking.md` §11.7 gets an "evidence: pass" annotation citing this
report, removing the rule from the audit-pending list.

## 3. Implementation order

Three PRs, in this order:

**PR 1 — Spec annotations** (this PR).
- `ranking.md` §8.1: update default weights from 35/25/15/15/10 to
  value-deep (50/20/10/10/10). Preserve prior default in prose for
  traceability.
- `ranking.md` §11.5: mark per-super-group presets as deferred
  pending step-2 validation; preserve the evidence table for the
  next iteration.
- `ranking.md` §11.7: H11 = HOLD (re-verify pending Phase 2b or
  non-COVID window); H12 = passed; H10 = deferred.
- This spec (§2.2): scratch the per-super-group preset implementation
  proposal; record decision rationale.
- No code changes; keeps spec in sync with audit trail.

**PR 2 — value-deep as the new default.**
- `packages/ranking/src/weights.ts`: update `DEFAULT_WEIGHTS`
  literal to value-deep.
- Run all tests, regenerate the NVO/TGT/INTC golden fixture if
  composite scores shift (likely they do; structural assertions
  should still hold).
- Tests:
  - Existing `validation.test.ts` regression assertions still pass
    (NVO top quartile of Pharma, TGT top quartile of Discount
    Stores, INTC on turnaround watchlist).
  - Existing `ranking.test.ts` weight-normalization unit tests
    still pass.

**PR 3 — Phase 2b point-in-time S&P 500 universe** (separate spec).
- New `docs/specs/point-in-time-universe.md` for the design.
- Wikipedia revision-history scraper for historical index
  membership.
- Wire into `scripts/backtest-ic.ts` so the test universe at date T
  uses S&P 500 members as of T, not today.
- Re-run the 2026-04-25 backtest with the un-biased universe;
  produce a follow-up actions spec comparing the verdicts.

## 4. Test strategy

For PR 1:

- **Unit tests** (`packages/ranking/tests/presets.test.ts`):
  - Every entry in `NAMED_PRESETS` and `SUPER_GROUP_PRESETS` has
    weights summing to 1 (within float tolerance).
  - `evidenceRef` points to a file that exists in the repo.
  - `superGroup` keys are members of `ALL_SUPER_GROUPS`.
- **Mapping test:** for a synthetic company in each super-group,
  the right preset resolves; for a super-group with no preset,
  fallback is `DEFAULT_WEIGHTS`.
- **Regression test:** the golden NVO/TGT/INTC fixture's composite
  scores under the preset-aware ranker. New baseline numbers
  committed in the same PR.
- **UI render test:** the preset dropdown lists the named presets,
  selecting one updates the sliders, reset clears it back to
  default.

For PR 2: spec edits only, no test changes.

## 5. Resolved questions and remaining work

Decisions taken 2026-04-25 (recorded for the audit trail):

1. **Universal default migrates to value-deep** (§2.1) — promoted
   from the original 35/25/15/15/10 to 50/20/10/10/10/0. Prior
   default preserved in prose only.
2. **Per-super-group presets deferred** (§2.2) — IC evidence
   recorded; step-2 validation backtest is the next-iteration
   blocker.
3. **IC pipeline cadence: ad-hoc** — no recurring schedule. Manual
   `npm run backtest-ic` invocation; revisit cadence after ≥ 3
   archived runs to compare stability across.
4. **Phase 2b point-in-time universe: build now** — separate spec
   `docs/specs/point-in-time-universe.md`. Once delivered, re-run
   the 2026-04-25 audit and compare verdicts (especially H11).
5. **Momentum default weight: stay at 0%** — momentum-on validation
   was within noise (+0.47 pp at 3y); H9 found zero passing cells.

Remaining open items:

- **Decision trigger for the Quality floor (H11).** Spec §11.7
  holds the floor pending re-verification. Two options were on the
  table — Phase 2b rerun OR a 2012-2019 (non-COVID) test window
  rerun. The non-COVID rerun is cheaper (one CLI flag change once
  Phase 2b unlocks deeper history); Phase 2b is more thorough.
  Recommend running both as soon as Phase 2b is available.
- **In-Valuation factor reweighting.** value-deep boosts the
  Valuation *category* but the four Valuation factors stay equal-
  weighted within. The 2026-04-25 IC heatmap showed EV/EBITDA had
  the strongest cross-super-group signal at 3y. A future
  validation should test "value-deep with EV/EBITDA-tilted
  Valuation" as a candidate.

## 6. Caveats applying to all four findings

- **Test period bias.** 2018-04 to 2023-03 includes a major
  recession + recovery. Findings will get more robust as the
  test window slides forward and includes more regimes.
- **FDR check reads "noise"** at 1.67× over chance. Some passing
  IC cells are likely false discoveries; the per-super-group
  presets in §2.2 should be considered evidence-pending until
  re-confirmed in a non-COVID window.
- **Survivorship bias** inflates all forward-return numbers by
  an unknown amount (literature: 1–2% per year). Both the
  weight-validation excess returns (§2.1) and the H11 floor
  comparison (§2.3) are biased upward; relative comparisons within
  the same biased universe are still meaningful, but absolute
  return claims should be discounted.
