# Back-test accuracy report

Generated 2026-04-22 by `scripts/backtest.ts --accuracy`. Symbols: EIX, INCY, TGT, INTC, AAPL, MSFT, JNJ, PG, KO, JPM, XOM, NEE, ADBE, HON, ACN. Window: 8y of monthly snapshots.

> **Survivorship-bias caveat.** This run uses today's S&P 500 universe. Names that went bankrupt, were acquired, or got dropped from the index are silently excluded. Realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr in S&P over multi-year windows). Treat absolute hit rates as ceilings, not point estimates.

> **Forward-EPS unavailable.** The outlier rule's forward-corroboration check runs with `forward = null` historically, mapping to the conservative branch (treat spike as one-time). Real-time accuracy may be modestly different.

## Hypothesis verdicts

- **H1** — Names with positive p25 upside reach p25 within 3y at ≥ 60% → **? inconclusive**
  - n=5, hit p25 = — (threshold: 60%)
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
| 1y | 573 | 77% (72–80%) | 64% (59–68%) | 47% (42–52%) | +8.3% (6.3…10.5) | -9.6% (-11.6…-7.4) | -2.2% (-4.2…-0.1) | -4.2% (-6.2…-2.0) |
| 2y | 393 | 80% (74–85%) | 74% (68–79%) | 61% (55–67%) | +18.6% (15.3…22.1) | -25.0% (-28.6…-21.7) | -7.0% (-10.6…-3.7) | -11.7% (-15.2…-8.3) |
| 3y | 213 | 83% (69–91%) | 63% (49–75%) | 61% (46–74%) | +27.9% (21.9…33.8) | -37.3% (-43.4…-31.8) | -7.5% (-13.2…-1.8) | -14.7% (-20.5…-9.0) |


## With assumed +4%/yr options overlay

> **Hypothetical.** Yahoo doesn't expose historical option chains, so we can't measure actual covered-call / cash-secured-put income from prior dates. This section adds a fixed **+4% annualized** to every snapshot's realized return and recomputes excess returns against the same baselines. Interpretation: "what would performance look like if we ran a disciplined covered-call / CSP overlay on these names." Conservative single-anchor LEAPS overlays in the literature land in the 3–6% range; sweep the flag to test sensitivity. (The earlier Candidate-stratum tables show the same overlay applied only to Candidate snapshots when N is large enough to populate them.)

### Headline (yearly-deduped) with overlay

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 19 | — | — | — | — | — | — | — |
| 2y | 19 | — | — | — | — | — | — | — |
| 3y | 19 | — | — | — | — | — | — | — |


### Sensitivity (monthly) with overlay

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 573 | 77% (72–80%) | 64% (59–68%) | 47% (42–52%) | +12.3% (10.3…14.5) | -5.6% (-7.6…-3.4) | +1.8% (-0.2…3.9) | -0.2% (-2.2…2.0) |
| 2y | 393 | 80% (74–85%) | 74% (68–79%) | 61% (55–67%) | +26.6% (23.3…30.1) | -17.0% (-20.6…-13.7) | +1.0% (-2.6…4.3) | -3.7% (-7.2…-0.3) |
| 3y | 213 | 83% (69–91%) | 63% (49–75%) | 61% (46–74%) | +39.9% (33.9…45.8) | -25.3% (-31.4…-19.8) | +4.5% (-1.2…10.2) | -2.7% (-8.5…3.0) |


**Baselines.** *SPY* = SPDR S&P 500 ETF (cap-weighted, total return) — what most investors compare to. *RSP* = Invesco S&P 500 Equal Weight ETF — strips Mag7 concentration; the gap (excess vs SPY) − (excess vs RSP) quantifies how much underperformance is the index's top-heavy concentration. *VTV* = Vanguard Value ETF — large-cap value style; beating it means stock-picking generates real alpha over a buy-the-style ETF.

Hit-rate CIs are Wilson 95%; mean-return CIs are 1000-resample bootstrap with seeded RNG. Strata with N < 30 show "—".