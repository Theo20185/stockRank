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
  upsideToMedianPct: number;   // (median - current) / current

  confidence: "high" | "medium" | "low";  // see §6
};
```

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
