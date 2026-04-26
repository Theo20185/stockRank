# Spec: Engine changes from Phase 4 backtests (2026-04-26)

**Status:** Phase 4 complete. Three findings, one engine change.

## 1. The headline

After Phase 1-3 + Phase 2D.1 settled the major decisions, Phase 4
extended the audit with three orthogonal questions:

- **4A** Long/short factor isolation — does value-deep's edge come
  from picking the top or avoiding the bottom?
- **4B** Risk-adjusted comparison (Sharpe/Sortino/max DD) — does
  any candidate win on risk-adjusted that loses on mean?
- **4C** H10 FV-trend demotion validation — does the production
  `fvTrend === "declining" → demote-to-Watch` rule survive PIT
  weight-validation?

## 2. Phase 4A — Long/short factor isolation

The data is striking:

| Regime | Top mean (3y) | Bottom mean (3y) | Long/short Δ |
|---|---|---|---|
| **PIT 2018-2023** | -2.03% | **-25.01%** | **+22.98 pp** |
| **PIT 2010-2018** | -0.86% | **+5.03%** | **−5.88 pp** |

In COVID era, the bottom decile drops 23 pp behind SPY — value-
deep's main job was **avoiding the worst names** (overpriced,
high-debt, weak-quality companies that subsequently got crushed).
The top decile barely beats SPY.

In pre-COVID, the signal **inverts**: the bottom decile actually
*outperforms* the top by ~6 pp. The "least value" cohort beat the
"most value" cohort over 2016 → 2019 forward windows. This makes
sense in a 2016-2019 window that ended in the COVID drawdown —
deep-value names continued to suffer; growth/momentum names did
better.

**Takeaway:** value-deep is not a "pick the winners" strategy; it's
a "don't pick the losers" strategy in regimes where losers get
crushed. In flat/growth-favoring regimes, value-deep's tail-
avoidance benefit goes away.

**Engine action:** none. The validation backtest still ranks
value-deep first across regimes via the comparison-to-default
adoption rule. Long/short data is informative for sizing /
concentration decisions (e.g., a long-short variant might extract
the COVID +22.98 pp gap directly) but those are out-of-scope for
this engine.

## 3. Phase 4C — H10 FV-trend demotion → REMOVE PRODUCTION RULE

The production rule in `buckets.ts`:
```ts
if (row.fvTrend === "declining") return "watch";
```

H10 hypothesis: declining-trend cohort underperforms stable+improving
on 3y forward excess return.

**Results:**

| Regime | Declining 3y | Stable+Improving 3y | Verdict |
|---|---|---|---|
| **PIT 2018-2023** | -4.76% | -10.05% | **fail** (declining +5.30 pp BETTER) |
| **PIT 2010-2018** | inconclusive | inconclusive | inconclusive |

Same pattern as the `fundamentalsDirection === "declining"` rule
we removed Phase 2B (commit `7d5bb00`):
- The rule LOOKS defensive ("avoid declining fundamentals")
- PIT weight-validation evidence shows it doesn't earn its keep
- Worse: in COVID-era data the rule's signal inverts — declining
  cohort actually OUTPERFORMS

**Why it fails in COVID:** "declining FV-trend" includes companies
whose peer multiples expanded (peer-relative FV decline), not just
companies with deteriorating fundamentals. Those are *cheaper than
peers* and are exactly what value-deep wants to buy. Filtering
them out removes some of the best long-term winners.

The original calibration ("96% of miss-p25 events coincide with
declining FV") was measuring a different question on biased data.
Same critique as fundamentalsDirection: not the right question, not
the right data.

**Engine change: REMOVE the `fvTrend === "declining"` demotion**
in `buckets.ts`. This commit ships the removal.

The fvTrend field stays on RankedRow as informational metadata for
the UI drill-down — only its role as a bucket gate is removed.

## 4. Phase 4B — Risk-adjusted comparison → no change

Sample (PIT 2018-2023):

| Candidate | Mean excess (3y) | Sharpe-like | Sortino-like | Max DD |
|---|---|---|---|---|
| default (value-deep) | -2.03% | -0.32 | -0.31 | -4.62% |
| value-tilted-defensive-legacy | -3.68% | -0.52 | -0.44 | -10.50% |
| equal-weight | -12.73% | -1.41 | -0.79 | -6.44% |
| quality-tilt | -10.68% | (similar) | (similar) | (similar) |
| momentum-on | -1.84% | (similar) | (similar) | (similar) |
| value-deep-evtilt | -5.19% | (similar) | (similar) | (similar) |
| value-deep-no-declining-fundamentals | -0.47% | (similar) | (similar) | (similar) |

No candidate flips a verdict by switching from mean to risk-
adjusted comparison. value-deep is the best on Sharpe/Sortino in
COVID era; everything is negative absolute in pre-COVID.

The momentum-on top-decile had +2.47% mean in pre-COVID 3y, the
only positive — but it was rejected because CI crosses zero. Risk-
adjusted view confirms momentum-on isn't a meaningful improvement
over value-deep.

**Engine change:** none. Risk-adjusted view doesn't surface a new
winner.

## 5. Cumulative production code changes from Phases 1–4

| Phase | Change | Status |
|---|---|---|
| Phase A (initial) | `DEFAULT_WEIGHTS` migrated to value-deep | shipped |
| Phase 2 (options) | options-liquid bucket gate removed | shipped |
| Phase 2B | `fundamentalsDirection === "declining"` bucket demotion removed | shipped |
| Phase 2D.1 | `cikFor` SEC fallback for delisted EDGAR; bumped Node heap to 8GB | shipped |
| **Phase 4C** | **`fvTrend === "declining"` bucket demotion removed** | **this commit** |

Three signals that "looked defensive" got removed: options-liquid,
fundamentalsDirection, fvTrend. All three were calibrated against
biased survivor-only data and didn't survive PIT weight-validation.
The pattern is consistent enough that it deserves naming: **the
defensive-instinct calibration trap.**

## 6. What's left in the bucket classifier

After Phase 4C removes the fvTrend rule, the bucket classifier in
`buckets.ts` reduces to:

- **excluded**: model-incompatible industry, all-categories-null
  ineligible-row, negative-equity-without-FV, no-FV-range
- **watch**: negative-equity-with-FV, current price ≥ p25 (above
  conservative tail)
- **ranked**: passed quality floor + has FV range + current price <
  p25

That's it. Three remaining demotion conditions, all directly tied
to the price-vs-FV thesis. No more "defensive overlay" rules.

## 7. Spec annotations

- `ranking.md` §11.7: H10 verdict updated to "**fail (forward-
  return evidence)** — production demotion removed Phase 4C." Note
  the +5.30 pp gap going wrong direction in COVID era.
- `ranking.md` §FV-trend (the section that referenced the
  demotion): note the rule was removed.
- `backtest-test-log.md`: append rows for Phase 4A/B/C runs.
- `backtest-roadmap.md`: Phase 4 marked complete. Tier-3 items
  still recorded.

## 8. Phase 4 closes the backtest arc

Phases 1-4 plus the spec changes from Phase 2D.1 cover the full
backtest program. The major findings:

1. **value-deep is the right default** (regime-stable in
   adoption-rule comparison, 2 of 2 PIT regimes with delisted
   included)
2. **value-deep's edge is mostly tail-avoidance**, not top-decile
   selection (Phase 4A), and is regime-dependent (works in COVID,
   inverts pre-COVID)
3. **§4 Quality floor is justified** (Phase 2D.1, regime-stable
   PASS)
4. **§7 Turnaround watchlist is a regime-dependent short-horizon
   flag**, not a long-term hold thesis
5. **All three "defensive overlay" rules were removed** —
   options-liquid, fundamentalsDirection, fvTrend
6. **Per-super-group presets fail** the cross-regime adoption rule
   (Phase 3)
7. **H10 demotion fails** the forward-return test (Phase 4C)

Tier-3 follow-ups (top-N concentration, within-category dominance,
sector vs super-group ranker cohorts, extended universe for ADR
holdings, v3 historical-filer index) recorded but not prioritized.
Recommend shipping current state and observing engine behavior
over the next quarter.
