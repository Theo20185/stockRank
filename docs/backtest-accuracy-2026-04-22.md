# Back-test accuracy report

Generated 2026-04-22 by `scripts/backtest.ts --accuracy --all-sp500 --years 8 --horizons 1,2,3 --options-overlay-pct 4`. Universe: full S&P 500 (498 names attempted, 575 yearly snapshots produced). Window: 8y of monthly snapshots.

> **Survivorship-bias caveat.** This run uses today's S&P 500 universe. Names that went bankrupt, were acquired, or got dropped from the index are silently excluded. Realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr in S&P over multi-year windows). Treat absolute hit rates as ceilings, not point estimates.

> **Forward-EPS unavailable.** The outlier rule's forward-corroboration check runs with `forward = null` historically, mapping to the conservative branch (treat spike as one-time). Real-time accuracy may be modestly different.

## Hypothesis verdicts

- **H1** — Names with positive p25 upside reach p25 within 3y at ≥ 60% → **? inconclusive**
  - n=67, hit p25 = 70% (58–80%) (threshold: 60%)
- **H2** — Names with positive median upside reach median within 3y at ≥ 50% → **✓ pass**
  - n=156, hit median = 59% (51–66%) (threshold: 50%)
- **H3-SPY** — Candidates (gate-off) beat SPY (cap-weight) over 3y on average → **? inconclusive**
  - n=0, mean excess vs SPY = —
- **H3-RSP** — Candidates (gate-off) beat RSP (equal-weight S&P 500) over 3y on average → **? inconclusive**
  - n=0, mean excess vs RSP = — — gap vs SPY excess quantifies Mag7 concentration tailwind
- **H3-VTV** — Candidates (gate-off) beat VTV (Vanguard Value) over 3y on average → **? inconclusive**
  - n=0, mean excess vs VTV = — — beating this means stock-picking generates real alpha over a value ETF
- **H4** — Outlier-rule-fired snapshots have ≥ excess return (vs SPY) as not-fired snapshots (3y) → **? inconclusive**
  - fired: n=0, excess=—; not-fired: n=575, excess=+5.6% (-7.5…20.8)
- **H5** — High-confidence snapshots have a tighter realized-return CI than low-confidence (3y) → **✓ pass**
  - high: n=33, realized=+44.7% (30.5…60.6); low: n=410, realized=+83.0% (65.5…102.5)
- **H6** — Peer-cohort-divergent snapshots have worse p25 accuracy than non-divergent (3y) → **✓ pass**
  - divergent: n=36, hit p25=64% (48–78%); stable: n=539, hit p25=83% (79–86%)

## Headline (yearly-deduped — one snapshot per symbol per year)

### All snapshots (gate-off Candidates included or not)

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 575 | 80% (76–83%) | 69% (65–72%) | 55% (51–59%) | +23.4% (19.8…27.8) | -0.9% (-4.7…3.3) | +10.2% (6.6…14.6) | +8.4% (4.7…12.7) |
| 2y | 575 | 82% (78–85%) | 73% (69–76%) | 60% (56–64%) | +42.6% (35.5…51.6) | -1.0% (-8.1…8.0) | +18.5% (11.5…27.3) | +12.3% (5.2…21.1) |
| 3y | 575 | 82% (78–85%) | 74% (71–78%) | 66% (62–70%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By gate-off Candidate flag

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Non-candidate | 1y | 575 | 80% (76–83%) | 69% (65–72%) | +23.4% (19.8…27.8) | -0.9% (-4.7…3.3) | +10.2% (6.6…14.6) | +8.4% (4.7…12.7) |
| Non-candidate | 2y | 575 | 82% (78–85%) | 73% (69–76%) | +42.6% (35.5…51.6) | -1.0% (-8.1…8.0) | +18.5% (11.5…27.3) | +12.3% (5.2…21.1) |
| Non-candidate | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By today-liquid Candidate flag (gap vs gate-off quantifies options-liquidity gate's selection)

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Non-candidate | 1y | 575 | 80% (76–83%) | 69% (65–72%) | +23.4% (19.8…27.8) | -0.9% (-4.7…3.3) | +10.2% (6.6…14.6) | +8.4% (4.7…12.7) |
| Non-candidate | 2y | 575 | 82% (78–85%) | 73% (69–76%) | +42.6% (35.5…51.6) | -1.0% (-8.1…8.0) | +18.5% (11.5…27.3) | +12.3% (5.2…21.1) |
| Non-candidate | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By outlier-rule fired

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| TTM trusted | 1y | 575 | 80% (76–83%) | 69% (65–72%) | +23.4% (19.8…27.8) | -0.9% (-4.7…3.3) | +10.2% (6.6…14.6) | +8.4% (4.7…12.7) |
| TTM trusted | 2y | 575 | 82% (78–85%) | 73% (69–76%) | +42.6% (35.5…51.6) | -1.0% (-8.1…8.0) | +18.5% (11.5…27.3) | +12.3% (5.2…21.1) |
| TTM trusted | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By confidence label

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| high | 1y | 33 | 64% (47–78%) | 61% (44–75%) | +10.3% (3.2…18.6) | -16.1% (-23.4…-7.7) | -4.5% (-11.8…4.0) | -6.6% (-13.9…1.9) |
| high | 2y | 33 | 91% (76–97%) | 82% (66–91%) | +27.8% (17.6…38.6) | -19.3% (-28.2…-10.1) | +0.1% (-9.1…9.9) | -6.3% (-15.3…3.8) |
| high | 3y | 33 | 85% (69–93%) | 82% (66–91%) | +44.7% (30.5…60.6) | -28.1% (-40.5…-14.6) | +2.3% (-10.8…16.8) | -9.2% (-22.7…5.9) |
| medium | 1y | 132 | 84% (77–89%) | 71% (63–78%) | +22.4% (12.4…35.3) | -5.4% (-15.4…7.5) | +6.1% (-3.8…19.0) | +4.0% (-6.0…16.9) |
| medium | 2y | 132 | 80% (72–86%) | 68% (60–76%) | +28.8% (18.7…41.4) | -13.9% (-24.2…-1.5) | +4.4% (-5.8…16.8) | -2.7% (-12.7…9.7) |
| medium | 3y | 132 | 80% (73–86%) | 69% (61–76%) | +52.9% (31.0…75.3) | -14.8% (-35.6…7.5) | +13.2% (-8.5…35.5) | +0.7% (-21.0…23.0) |
| low | 1y | 410 | 80% (75–83%) | 69% (64–73%) | +24.8% (20.5…29.0) | +1.7% (-2.4…5.8) | +12.7% (8.6…16.8) | +11.0% (6.8…15.1) |
| low | 2y | 410 | 82% (78–85%) | 74% (69–78%) | +48.3% (39.1…59.3) | +4.6% (-4.7…16.0) | +24.5% (15.1…35.6) | +18.6% (9.2…29.7) |
| low | 3y | 410 | 82% (78–85%) | 76% (71–80%) | +83.0% (65.5…102.5) | +14.9% (-2.7…34.7) | +44.9% (27.5…64.7) | +33.7% (16.4…53.4) |


### By peer-cohort divergent

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Divergent | 1y | 36 | 67% (50–80%) | 67% (50–80%) | +26.0% (6.6…54.5) | -0.9% (-20.0…27.3) | +10.8% (-8.3…39.0) | +8.9% (-10.1…37.0) |
| Divergent | 2y | 36 | 72% (56–84%) | 72% (56–84%) | +38.1% (15.3…66.1) | -5.2% (-28.7…23.6) | +14.3% (-8.6…42.3) | +7.6% (-15.3…35.2) |
| Divergent | 3y | 36 | 64% (48–78%) | 64% (48–78%) | +99.2% (28.8…203.7) | +31.0% (-39.5…134.7) | +60.0% (-10.4…164.5) | +48.0% (-22.2…152.4) |
| Stable | 1y | 539 | 81% (77–84%) | 69% (65–73%) | +23.3% (19.7…27.4) | -0.9% (-4.4…3.2) | +10.2% (6.7…14.4) | +8.3% (4.9…12.5) |
| Stable | 2y | 539 | 82% (79–85%) | 73% (69–76%) | +42.9% (36.5…52.5) | -0.8% (-7.1…8.7) | +18.8% (12.3…28.5) | +12.6% (6.1…22.3) |
| Stable | 3y | 539 | 83% (79–86%) | 75% (71–79%) | +72.2% (60.8…88.0) | +3.9% (-7.2…20.1) | +33.5% (22.3…49.4) | +22.1% (10.7…38.0) |


## Sensitivity (every monthly snapshot — overstates effective N by ~12×)

### All monthly snapshots

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 18361 | 78% (78–79%) | 63% (62–64%) | 48% (47–49%) | +18.1% (17.5…18.8) | -0.5% (-1.2…0.2) | +7.2% (6.5…7.9) | +5.3% (4.7…6.0) |
| 2y | 12407 | 81% (80–82%) | 70% (69–71%) | 58% (56–59%) | +48.9% (46.5…51.5) | +3.9% (1.5…6.4) | +22.3% (19.9…24.9) | +17.8% (15.3…20.3) |
| 3y | 6484 | 76% (74–78%) | 70% (67–72%) | 64% (61–66%) | +78.7% (73.1…85.4) | +11.4% (5.9…17.9) | +42.3% (36.7…48.8) | +35.3% (29.7…41.9) |


## With assumed +4%/yr options overlay

> **Hypothetical.** Yahoo doesn't expose historical option chains, so we can't measure actual covered-call / cash-secured-put income from prior dates. This section adds a fixed **+4% annualized** to every snapshot's realized return and recomputes excess returns against the same baselines. Interpretation: "what would performance look like if we ran a disciplined covered-call / CSP overlay on these names." Conservative single-anchor LEAPS overlays in the literature land in the 3–6% range; sweep the flag to test sensitivity. (The earlier Candidate-stratum tables show the same overlay applied only to Candidate snapshots when N is large enough to populate them.)

### Headline (yearly-deduped) with overlay

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 575 | 80% (76–83%) | 69% (65–72%) | 55% (51–59%) | +27.4% (23.8…31.8) | +3.1% (-0.7…7.3) | +14.2% (10.6…18.6) | +12.4% (8.7…16.7) |
| 2y | 575 | 82% (78–85%) | 73% (69–76%) | 60% (56–64%) | +50.6% (43.5…59.6) | +7.0% (-0.1…16.0) | +26.5% (19.5…35.3) | +20.3% (13.2…29.1) |
| 3y | 575 | 82% (78–85%) | 74% (71–78%) | 66% (62–70%) | +85.9% (72.6…101.4) | +17.6% (4.5…32.8) | +47.2% (33.9…62.6) | +35.7% (22.5…51.2) |


### Sensitivity (monthly) with overlay

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 18361 | 78% (78–79%) | 63% (62–64%) | 48% (47–49%) | +22.1% (21.5…22.8) | +3.5% (2.8…4.2) | +11.2% (10.5…11.9) | +9.3% (8.7…10.0) |
| 2y | 12407 | 81% (80–82%) | 70% (69–71%) | 58% (56–59%) | +56.9% (54.5…59.5) | +11.9% (9.5…14.4) | +30.3% (27.9…32.9) | +25.8% (23.3…28.3) |
| 3y | 6484 | 76% (74–78%) | 70% (67–72%) | 64% (61–66%) | +90.7% (85.1…97.4) | +23.4% (17.9…29.9) | +54.3% (48.7…60.8) | +47.3% (41.7…53.9) |


**Baselines.** *SPY* = SPDR S&P 500 ETF (cap-weighted, total return) — what most investors compare to. *RSP* = Invesco S&P 500 Equal Weight ETF — strips Mag7 concentration; the gap (excess vs SPY) − (excess vs RSP) quantifies how much underperformance is the index's top-heavy concentration. *VTV* = Vanguard Value ETF — large-cap value style; beating it means stock-picking generates real alpha over a buy-the-style ETF.

Hit-rate CIs are Wilson 95%; mean-return CIs are 1000-resample bootstrap with seeded RNG. Strata with N < 30 show "—".