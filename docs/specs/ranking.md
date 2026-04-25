# Spec: Composite Ranking

**Status:** draft v2 — incorporates the validation findings from
`validation/case-study-2026-04-20.md` and the user's confirmed
investing-style preferences (see also `fair-value.md` for the
complementary valuation module).

## 1. Thesis

Diversification across industry groups, concentration within them. A
good ranking answers two questions per name:

1. **Within its industry group**, how does this stock stack up against
   its direct peers on the factors we care about?
2. **Across the whole universe**, is this stock's industry group worth
   owning right now at all?

A name we ultimately buy should rank well on **both** questions.

The user's strategy is **value-tilted defensive on quality companies**
— buying temporarily depressed prices on names that pass a multi-year
quality bar. The factor list, weights, and turnaround handling below
all reflect that style. They are tunable in the UI; the defaults are
the *user's* defaults, not generic.

## 2. Two parallel outputs

The validation revealed that the user's actual buys split into two
distinct trade types that the same composite cannot serve well:

1. **Main composite** — quality-value mean-reversion. Captures NVO and
   TGT cleanly. Backward-looking ratios, peer-relative percentiles,
   composite score within and across industry groups.
2. **Turnaround watchlist** — fallen blue-chips. Captures INTC, which
   no backward-looking quantitative ranker would surface. Separate
   list, no composite score; just "evaluate qualitatively."

Both are shipped from the same engine off the same snapshot. See §7 for
the turnaround rules and §8 for the unified output.

## 3. Inputs

### 3.1 Per-stock
From cached FMP / Yahoo data (see `financial-api.md`):

- Identity: `symbol`, `name`, `sector`, `industry`
- Quote: `price`, `marketCap`, `52wHigh`, `52wLow`
- Ratios (TTM): from `ratios-ttm` and `key-metrics-ttm`
- 5Y annual statements: IS / BS / CF (the §5 Accruals factor reads
  `income.netIncome` and `cashFlow.operatingCashFlow` from the most
  recent annual period; Net Issuance reads `income.sharesDiluted`
  from the two most recent annual periods)
- 5Y annual ratios + key-metrics
- Price history: last 365 days EOD plus a new
  `monthlyCloses: {date, close}[]` field on `CompanySnapshot`
  (~13 months of month-end closes, sourced from Yahoo monthly bars
  that we already pull for `priceHighInYear`). Drives the §5
  Momentum factor. Optional for backwards-compat: snapshots without
  it fall back to the quarterly-price approximation noted in §5
  Momentum, with `momentumApprox: true` flagged in the factor
  detail.

### 3.2 Industry grouping

**Decision:** GICS industry group (FMP `profile.industry`) — ~24
buckets across the S&P 500. Coarser sector (11 buckets) is too broad to
surface within-vertical leaders; finer GICS industry (~70 buckets) is
too sparse for meaningful percentiles.

When an industry-group cell drops below N=8 names, we widen to GICS
sector for percentile calculation (mirrors the peer-set fallback in
`fair-value.md` §3.2).

## 4. Quality eligibility floor

**The floor is a filter, not a factor.** Stocks that fail are excluded
from the main composite (and may instead appear on the turnaround
watchlist — see §7).

Validation finding: a TTM-net-income > 0 floor is too brittle. INTC
failed it during a recovery year that the user correctly bought into.
Replaced with a multi-year track record:

| Rule | Threshold |
|---|---|
| Profitable in **≥ 3 of last 5 fiscal years** (Net Income > 0) | required |
| **5-year average ROIC ≥** sector-relative floor (default: 33rd percentile of sector's 5Y avg ROIC) | required |
| **Interest Coverage** (EBIT / Interest Expense, TTM) ≥ sector-relative floor (default: 25th percentile) | required, only if interest expense > 0 |

Floor thresholds are **industry-relative percentiles**, not absolute
numbers. This handles structural differences (pharma's tight current
ratios are normal; banks' high debt ratios are normal). Hard absolute
floors only kick in for catastrophic numbers (negative 5Y avg net
income → fail regardless of percentile).

## 5. Factor model

Confirmed during design conversation. Items inherited from the POC have
been re-evaluated and replaced where better metrics exist.

### Quality (gated by §4 floor; remaining variation captured here)
- **ROIC (TTM)** — replaces ROE and Net Profit Margin from the POC
- **Accruals ratio (annual)** — `(NetIncome − OperatingCashFlow) /
  Revenue`, lower better. Sloan (1996) earnings-quality signal:
  earnings backed by cash flow predict future returns; earnings
  driven by accruals don't. **Direction is `lower` even into negative
  values** — a company with CFO > NI (conservative accounting) scores
  best, not just neutral. Computed from the most recent annual period
  to align with the cash-flow statement cadence.

### Financial Health
- **Debt / EBITDA (TTM)** — lower better. Replaces raw debt ratio
- **Current Ratio (TTM)** — higher better
- **Interest Coverage (TTM)** — higher better

### Valuation
- **EV / EBITDA (TTM)** — capital-structure-neutral; cleanest
  cross-industry value metric
- **P / FCF (TTM)** — cash-based, harder to manipulate
- **P / E (TTM)** — familiar baseline
- **P / B (TTM)** — relevant for asset-heavy industries (banks,
  industrials)

### Growth (cyclicality-aware — see §6)
- **Revenue growth** — peer-relative percentile of 7Y CAGR
- **EPS growth** — peer-relative percentile of 7Y CAGR

### Shareholder Return
- **Dividend Yield (TTM)**
- **Buyback Yield (TTM buybacks / market cap)**
- **5Y Dividend per Share Growth**
- **Net share issuance (annual)** — `sharesDiluted[0] /
  sharesDiluted[1] − 1`, lower better. Penalizes dilution
  symmetrically to how Buyback Yield rewards repurchases. SBC-driven
  share growth counts as issuance — that's the intended behavior, not
  a bug to back out. Splits must be pre-adjusted (FMP `sharesDiluted`
  is split-adjusted out of the box).

### Momentum (new category — see §11.6 for philosophy)
- **12-1 month price momentum** — `close[T−1m] / close[T−13m] − 1`,
  higher better. Skips the most recent month to avoid the
  short-horizon reversal effect (Jegadeesh-Titman 1993). Requires
  the new `monthlyCloses` field on `CompanySnapshot`; back-compat
  fallback to `quarterly[0].priceAtQuarterEnd / quarterly[3].
  priceAtQuarterEnd − 1` when monthly data is missing (older
  snapshots), with a `momentumApprox: true` flag in the factor
  detail.

### Surfaced separately, not in composite
- **% off 52-week high** — opportunity signal, displayed as a column
  next to the rank (PLAN.md §3 user requirement). Rolling it into the
  composite would muddy "this is a great long-term hold" with "and
  it's currently in a trough," which are different decisions. Note
  this signal is the *opposite sign* to Momentum (high
  pctOffYearHigh = recent loser); the two coexist because they answer
  different questions — see §11.6.

## 6. Cyclicality-aware growth

Validation finding: TGT's 5Y CAGR for revenue (−0.3%/yr) and EPS
(−12.9%/yr) looked terrible because FY2021 was the COVID retail peak.
A naive 5Y CAGR penalizes any cyclical measured trough-to-peak.

Mitigations applied:

1. **Default growth window is 7 years**, not 5 — smooths over a
   single peak/trough cycle.
2. **Peer-relative percentile** of growth, not raw growth — a stock
   with −13% EPS CAGR in an industry where the peer median is −15%
   is actually outperforming. The percentile captures that.
3. If 7Y history isn't available, fall back to **median annual growth
   rate** over available years (drops outliers automatically).

The growth category therefore can score *high* for a stock with
negative absolute growth, provided peers were worse. That's the right
behavior for cyclicals.

## 7. Turnaround watchlist (parallel output)

Stocks **excluded** from the main composite by the §4 floor are
re-evaluated against the turnaround rules. Names matching all three
criteria appear on a separate watchlist with no score, just a
description of *why they qualified*:

| Criterion | Threshold |
|---|---|
| **Long-term track record** | 10-year average ROIC > 12% (was a quality name historically, not a perpetual loser) |
| **Currently in TTM trough** | TTM net income < 0 OR TTM EPS < 50% of 5Y average EPS |
| **Deep drawdown** | Current price ≥ 40% below the 52-week high |

These are not ranked. They are a list of "fallen blue-chips, evaluate
qualitatively." The user does the rest of the work themselves —
checking catalysts (CHIPS Act for INTC, drug pipelines, restructurings)
that the model can't see.

If the 10Y history isn't available (e.g., post-2017 IPO), use the
longest available; the description string flags that as a confidence
caveat.

**Horizon scope (added 2026-04-25 from H12 regime testing).** The
watchlist's signal is **short-horizon only** — backtest evidence
across two PIT regimes shows watchlist names consistently outperform
on a 1y forward window (PIT 2018-2023 +18.58 pp gap, PIT 2010-2018
+19.80 pp gap), but the 3y signal is regime-dependent (strongly
positive in COVID recovery, strongly negative in pre-COVID).
Treat the watchlist as a flag for names worth evaluating manually
for short-horizon trades. Do **not** use it as a long-term hold
thesis. The "evaluate qualitatively" framing above is consistent
with this; making the horizon explicit prevents misinterpretation.
See `docs/specs/backtest-actions-2026-04-25-precovid.md` §4.2.

## 8. Scoring mechanic (main composite)

Pure function: `(snapshot, weights) → rankedSnapshot`. No state, no
clock, no network. Same module runs in the local CLI (bakes default
ranking into the snapshot) and in the browser (re-runs on every weight
slider change).

1. **Filter** universe by §4 quality floor.
2. **Per factor, per industry group**, compute each stock's
   **percentile** (0–100) within its peer cohort.
   - Winsorize at 5th and 95th percentiles of the cohort to clip
     extreme outliers before ranking.
   - Invert "lower is better" factors (Valuation) so higher percentile
     always means better.
3. **Per category**, compute a weighted average of factor percentiles.
   Within-category factor weights default to equal (handles factor
   redundancy by design — three valuation metrics counted as one
   valuation category, not three).
4. **Composite** = weighted average of category scores using the
   user-tunable category weights below.
5. **Within-group rank** = rank of composite within industry group.
6. **Universe rank** = rank of composite across the full filtered set.

### 8.1 Default category weights (value-deep)

**Updated 2026-04-25:** the default migrated from the original
35/25/15/15/10/0 (value-tilted defensive) to the value-deep weights
below. Evidence: the value-deep candidate beat the prior default by
+8.81 pp at the 3y horizon under the §3.11.1 weight-validation rule
(see `docs/backtest-weight-validation-2026-04-25.md` and
`docs/specs/backtest-actions-2026-04-25.md` §2.1).

**Re-confirmed 2026-04-25 (PIT):** the same-day point-in-time
rerun (with `--point-in-time` enabled per
`docs/specs/point-in-time-universe.md`) showed value-deep still
beats the legacy 35/25/15/15/10 by +4.05 pp at 3y under the
unbiased universe (CI [+0.93%, +5.72%] vs legacy's [-3.41%,
+2.14%] which crosses zero). Survivorship bias inflated absolute
returns by ~22 pp at 3y but preserved the relative ranking. See
`docs/specs/backtest-actions-2026-04-25-pit.md`.

**Re-re-confirmed 2026-04-25 (pre-COVID PIT):** a third run on a
2011-01 → 2018-12 (pre-COVID) window again shows value-deep
beating the legacy default by +5.72 pp at 3y (value-deep +8.29%
[+4.91%, +11.86%] vs legacy +2.56% [-1.74%, +6.87%]). value-deep
is the **only** finding from the 2026-04-25 batch that proved
regime-stable. The Quality floor (H11) and Turnaround watchlist
3y (H12) both flipped between regimes — see §11.7. See
`docs/specs/backtest-actions-2026-04-25-pit.md`.

**Recovery-regime caveat (4th run, 2026-04-25 crisis-attempt):**
the EDGAR-sparsity-collapsed 2011-only run showed the legacy
weights modestly OUTPERFORM value-deep (+2.30 pp legacy advantage
at 3y, sub-threshold so legacy stays rejected). value-deep wins
2 of 3 PIT regimes by meaningful margins (+4.05 pp and +5.72 pp)
and loses 1 (recovery) by a sub-threshold margin. Net: still the
right default, with a soft caveat that more defensive weights can
outperform during recovery periods. See
`docs/specs/backtest-actions-2026-04-25-crisis.md` §3.4-§3.5.

| Category | Weight | Rationale |
|---|---|---|
| Valuation | **50%** | Half the composite — value lenses (EV/EBITDA, P/FCF, P/E, P/B) are the dominant predictor of forward excess return in the validation backtest |
| Health | **20%** | Strong balance sheet still matters for the fallen-angel side of the strategy, but the validation evidence trims it from 25% in favor of more value |
| Quality | 10% | Floor already excludes junk; remaining variation gets modest weight (includes accruals) |
| Shareholder Return | 10% | Income matters; covered-call writing and dividends (also penalizes dilution) |
| Growth | 10% | Growth is a tiebreaker, not a thesis |
| Momentum | **0%** | Off by default — see §11.6. Stays at 0% until the IC pipeline finds a passing cell in at least one super-group at 1y or 3y |

The six categories live in a single config object loaded by the
engine. Sliders in the UI mutate this in-browser; the user can save
and name preset weight schemes. Weights renormalize over non-null
categories per §8.3, so a default 0% Momentum weight is a no-op for
ranking but still produces factor detail rows for inspection and IC.

**Prior default (preserved for reference):** 35% Valuation, 25%
Health, 15% Quality, 15% Shareholder Return, 10% Growth, 0%
Momentum. Available in the UI preset dropdown as
"value-tilted-defensive (legacy)" so users with saved screens can
still reproduce historical results.

### 8.2 Tie-breaking
Higher composite wins. Tiebreakers in order:
1. Higher Quality category score
2. Higher Shareholder Return category score
3. Larger market cap (deterministic for tests)

### 8.3 Missing-data handling
A stock missing one factor in a category: that factor drops out and
the category score is the average of the remaining factors (re-weighted
to sum to 1 within the category). A stock missing all factors in a
category: category score is `null`; composite is computed over the
remaining four categories with their weights renormalized.

`MissingFactors` is reported in the output for transparency.

## 9. Output structure

```ts
type RankedSnapshot = {
  snapshotDate: string;            // ISO date
  universeSize: number;            // post-filter
  excludedCount: number;           // failed §4 floor
  weights: CategoryWeights;        // what was used

  rows: RankedRow[];               // main composite (filtered)
  turnaroundWatchlist: TurnaroundRow[]; // §7
};

type RankedRow = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;

  categoryScores: {
    quality: number | null;
    health: number | null;
    valuation: number | null;
    growth: number | null;
    shareholderReturn: number | null;
  };

  composite: number;               // 0–100
  industryRank: number;            // 1..N_group
  universeRank: number;            // 1..N
  pctOffYearHigh: number;          // opportunity signal column

  factorDetails: FactorDetail[];   // for drill-down
  missingFactors: string[];

  fairValue: FairValue | null;     // see fair-value.md
};

type TurnaroundRow = {
  symbol: string;
  name: string;
  industry: string;
  reasons: string[];               // human-readable: "10Y avg ROIC 18%
                                   // (passes track record); TTM EPS
                                   // -$4.38 (in trough); 70% off 52w
                                   // high (deep drawdown)"
  pctOffYearHigh: number;
  fairValue: FairValue | null;
};
```

## 10. Test strategy

- **Unit tests** (`packages/ranking/tests/`):
  - Synthetic fixtures with 5–20 stocks across 2–3 fake industry
    groups. Assert: percentile correctness, winsorization, inversion
    of lower-is-better, missing-data handling, tie-breaking,
    weight-renormalization math.
  - Quality floor: explicit cases for "fails 3-of-5 profitable", "fails
    sector-relative ROIC floor", "passes both", "no interest expense
    so coverage rule skipped".
  - Turnaround rules: explicit cases for each of the three criteria
    independently, and the combined gate.

- **Mapping tests:** known FMP fixture → assert the right snapshot
  fields populate the right ranking inputs (catches drift if FMP
  renames a field).

- **Regression tests** — golden-file. Required acceptance criteria
  from `validation/case-study-2026-04-20.md`:
  - **NVO at 2026-03-06**: top quartile of Pharmaceuticals composite;
    `pctOffYearHigh ≥ 50%` flagged.
  - **TGT at 2026-04-09**: top quartile of its industry group
    composite; `pctOffYearHigh ≥ 35%` flagged.
  - **INTC at 2025-08-22**: appears on `turnaroundWatchlist`, NOT in
    `rows`. The reasons array must mention "deep drawdown" and "TTM
    trough."

  The golden file is committed; deliberate scoring changes update it
  in the same commit so the diff is reviewed.

- **Property-based (stretch):** for any weight vector summing to 1,
  composite ∈ [0, 100]; scaling all raw inputs of a single factor by
  a positive constant leaves percentile ranks unchanged.

## 11. Open questions and conditional features

1. **REITs and banks.** Their ratios behave differently (FFO matters
   for REITs; net interest margin for banks; debt is structurally
   high). v1 lets industry-group percentile handle most of it, but
   industry-specific factor sets are likely a v2 addition. Same caveat
   as `fair-value.md` §10. Partially addressed by §11.5 — per-super-
   group weight presets let us up-weight the factors that already
   work in those groups (e.g., bump Health weight in Banks) without
   needing per-group factor *additions* yet.
2. **Liquidity floor.** Should we exclude stocks below some average
   daily volume threshold so the rankings don't surface names that are
   illiquid for a covered-call writer? Default `null`; user can opt in.
3. **Aggregate industry-group score.** The cross-universe "is this
   group worth owning?" question (§1) is currently answered implicitly
   by composites being comparable across groups. Worth a dedicated
   group-level summary in the UI? Probably yes once we see the data.
4. **Weight presets.** Should we ship 2–3 named presets ("Value",
   "Income", "GARP") in addition to the user's default? Trivial to add
   later; defer. Per-super-group presets are §11.5 — a different,
   data-driven path.

## 11.5 Industry-conditional weight presets

Default weights (§8.1) apply universally across all super-groups.
Different factors carry different IC in different super-groups (per
`backtest.md` §3.9 IC analysis); a one-size-fits-all weight vector
leaves signal on the table.

**Two-step adoption process** to avoid curve-fitting:

1. **Evidence:** the IC heatmap surfaces super-group × factor cells
   that pass the three-gate filter (statistical floor from Phase 0
   Monte Carlo, economic floor of |IC| ≥ 0.05, sign-stable in ≥ 2
   of 3 rolling windows). For each super-group, we *propose* a
   preset that re-allocates weight toward the categories with
   surviving cells.
2. **Validation:** `backtest.md` §3.11 weight-validation mode
   compares the proposed preset to the default on the same
   point-in-time forward windows. The preset is adopted only if
   top-decile composite return beats the default by a meaningful
   margin (target: ≥ 1%/yr excess on the 3y horizon, with bootstrap
   CI not crossing zero).

**Status as of 2026-04-25:** the IC pipeline (Phase B) found
passing cells across five super-groups — Utilities, Semiconductors
& Hardware, Consumer Discretionary, Consumer Staples, and
Transportation & Autos (see `docs/backtest-ic-2026-04-25.md`).
Step 1 (evidence) is complete for those super-groups. **Step 2
(validation) was deliberately skipped for v1** — the spec's
adoption rule requires running each candidate per-super-group
preset through the weight-validation backtest, and that work is
deferred to a follow-up PR. Until then, no per-super-group presets
ship; §8.1 default applies universally.

### Storage and resolution (deferred to v2)

When per-super-group presets ship, they will live at
`packages/ranking/src/presets/super-group-weights.ts`:

```ts
export type WeightPreset = {
  superGroup: SuperGroupKey;
  weights: CategoryWeights;       // sums to 1
  source: "default" | "ic-derived" | "manual";
  evidenceRef: string | null;     // e.g., "docs/backtest-ic-2026-05-01.md#banks"
  adoptedAt: string;              // ISO date
};

export const SUPER_GROUP_PRESETS: WeightPreset[] = [];
```

The ranker would resolve weights per-row as: super-group preset if
present → fall back to user defaults. UI would surface the active
preset on each row's drill-down so the user always knows whether
they're looking at the universal default or a super-group override.

### Hard non-goal: auto-derivation

We do **not** mechanically derive weights from IC magnitudes —
auto-deriving from in-sample IC is the canonical curve-fit failure
mode in factor investing (overweights whatever was lucky in the
training window, crashes out-of-sample). The IC heatmap is
*evidence input* for human-set presets, never a direct weight
transformation. v1 enforces this by also requiring the candidate
to clear the §3.11 validation backtest before shipping.

## 11.6 Momentum philosophy

Momentum sits awkwardly in this composite for a real reason: the
user's stated style explicitly *fades* momentum. The `pctOffYearHigh`
column rewards recent losers; a Momentum factor rewards recent
winners. Naively summing both into one composite would give
inconsistent guidance.

**Resolution:** ship Momentum as a factor with **default weight
0%**. This achieves three things at once:

1. **No change to existing rankings.** The current composite is
   preserved bit-for-bit until evidence justifies changing it. The
   regression tests (NVO, TGT, INTC golden file) still pass with
   only accruals + issuance changes flowing through.
2. **The factor is computed and visible.** Factor detail rows show
   the momentum percentile per stock so the user can eyeball the
   correlation with realized returns informally before any weight
   change.
3. **The IC pipeline can test it rigorously.** `backtest.md` §3.7
   measures momentum's IC across each super-group at each horizon
   with the same three-gate filter as every other factor. If
   momentum carries signal in (say) Semiconductors at 1y but not
   in Utilities at any horizon, that is exactly the per-super-group
   weight preset the §11.5 machinery is built to capture.

Momentum's default weight rises above 0 **only** when:
- IC analysis shows it passes the three-gate filter in at least one
  super-group, AND
- a weight-validation backtest with a non-zero Momentum weight beats
  the 0% baseline on out-of-sample 3y forward returns.

Both conditions, both archived, both reproducible. If the data says
"momentum is noise in this universe at these horizons," the weight
stays at 0% and we remove the factor in v2 with documented
justification rather than sprinkling it in based on academic priors
that may not generalize.

## 11.7 Evidence-pending legacy rules

The §11.5 / §11.6 evidence bar (data justifies the rule, archived
report cited, no curve-fit) applies symmetrically to rules already
in the spec. The following rules predate the IC pipeline and have
never been validated against forward returns; they are catalogued
here so the audit trail is honest about what's measured vs assumed.

Each entry points at the hypothesis or parameter sweep in
`backtest.md` that will produce its verdict.

### Rules with verdicts

Updated 2026-04-25 from `docs/backtest-legacy-rules-2026-04-25.md`.

| Rule | Spec ref | Verdict | Status |
|---|---|---|---|
| **Quality floor — combined gate** | §4 | **failed 2 of 3 PIT regimes**. PIT 2018-2023 PASS (gap +2.95 pp); PIT 2010-2018 FAIL (gap -2.32 pp); PIT 2011-only FAIL (gap -2.66 pp). The PASS was the COVID-recovery window. | **HOLD §4 unchanged.** The decision is now blocked on **v2 delisted-name handling**, not more regime samples. The current PIT pipeline only audits names that survived to today; the floor's biggest job (filtering names that actually went bankrupt) is invisible. Without that audit, we can't honestly judge whether the rule is harmful or whether we're just measuring the wrong thing. See `docs/specs/backtest-actions-2026-04-25-crisis.md` §4.1 Option C. |
| **Quality floor — per-rule** | §4 each rule | regime-dependent across 3 PIT runs. sector-roic: +7.18 / -6.48 / -11.80 (negative in 2 of 3); profitable-3of5: -7.87 / +3.17 / +9.34 (positive in 2 of 3); interest-cov: -11.12 / -2.28 / +0.64 (negative or neutral in all 3, but small magnitudes). | Confirms regime dependence; the 2018-2023 sub-rule signals were COVID-specific. Don't simplify §4 to "sector-roic alone" — that rule is the *worst* in 2 of 3 regimes. |
| **Turnaround watchlist criteria** | §7 (10Y avg ROIC > 12%, TTM trough, 40% off 52w high) | **short-horizon signal only** — H12 PASS at 1y consistently across regimes; **3y signal is regime-dependent** (PIT 2018-2023 +50.84 pp, PIT 2010-2018 **-13.15 pp**). | **No change to §7 criteria; clarify §7 prose** — the watchlist surfaces names worth evaluating for short-horizon trades, NOT for buy-and-hold. The "evaluate qualitatively" language in §7 is consistent with this; make it explicit. |
| **FV-trend declining → demote to Watch** | FV-trend signal (5%/yr slope, 2-year window) | deferred (H10) | Backtest-side FV-trend reconstruction not yet built. Defer until a Phase 4 backtest-side FV-trend computer exists. |

### Design choices awaiting parameter sweeps

| Parameter | Spec ref | Sweep | Default updates if… |
|---|---|---|---|
| Growth window (5Y / 7Y / 10Y CAGR) | §6 | `backtest.md` §3.1.1 | A different window beats current 7Y on stable per-cell IC |
| Cohort fallback N threshold (5 / 8 / 12 / 15) | §3.2 | `backtest.md` §3.1.1 | A different N beats current 8 on top-decile composite IC |
| Intra-category weighting (equal vs IC vs single-best) | §8 step 3 | `backtest.md` §3.1.1 | IC-weighted intra-category beats equal-weight on top-decile excess return at 3y, CI not crossing zero |
| Winsorization bounds (5/95 vs 10/90 vs 1/99) | §8 step 2 | `backtest.md` §3.1.1 | A different bound beats current 5/95 on out-of-sample weight-validation |

### Rules already validated by existing hypotheses

For completeness — these aren't in the legacy-rule audit because
they're already covered:

| Rule | Validated by |
|---|---|
| TTM-EPS outlier rule | `backtest.md` H4 |
| Confidence labels | `backtest.md` H5 |
| `peerCohortDivergent` pull-back | `backtest.md` H6 |
| `PEER_DIVERGE_THRESHOLD = 5.0` | Phase 1 calibration (per `backtest.md` §2) |
| Options-liquid Candidate gate | **Removed 2026-04-25** — names without an active options market still appear in Ranked as share-purchase candidates; the OptionsPanel UI hides the CSP/buy-write/covered-call panels for them. The bucket classifier in `buckets.ts` no longer treats `optionsLiquid` as a demote signal. `backtest.md` §6 decision 4's parallel-bucket-assignment is correspondingly retired. |

### Tie-breaker order (§8.2)

Not catalogued above because the impact is almost certainly tiny —
ties are rare in a 110-factor-percentile system. **Skipped from
audit on a low-priority basis**; revisit only if a future change
makes ties materially more common (e.g., aggressive winsorization
or a much smaller factor count).
