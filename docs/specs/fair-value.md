# Spec: Fair Value Module

**Status:** draft. Validated approach against three real entries on
2026-04-20 — see `validation/case-study-2026-04-20.md`. Ready to
implement once `ranking.md` factor model is locked.

## 1. Purpose

For each ranked stock, project a **fair-value price range** so the user
can:

- Decide whether current price is meaningfully below intrinsic value
  (entry decision).
- Set a target exit price.
- Pick a covered-call strike that aligns with where they'd be happy to
  be assigned.

Fair value is **not a price prediction.** It's "if the market re-rates
to comparable multiples, here is where the stock lands." Mean reversion
isn't guaranteed; a stock at fair value can stay cheap (or get cheaper)
for years. The output is the *prize if it works*, not the *probability*.

## 2. Three-anchor methodology

We compute three independent fair-value estimates and present them as a
range, not a point. Each anchor answers a different question.

| Anchor | Formula | Question it answers |
|---|---|---|
| **Peer-median multiple** | `peerMedianMultiple × company TTM metric` | "If this stock re-rates to its industry's typical multiple, where does it land?" |
| **Own-historical multiple** | `companyMedianMultiple_5Y × company TTM metric` | "Where has this specific stock typically traded?" |
| **Normalized-earnings multiple** | `peerMedianMultiple × company 5Y avg earnings` | "Apply normal multiple to *cycle-average* earnings, not trough-TTM" |

Each anchor is computed across **three valuation metrics** — P/E,
EV/EBITDA, P/FCF — giving up to **9 sub-estimates** per stock. We
report the **median, 25th, and 75th percentile** of those estimates as
the fair-value range, plus the individual anchor results for
transparency in the UI drill-down.

### 2.1 Why three metrics, not just P/E

- **P/E** breaks for loss-makers and is distorted by tax-rate /
  one-time items. Most familiar to users.
- **EV/EBITDA** is capital-structure-neutral and lets us compare
  companies with very different leverage on a fair basis. Less
  distortion from depreciation policy.
- **P/FCF** uses cash, not accounting earnings, so it's harder to
  manipulate. Distorted in years of one-off CapEx surges (e.g., NVO
  building GLP-1 capacity 2024–25).

No single metric is right for every situation; the median across three
is more robust than any one.

## 3. Peer set definition

**Decision:** industry group × market-cap cohort, with a fallback when
the cohort cell is too sparse.

### 3.1 Cohort buckets

Three cap buckets (not four — keeps cells populated in the S&P 500):

| Bucket | Range | S&P 500 names (rough) |
|---|---|---|
| **Mega** | ≥ $200B | ~50 |
| **Large** | $20B – $200B | ~250 |
| **Mid/Small** | < $20B | ~200 |

Industry group = GICS sub-sector from FMP `profile.industry` (~24
buckets across the index).

Cohort cell = (industry, capBucket). 24 × 3 = 72 cells; expected ~7
names per cell on average.

### 3.2 Fallback rules

| Cell population | Behavior |
|---|---|
| **N ≥ 8 peers** (excluding the subject) | Use cohort directly. |
| **3 ≤ N < 8** | Use cohort, but mark the fair-value output with `peerSet: "narrow"` so the UI can show a confidence flag. |
| **N < 3** | Fall back to the full **industry group** (all cap buckets). Mark `peerSet: "industry"`. |
| Industry group itself has N < 3 | Fall back to **GICS sector** (~11 buckets). Mark `peerSet: "sector"`. |

The subject company is **excluded** from its own peer set when
computing the median.

### 3.3 Peer-set hygiene

Peers must satisfy:

- Same currency reporting (USD only for v1; rejects ADRs that report in
  other currencies).
- Profitable in TTM **for the P/E and P/FCF anchor calculations only**
  — a peer with negative earnings or FCF would skew the median, so it
  drops out of *those two* anchors. EV/EBITDA tolerates negative
  EBITDA peers via filtering.
- Not a recent IPO (< 3 years of history) — multiples on freshly
  public names aren't comparable.

A peer that drops out of one anchor can still be present in another.

## 3.4 TTM outlier defense (peer-median anchors)

The peer-median anchors multiply a subject's TTM income figure by the
peer-cohort multiple. When the subject's most recent year included a
one-time gain (regulatory true-up, settlement reversal, asset sale,
etc.), the resulting fair value overshoots wildly. EIX is the canonical
example: FY2025 reported EPS $11.55 and EBITDA $10.77B were both
inflated by the TKM wildfire settlement; without defenses the anchors
imply $196/share on P/E and $271/share on EV/EBITDA, while forward
consensus and analyst targets cluster near $80.

The defense fires independently on EPS and EBITDA — same shape, same
1.5× threshold, surfaced as separate fields on the output.

### EPS outlier (peer-median P/E anchor)

**Two-signal outlier rule:** when the most recent EPS exceeds **1.5×**
the prior-3-year mean **and** forward consensus EPS is below **0.7×**
the most recent EPS, fall back to the prior-3-year mean for this
anchor only. Forward EPS acts as a corroboration check — when forward
agrees with the spike, it's a real step-change and TTM is trusted.

| TTM vs prior 3y | Forward vs TTM | Treatment | Reason |
|---|---|---|---|
| Spike (> 1.5×) | Falls back (< 0.7×) | Prior-3y mean | One-time gain; analysts don't expect it to repeat |
| Spike (> 1.5×) | Stays high (≥ 0.7×) | TTM | Real step-change; analysts confirm |
| Spike (> 1.5×) | Forward EPS missing | Prior-3y mean | Conservative default — better to slightly under-shoot than lock in an obvious one-timer |
| Normal (≤ 1.5×) | Any | TTM | No outlier detected |

Surfaced on the FairValue output as
`ttmTreatment: "ttm" | "normalized"`. Forward EPS is sourced from
`defaultKeyStatistics.forwardEps` on the Yahoo provider; FMP free tier
doesn't expose it (set to null), so the "no forward" branch handles
that case.

### EBITDA outlier (peer-median EV/EBITDA anchor)

**Single-signal rule:** when the most recent annual EBITDA exceeds
**1.5×** the prior-3-year mean, fall back to the prior mean for the
peer-median EV/EBITDA anchor. There is no forward-EBITDA corroboration
check — Yahoo doesn't surface a `forwardEbitda` figure — so the rule
mirrors the no-forward branch of the EPS rule: a spike alone is enough
to trigger normalization.

| TTM vs prior 3y | Treatment | Reason |
|---|---|---|
| Spike (> 1.5×) | Prior-3y mean | One-time gain; no forward corroboration available |
| Normal (≤ 1.5×) | TTM | No outlier detected |

Surfaced on the FairValue output as
`ebitdaTreatment: "ttm" | "normalized"`.

### Scope notes

The rules narrowly target the **peer-median** anchors where outlier
impact is largest. Other anchors are deliberately untouched:

- `ownHistorical*` anchors — multiply current TTM multiples by current
  trailing earnings, so the multiple is itself deflated by the same
  spike (current EV/inflated EBITDA → understated multiple). Replacing
  the income figure alone would over-correct. A proper fix needs
  historical price-time-series data (out of scope; see comment at
  `anchors.ts:200`).
- `normalized*` anchors — already use a multi-year cycle average by
  design; including the spike year is the standard CAPE-style
  approach.
- `peerMedianPFCF` — FCF is volatile from working-capital and capex
  swings, often null; we'd need a larger sample to design a sensible
  rule. Deferred.
- Category-scoring factors that share the same root contamination
  (ROIC, EBIT, Net Debt/EBITDA, 7Y EPS Growth) live in
  `packages/ranking/src/factors.ts` — out of scope for the fair-value
  module; addressed separately in the scoring engine.

## 3.5 Peer-cohort divergence defense

The outlier rule in §3.4 protects against the *subject's* TTM EPS
being a one-timer. A separate failure mode: the *peer cohort* itself
can be momentum-distorted (bubble or bust), making peer-median
multiples wrong as a baseline for the subject. The canonical case is
INTC late 2023: the semi peer cohort (NVDA, AVGO, AMD as the cap-
narrowed cohort) had AI-rally PEs of 285 / 42 / 175 — peer-median 175
× INTC's $1.94 EPS implied $340/share when INTC was actually trading
at $50 and continued to fall.

**Divergence check:** when the peer-median P/E multiple differs from
the subject's own TTM P/E by more than **5× in either direction**,
the peer cohort is treated as too distorted (or the subject as too
structurally different from peers) for peer multiples to be the
right baseline. The 6 peer-derived anchors (`peerMedianPE`,
`peerMedianEVEBITDA`, `peerMedianPFCF`, `normalizedPE`,
`normalizedEVEBITDA`, `normalizedPFCF`) are zeroed out, and the
fair-value range is computed from only the 3 own-historical anchors.

| Subject vs peers | Treatment |
|---|---|
| Peer median PE / Own PE > 5× | Drop peer-derived anchors (peers are bubbled) |
| Own PE / Peer median PE > 5× | Drop peer-derived anchors (peers are compressed) |
| Within 5× | Keep all anchors (current behavior) |

Surfaced on the FairValue output as `peerCohortDivergent: boolean`.
When true, the UI shows a chip explaining that peer multiples were
deemed unreliable; the displayed range reflects only the company's
own valuation history.

This defense is symmetric and complementary to the outlier rule:
- **Outlier rule** → subject EPS spike → normalize subject's earnings
- **Divergence rule** → peer cohort distortion → drop peer anchors

When both fire, they operate on different terms (subject EPS vs peer
multiples) and don't conflict.

The `5.0×` threshold was tuned via back-test. The first attempt at
3.0× over-fired (TGT 50% of snapshots, NVO 87%) on legitimate
structural premium (NVO trading at 30-50× while pharma peers trade
at 15-20×) and structural distress (TGT trading at 10-15× during
retail panics while WMT/COST stayed at 25-30×). 5.0× catches INTC's
bubble case (6.78× ratio) without firing on those everyday cases.

## 4. Inputs per company

Read from the cached snapshot:

| Field | Source | Used by |
|---|---|---|
| `ttm.eps`, `annual[].eps` | income-statement | P/E (current and normalized) |
| `ttm.ebitda`, `annual[].ebitda` | income-statement | EV/EBITDA (current and normalized) |
| `ttm.fcf`, `annual[].fcf` | cash-flow-statement (OCF − CapEx) | P/FCF |
| `ttm.sharesDiluted` | income-statement (`weightedAverageShsOutDil`) | Per-share normalization |
| `balanceSheet.totalDebt`, `balanceSheet.cash` | balance-sheet | EV calculation |
| `quote.price`, `quote.marketCap` | quote | Current valuation reference |
| `profile.industry`, `quote.marketCap` | profile + quote | Cohort assignment |

Normalized earnings = arithmetic average over the **most recent 5
profitable years out of the last 7**. This rule:

- Drops outlier loss years (e.g., INTC 2024) from the average.
- Requires at least 3 of 5 to qualify (consistent with the Quality
  floor in `ranking.md`).
- Falls back to "5Y simple average" if 7Y history isn't available.

## 5. Output structure

Per stock, attached to the ranked snapshot row:

```ts
type FairValue = {
  peerSet: "cohort" | "narrow" | "industry" | "sector";
  peerCount: number;

  anchors: {
    peerMedianPE:        number | null;  // implied $/share; null if no valid peer P/E
    peerMedianEVEBITDA:  number | null;
    peerMedianPFCF:      number | null;
    ownHistoricalPE:     number | null;
    ownHistoricalEVEBITDA: number | null;
    ownHistoricalPFCF:   number | null;
    normalizedPE:        number | null;
    normalizedEVEBITDA:  number | null;
    normalizedPFCF:      number | null;
  };

  range: {
    p25:    number;   // 25th percentile of non-null anchors
    median: number;
    p75:    number;
  };

  current: number;             // current price for reference
  upsideToP25Pct: number;      // (p25 - current) / current — headline metric
  upsideToMedianPct: number;   // (median - current) / current — secondary

  confidence: "high" | "medium" | "low";  // see §6
};
```

### 5.1 Headline upside is to the conservative tail

The ranked-table "Upside" column reads `upsideToP25Pct`, not the median.
Two reasons:

- **Honest entry threshold.** A stock between p25 and the median is
  not "below fair value" by the value-tilted defensive standard — it's
  inside the fair-value band. The conservative tail is the threshold
  that matters for taking action.
- **Bucketing alignment.** The Ranked bucket already requires
  `current < p25`. Showing the same metric on the table keeps the
  scoring and the gating consistent.

`upsideToMedianPct` stays in the type for reference / drill-down.

## 6. Confidence flag

A heuristic — not a probability, just a sanity signal in the UI.

| Condition | Confidence |
|---|---|
| `peerSet === "cohort"` AND ≥ 6 of 9 anchors are non-null AND inter-anchor spread (p75/p25) ≤ 1.5x | **high** |
| `peerSet ∈ {"cohort", "narrow"}` AND ≥ 4 of 9 anchors non-null AND spread ≤ 2.5x | **medium** |
| Otherwise (sparse peers, few anchors agree, or spread > 2.5x) | **low** |

Distressed turnarounds will almost always score `low` — the spread is
the signal: when anchors disagree by 3x+, the fair value is genuinely
uncertain and the user should treat the number as illustrative.

## 7. UI presentation (input to ui.md)

Per-stock card shows:

- **Bar chart** of fair-value range (p25–p75) with a tick at the median
  and another at current price. Color: green if current < p25, yellow
  if within range, red if > p75.
- **% upside to median** prominently displayed.
- **Confidence badge** (high/medium/low).
- **Drill-down** showing all 9 anchors as a table — user can see which
  ones agree and which are outliers.

For the **covered-call workflow**, the same fair-value tick marks
double as suggested target strikes:

- **Conservative strike** = anchor p25 (high probability of assignment;
  more premium income, less upside capture).
- **Aggressive strike** = anchor median (lower probability of
  assignment; more upside capture).

We deliberately do not pretend to do live options analytics in v1 — IV,
strike availability, and premium calculation require an options-chain
data source we don't have on the free FMP tier.

## 8. Edge cases

| Case | Handling |
|---|---|
| Negative TTM EPS | P/E anchors return `null`. EV/EBITDA and P/FCF still attempt. |
| Negative TTM FCF | P/FCF anchors return `null`. |
| Negative TTM EBITDA | EV/EBITDA anchors return `null`. |
| Stock fails Quality floor (`ranking.md`) | Still compute fair value if data permits — useful even on the turnaround watchlist. |
| Insufficient annual history (< 3 years) | Skip own-historical and normalized anchors; fall back to peer-median only. Confidence forced to **low**. |
| All 9 anchors null | Output `range: null`, UI shows "no fair value computable." |
| Multi-class shares (e.g., GOOGL/GOOG) | Out of scope for v1; treat as separate listings if both appear in the universe. |
| REITs and financials | Their multiples (P/B is more relevant than EV/EBITDA for banks, FFO matters for REITs) are mishandled by this generic spec. **Open question** — likely a v2 addition with industry-specific anchors. |

## 9. Test strategy

- **Unit tests:** synthetic peer sets with known statistics, verify
  median calculation, fallback rules, confidence assignment, edge
  cases (loss-makers, missing fields, single peer).
- **Mapping tests:** known FMP fixture → assert the right fields feed
  the right anchor formulas.
- **Regression tests** (extends ranking.md regression suite):
  the three validation snapshots from `case-study-2026-04-20.md` —
  NVO at $38.78 should produce fair-value median in **$60–80**; TGT at
  $81 in **$110–140**; INTC at $21 in **$35–65** with `confidence:
  "low"` flagged.

## 10. Open questions

1. REITs and banks need different anchors (FFO, P/TBV). Defer to v2 or
   handle inline?
2. Historical own-multiple needs price-on-fiscal-period-end to compute
   what the multiple actually was each year. Possible from the
   annual-ratios endpoint (which gives `priceToEarningsRatio` per
   period); confirm.
3. Should we also compute and display **dividend-discount-model** fair
   value for stable dividend payers? Adds complexity but matches the
   user's covered-call/income tilt.
4. International peers — when the cohort drops to N<3 in a US-only
   universe (e.g., specialty pharma), should we widen to global peers?
   Probably not for v1; sector fallback is simpler.
