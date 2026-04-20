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
From cached FMP data (see `financial-api.md`):

- Identity: `symbol`, `name`, `sector`, `industry`
- Quote: `price`, `marketCap`, `52wHigh`, `52wLow`
- Ratios (TTM): from `ratios-ttm` and `key-metrics-ttm`
- 5Y annual statements: IS / BS / CF
- 5Y annual ratios + key-metrics
- Price history: last 365 days EOD

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

### Surfaced separately, not in composite
- **% off 52-week high** — opportunity signal, displayed as a column
  next to the rank (PLAN.md §3 user requirement). Rolling it into the
  composite would muddy "this is a great long-term hold" with "and
  it's currently in a trough," which are different decisions.

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

### 8.1 Default category weights (value-tilted defensive)

| Category | Weight | Rationale |
|---|---|---|
| Valuation | **35%** | Heaviest — user buys cheap |
| Health | **25%** | Fallen-angel strategy needs strong balance sheet to survive the trough |
| Quality | 15% | Floor already excludes junk; remaining variation gets modest weight |
| Shareholder Return | 15% | Income matters; user writes covered calls and likes dividends |
| Growth | 10% | User actively fades momentum; growth is a tiebreaker, not a thesis |

All five live in a single config object loaded by the engine. Sliders
in the UI mutate this in-browser; the user can save and name preset
weight schemes.

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

## 11. Open questions

1. **REITs and banks.** Their ratios behave differently (FFO matters
   for REITs; net interest margin for banks; debt is structurally
   high). v1 lets industry-group percentile handle most of it, but
   industry-specific factor sets are likely a v2 addition. Same caveat
   as `fair-value.md` §10.
2. **Liquidity floor.** Should we exclude stocks below some average
   daily volume threshold so the rankings don't surface names that are
   illiquid for a covered-call writer? Default `null`; user can opt in.
3. **Aggregate industry-group score.** The cross-universe "is this
   group worth owning?" question (§1) is currently answered implicitly
   by composites being comparable across groups. Worth a dedicated
   group-level summary in the UI? Probably yes once we see the data.
4. **Weight presets.** Should we ship 2–3 named presets ("Value",
   "Income", "GARP") in addition to the user's default? Trivial to add
   later; defer.
