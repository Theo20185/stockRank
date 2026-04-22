# Back-test accuracy report

Generated 2026-04-22 by `scripts/backtest.ts --accuracy`. Symbols: EIX, INCY, TGT, INTC, AAPL, MSFT, JNJ, PG, KO, JPM, XOM, NEE, ADBE, HON, ACN. Window: 8y of monthly snapshots.

> **Survivorship-bias caveat.** This run uses today's S&P 500 universe. Names that went bankrupt, were acquired, or got dropped from the index are silently excluded. Realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr in S&P over multi-year windows). Treat absolute hit rates as ceilings, not point estimates.

> **Forward-EPS unavailable.** The outlier rule's forward-corroboration check runs with `forward = null` historically, mapping to the conservative branch (treat spike as one-time). Real-time accuracy may be modestly different.

## Hypothesis verdicts

- **H1** — Names with positive p25 upside reach p25 within 3y at ≥ 60% → **? inconclusive**
  - n=3, hit p25 = — (threshold: 60%)
- **H2** — Names with positive median upside reach median within 3y at ≥ 50% → **? inconclusive**
  - n=10, hit median = — (threshold: 50%)
- **H3-SPY** — Candidates (gate-off) beat SPY (cap-weight) over 3y on average → **? inconclusive**
  - n=0, mean excess vs SPY = —
- **H3-RSP** — Candidates (gate-off) beat RSP (equal-weight S&P 500) over 3y on average → **? inconclusive**
  - n=0, mean excess vs RSP = — — gap vs SPY excess quantifies Mag7 concentration tailwind
- **H3-VTV** — Candidates (gate-off) beat VTV (Vanguard Value) over 3y on average → **? inconclusive**
  - n=0, mean excess vs VTV = — — beating this means stock-picking generates real alpha over a value ETF
- **H4** — Outlier-rule-fired snapshots have ≥ excess return (vs SPY) as not-fired snapshots (3y) → **? inconclusive**
  - fired: n=0, excess=—; not-fired: n=19, excess=—
- **H5** — High-confidence snapshots have a tighter realized-return CI than low-confidence (3y) → **? inconclusive**
  - high: n=0, realized=—; low: n=15, realized=—
- **H6** — Peer-cohort-divergent snapshots have worse p25 accuracy than non-divergent (3y) → **? inconclusive**
  - divergent: n=0, hit p25=—; stable: n=19, hit p25=—

## Headline (yearly-deduped — one snapshot per symbol per year)

### All snapshots (gate-off Candidates included or not)

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 19 | — | — | — | — | — | — | — |
| 2y | 19 | — | — | — | — | — | — | — |
| 3y | 19 | — | — | — | — | — | — | — |


### By gate-off Candidate flag

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Non-candidate | 1y | 19 | — | — | — | — | — | — |
| Non-candidate | 2y | 19 | — | — | — | — | — | — |
| Non-candidate | 3y | 19 | — | — | — | — | — | — |


### By today-liquid Candidate flag (gap vs gate-off quantifies options-liquidity gate's selection)

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Non-candidate | 1y | 19 | — | — | — | — | — | — |
| Non-candidate | 2y | 19 | — | — | — | — | — | — |
| Non-candidate | 3y | 19 | — | — | — | — | — | — |


### By outlier-rule fired

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| TTM trusted | 1y | 19 | — | — | — | — | — | — |
| TTM trusted | 2y | 19 | — | — | — | — | — | — |
| TTM trusted | 3y | 19 | — | — | — | — | — | — |


### By confidence label

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| medium | 1y | 4 | — | — | — | — | — | — |
| medium | 2y | 4 | — | — | — | — | — | — |
| medium | 3y | 4 | — | — | — | — | — | — |
| low | 1y | 15 | — | — | — | — | — | — |
| low | 2y | 15 | — | — | — | — | — | — |
| low | 3y | 15 | — | — | — | — | — | — |


### By peer-cohort divergent

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Stable | 1y | 19 | — | — | — | — | — | — |
| Stable | 2y | 19 | — | — | — | — | — | — |
| Stable | 3y | 19 | — | — | — | — | — | — |


## Sensitivity (every monthly snapshot — overstates effective N by ~12×)

### All monthly snapshots

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 573 | 73% (69–77%) | 60% (55–64%) | 42% (38–47%) | +6.1% (4.1…8.3) | -10.2% (-12.2…-8.0) | -2.6% (-4.6…-0.4) | -3.6% (-5.7…-1.5) |
| 2y | 393 | 76% (70–81%) | 66% (60–72%) | 53% (46–59%) | +13.9% (10.6…17.2) | -25.9% (-29.3…-22.5) | -7.6% (-11.0…-4.3) | -10.1% (-13.6…-6.7) |
| 3y | 213 | 74% (60–84%) | 61% (46–74%) | 59% (44–72%) | +20.5% (15.0…26.2) | -38.0% (-43.9…-32.6) | -8.1% (-13.7…-2.8) | -11.9% (-17.5…-6.4) |


**Baselines.** *SPY* = SPDR S&P 500 ETF (cap-weighted, total return) — what most investors compare to. *RSP* = Invesco S&P 500 Equal Weight ETF — strips Mag7 concentration; the gap (excess vs SPY) − (excess vs RSP) quantifies how much underperformance is the index's top-heavy concentration. *VTV* = Vanguard Value ETF — large-cap value style; beating it means stock-picking generates real alpha over a buy-the-style ETF.

Hit-rate CIs are Wilson 95%; mean-return CIs are 1000-resample bootstrap with seeded RNG. Strata with N < 30 show "—".