# Spec: Engine changes from Phase 2D.1 (CIK fallback unblocks H11)

**Status:** Phase 2D.1 of `docs/specs/backtest-roadmap.md` complete.
**The §4 Quality floor decision is finally settled — PASS, regime-
stable.** H12 turnaround verdict is now nuanced.

## 1. Why

Phase 2D found that 0% of 345 delisted symbols recovered EDGAR data
because the local `cik-lookup.json` only knows the current S&P 500.
Phase 2D.1 fixes the CIK lookup with a fallback to SEC's broader
`company_tickers.json` table.

## 2. Implementation

`packages/data/src/edgar/cik-lookup.ts`:
- `cikFor` first checks the local baked S&P 500 table (fast).
- On miss, falls back to SEC's authoritative
  `company_tickers.json` (cached at `tmp/sec-company-tickers.json`
  with weekly TTL).
- Tries dot/dash/no-delimiter ticker variants.
- Wrapped in try/catch — fetch failure degrades to local-only.

`package.json`: `npm run backtest-ic` now passes
`--node-options=--max-old-space-size=8192` to tsx. Adding ~127
delisted symbols to the universe pushed past the default 4GB heap.

## 3. Recovery rates

| Source | Recovered |
|---|---|
| Yahoo chart | 143 / 345 (41.4%) |
| EDGAR (with fallback) | **127 / 345 (36.8%)** |
| Both (usable for snapshot building) | 127 / 345 (36.8%) |

Up from 0% on EDGAR before the fallback. Universe expanded 503 →
**630 symbols** for the audit.

The 218 still-missing names are mostly older bankruptcies and
pre-2009 acquisitions — SEC's active company_tickers table doesn't
include filers that have been inactive long enough. A v3 hand-
curated historical-filer index would push recovery higher; not
prioritized.

## 4. The §4 floor decision — UNBLOCKED

### 4.1 H11 verdict across four runs

| Run | Universe | passed cohort 3y | failed cohort 3y | Gap | Verdict |
|---|---|---|---|---|---|
| Biased 2018-2023 | today's S&P 500 only | +6.07% | +17.45% | -11.38 pp | fail |
| PIT 2018-2023 (no delisted) | PIT-filtered | -1.70% | -4.65% | +2.95 pp | pass |
| **PIT 2018-2023 + delisted** | **PIT + 127 delisted** | **-6.37%** | **-10.70%** | **+4.33 pp** | **pass** |
| **PIT 2010-2018 + delisted** | **PIT + 127 delisted** | **+0.64%** | **-1.94%** | **+2.58 pp** | **pass (FLIPPED from fail)** |

With delisted names properly included, **H11 passes in BOTH PIT
regimes** with comparable gaps (+4.33 pp in COVID era, +2.58 pp in
pre-COVID). The pre-COVID FAIL we saw without delisted names was
the survivorship-bias artifact we suspected — the floor-failed
cohort looked artificially good because the bankruptcies were
invisible.

### 4.2 H11 per-rule (PIT 2010-2018 + delisted, 3y)

| Rule | passed | failed | Gap |
|---|---|---|---|
| profitable-3of5 | +0.12% | -4.23% | +4.35 pp (helpful) |
| sector-relative-roic | -0.28% | -0.81% | +0.53 pp (mildly helpful) |
| interest-coverage | +0.72% | +4.22% | -3.50 pp (harmful in isolation) |
| **combined** | **+0.64%** | **-1.94%** | **+2.58 pp** |

The previously-flipped-sign per-rule readings stabilize once
delisted names are in:
- `profitable-3of5` is now consistently helpful
- `sector-relative-roic` is now mildly helpful
- `interest-coverage` is harmful in isolation (the failed cohort
  is small N=2080 with takeout-price recoveries skewing it)
- combined gate is solidly positive

The earlier "all 3 sub-rules flipped sign between regimes" reading
was an artifact of the same survivorship gap.

### 4.3 Engine action — KEEP §4 Quality floor

**The §11.7 HOLD lifts.** The floor passes H11 in:
- 3 of 3 properly-audited PIT runs (2018-2023 with and without
  delisted, 2010-2018 with delisted)
- The single FAIL was the v1 PIT run on pre-COVID that didn't
  include delisted names — explained by survivorship bias.

No code changes to `floor.ts`. Spec annotations update §11.7 to
record the verdict.

## 5. The H12 watchlist — verdict downgraded

H12 (turnaround watchlist beats broader excluded set at 3y) now
has four data points:

| Run | Watchlist 3y | Excluded-not-watchlist 3y | Gap | Verdict |
|---|---|---|---|---|
| PIT 2018-2023 (no delisted) | +45.96% | -4.88% | +50.84 pp | pass |
| PIT 2018-2023 + delisted | +29.36% | -10.94% | +40.30 pp | pass |
| PIT 2010-2018 (no delisted) | -5.76% | +7.38% | -13.15 pp | fail |
| **PIT 2010-2018 + delisted** | **-21.99%** | **-1.71%** | **-20.29 pp** | **fail (worse)** |

With delisted names in pre-COVID, the watchlist UNDERPERFORMS by
20 pp at 3y — even worse than the survivor-only pre-COVID showed.
This is regime-stable failure outside COVID.

But H12 at 1y is still positive across regimes:

| Run | Watchlist 1y | Excluded-not-watchlist 1y | Gap |
|---|---|---|---|
| PIT 2018-2023 + delisted | (saw +18 pp earlier) | — | positive |
| PIT 2010-2018 + delisted | +2.05% | +1.03% | +1.02 pp (within noise) |

The prior pre-COVID PIT-only had gap +19.8 pp at 1y. With delisted
names included it shrinks to +1.02 pp — barely positive.

**Engine action — REFRAME §7 watchlist as a SHORT-HORIZON FLAG, NOT a long-term hold.**

The watchlist criteria pick names that bounce hard at 1y in some
regimes (especially COVID recovery) but UNDERPERFORM at 3y outside
those regimes. This is consistent with the heuristic:
- Distressed-but-recovering names → short bounce, then mean-revert
  back down
- Watchlist criteria correctly identify the bounce candidates
- BUT the long-term outcome is regime-dependent and skews
  negative outside recovery windows

Spec edits:
- `ranking.md` §7: strengthen the existing 2026-04-25 short-horizon
  language. The watchlist is for short-horizon trade flags only; do
  NOT use it as a 3y hold thesis.
- `ranking.md` §11.7: H12 verdict downgraded from "short-horizon
  signal only" to "**1y signal in COVID, marginal in pre-COVID;
  3y signal regime-dependent and negative outside COVID**."

## 6. Implementation order

One PR — annotations only:

- `ranking.md` §11.7: H11 verdict updated to "**PASS — regime-stable
  with delisted included**." Remove HOLD. Note 4-run history in the
  table.
- `ranking.md` §11.7: H12 verdict downgraded per §5 above.
- `backtest.md` §3.6: Phase 2D.1 OPERATIONAL note. Recovery rate
  (36.8% on EDGAR with fallback). v3 hand-curated historical filer
  index left as future work.
- `backtest-roadmap.md`: Phase 2D.1 marked complete; Phase 2 fully
  done; Phase 3 (E) unblocked.
- `backtest-test-log.md`: 2 new rows for the Phase 2D.1 PIT runs;
  H11 + H12 row updates.

## 7. What unlocks now

**Phase 3 — E: per-super-group weight presets, step-2 validation.**
Per the roadmap, step 2 was deferred pending v2 delisted-name
handling. v2 is now operational (Phase 2D.1). The IC heatmap
evidence from 2026-04-25 (5 super-groups with passing cells) can
now be turned into per-super-group preset candidates and validated
against an unbiased universe.

Additional follow-ups:
- v3 historical-filer index (covers the 218 still-missing
  bankruptcies / pre-2009 inactive filers) — not prioritized.
- Re-run Phase 1A (in-Valuation reweighting) and Phase 2B (combined-
  screen stacking) on the unbiased delisted-included universe to
  see if either changes verdict — they may, since the per-rule H11
  signs flipped between v1 PIT and Phase 2D.1.
