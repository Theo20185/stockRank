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

### 2.1 Adopt `value-deep` as a named preset

**Evidence:** weight-validation §3.11.1 adoption rule passed for
the value-deep candidate.

| Vector | 3y excess | CI (95%) | Verdict |
|---|---|---|---|
| default (Val 35%) | +26.96% | [+21.09%, +32.99%] | baseline |
| **value-deep** (Val 50%) | **+35.77%** | **[+30.84%, +40.99%]** | **adopt (+8.81 pp vs default)** |
| momentum-on | +27.43% | [+20.80%, +33.95%] | reject (+0.47 pp) |
| equal-weight | +17.94% | [+11.97%, +25.82%] | reject (-9.01 pp) |
| quality-tilt | +14.89% | [+10.10%, +19.98%] | reject (-12.07 pp) |

**Engine change:** add `value-deep` as a named preset in
`packages/ranking/src/presets/super-group-weights.ts` (the file
ranking.md §11.5 reserves but currently ships empty). The preset
applies *universally* (all super-groups) since the validation was
done on the universe-wide composite. Per-super-group refinements
fall under §2.4.

```ts
// packages/ranking/src/presets/named-presets.ts (new file)
import type { CategoryWeights } from "../types.js";

export type NamedPreset = {
  name: string;
  description: string;
  weights: CategoryWeights;
  evidenceRef: string;
  adoptedAt: string;
};

export const NAMED_PRESETS: NamedPreset[] = [
  {
    name: "value-deep",
    description:
      "Heavy value tilt — 50% Valuation. Validated to beat default by +8.81 pp at 3y.",
    weights: {
      valuation: 0.50,
      health: 0.20,
      quality: 0.10,
      shareholderReturn: 0.10,
      growth: 0.10,
      momentum: 0,
    },
    evidenceRef: "docs/backtest-weight-validation-2026-04-25.md",
    adoptedAt: "2026-04-25",
  },
];
```

**UI change:** the existing weight-slider panel gains a "Presets"
dropdown that lets the user select a named preset; selecting one
populates the sliders. The user can still hand-tune from there.
Default (value-tilted defensive) and value-deep are the v1
options; future entries get added as new evidence arrives.

**Why named-preset rather than new universal default:**
`ranking.md` §8.1 explicitly calls out the user's defaults as
*the user's*, not generic. Promoting value-deep to the universal
default would silently change every saved preset and dashboard
view; making it an opt-in preset preserves backwards-compatibility
and lets the user A/B compare in the UI before committing.

### 2.2 Build per-super-group presets from passing IC cells

**Evidence:** 10 cells passed all three gates of §3.10 at the 3y
horizon. Five super-groups have ≥1 passing cell:

| Super-group | Passing factors (3y) | Implication |
|---|---|---|
| **Utilities** | EV/EBITDA +0.430, D/EBITDA +0.581 | Boost Valuation + Health |
| **Semiconductors & Hardware** | EV/EBITDA +0.388, P/E +0.286, P/FCF +0.224, Accruals -0.231 | Boost Valuation + Quality (Sloan-accruals signal works here) |
| **Consumer Discretionary** | EV/EBITDA +0.293, P/FCF +0.241 | Boost Valuation |
| **Consumer Staples** | NetIssuance -0.257 | Boost Shareholder Return (anti-dilution signal) |
| **Transportation & Autos** | D/EBITDA -0.442 | Boost Health |

**Engine change:** populate
`packages/ranking/src/presets/super-group-weights.ts` with five
per-super-group presets, each citing the IC report. Each preset
re-allocates ~10 percentage points of weight toward the categories
with surviving signal, drawn proportionally from the categories
with no signal in that super-group.

```ts
// packages/ranking/src/presets/super-group-weights.ts
export const SUPER_GROUP_PRESETS: WeightPreset[] = [
  {
    superGroup: "utilities",
    weights: { valuation: 0.40, health: 0.35, quality: 0.10,
               shareholderReturn: 0.10, growth: 0.05, momentum: 0 },
    source: "ic-derived",
    evidenceRef: "docs/backtest-ic-2026-04-25.md#utilities",
    adoptedAt: "2026-04-25",
  },
  {
    superGroup: "semis-hardware",
    weights: { valuation: 0.40, health: 0.20, quality: 0.25,
               shareholderReturn: 0.05, growth: 0.10, momentum: 0 },
    source: "ic-derived",
    evidenceRef: "docs/backtest-ic-2026-04-25.md#semiconductors-hardware",
    adoptedAt: "2026-04-25",
  },
  // ... three more for consumer-discretionary, consumer-staples,
  // transport-autos, with similar 10-pp redistributions
];
```

**Engine change — resolution layer:** the ranker's weight
resolution (today: hardcoded `DEFAULT_WEIGHTS` from `weights.ts`)
gets a cohort-aware override. Per `ranking.md` §11.5: "super-group
preset if present → fall back to user defaults."

```ts
// packages/ranking/src/ranking.ts — composite computation
function resolveWeights(
  company: CompanySnapshot,
  userDefault: CategoryWeights,
): CategoryWeights {
  const sg = superGroupOf(company.industry);
  if (sg === null) return userDefault;
  const preset = SUPER_GROUP_PRESETS.find((p) => p.superGroup === sg);
  return preset ? preset.weights : userDefault;
}
```

The `rank()` entry point gains a per-row preset reference field so
the UI can surface "this row was scored using the
super-group-utilities preset" in the drill-down panel.

**Why not auto-derive weights from IC magnitudes:** per `ranking.md`
§11.5 explicit non-goal — auto-derivation is the canonical
curve-fit failure mode. The preset weights above are *human-set
informed by IC evidence*, not mechanical transformations of IC
values.

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

The four changes can ship in two PRs:

**PR 1 — Named presets + per-super-group presets + UI dropdown.**
- Add `packages/ranking/src/presets/named-presets.ts` (§2.1).
- Add `packages/ranking/src/presets/super-group-weights.ts` (§2.2).
- Update `rank()` to resolve per-company weights via the
  super-group preset table.
- Add a `Presets` dropdown to the web app's weight-slider panel.
- Tests:
  - Each preset weight vector sums to 1.
  - `rank()` applies the correct per-company preset (verify via a
    fixture with companies in three different super-groups).
  - UI render test: selecting a preset updates the sliders.
  - Regression: NVO/TGT/INTC golden file shifts under the
    super-group presets (Utilities preset doesn't apply to NVO since
    Pharma & Biotech has no preset; TGT (Consumer Staples) and INTC
    (Semiconductors & Hardware) do shift). Update golden file in
    the same commit.

**PR 2 — Spec annotations.**
- `ranking.md` §11.7: annotate H10 as still deferred; mark H11 as
  evidence-pending on Phase 2b; mark H12 as **passed**.
- `ranking.md` §8.1: add a sentence noting `value-deep` is now a
  shipped named preset, with `evidenceRef`.
- No code changes; just keeps the spec in sync with the audit
  trail.

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

## 5. Open questions

1. **Should the universal default migrate to value-deep?** The
   adoption rule says yes — it beats the user's default by +8.81
   pp at 3y. But the spec calls the default "the user's, not
   generic," so this is ultimately a user decision. v1 ships
   value-deep as a named preset; revisit once the user has run
   their portfolio against it for a quarter.
2. **Per-super-group preset discovery cadence.** The IC pipeline
   currently runs ad hoc; should presets be re-validated on every
   snapshot refresh, every quarter, or only on user request? The
   FDR check at "noise" verdict argues for caution — adding a
   recurring run that auto-suggests preset edits would be a
   curve-fit risk. Defer to manual reruns for now.
3. **Phase 2b point-in-time universe.** The H11 caveat hinges on
   getting this built. Wikipedia revision history of the S&P 500
   list is the primary source per `backtest.md` §3.6. A separate
   spec for Phase 2b is overdue.
4. **Momentum default weight.** `momentum-on` validation showed
   +0.47 pp at 3y (within noise of default). H9 (IC for momentum
   in any super-group) didn't have a single passing cell. Net
   conclusion: leave momentum default at 0% until the next IC
   refresh shows clear positive evidence in at least one
   super-group.

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
