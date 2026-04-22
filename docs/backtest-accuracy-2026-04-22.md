# Back-test accuracy report

Generated 2026-04-22 by `scripts/backtest.ts --accuracy`. Universe: full S&P 500 (498 names). Window: 8y of monthly snapshots.

> **Survivorship-bias caveat.** This run uses today's S&P 500 universe. Names that went bankrupt, were acquired, or got dropped from the index are silently excluded. Realized returns are biased upward by an unknown amount (literature suggests 1–2% / yr in S&P over multi-year windows). Treat absolute hit rates as ceilings, not point estimates.

> **Forward-EPS unavailable.** The outlier rule's forward-corroboration check runs with `forward = null` historically, mapping to the conservative branch (treat spike as one-time). Real-time accuracy may be modestly different.

## Hypothesis verdicts

- **H1** — Names with positive p25 upside reach p25 within 3y at ≥ 60% → **? inconclusive**
  - n=64, hit p25 = 69% (57–79%) (threshold: 60%)
- **H2** — Names with positive median upside reach median within 3y at ≥ 50% → **✓ pass**
  - n=153, hit median = 60% (52–68%) (threshold: 50%)
- **H3-SPY-1y** — Candidates (gate-off) beat SPY (cap-weight) over 1y on average → **? inconclusive**
  - n=43, mean excess vs SPY = +8.4% (-3.9…23.0)
- **H3-RSP-1y** — Candidates (gate-off) beat RSP (equal-weight S&P 500) over 1y on average → **✓ pass**
  - n=43, mean excess vs RSP = +13.7% (1.3…28.0)
- **H3-VTV-1y** — Candidates (gate-off) beat VTV (Vanguard Value) over 1y on average → **? inconclusive**
  - n=43, mean excess vs VTV = +10.5% (-1.8…24.8)
- **H3-SPY-2y** — Candidates (gate-off) beat SPY (cap-weight) over 2y on average → **? inconclusive**
  - n=0, mean excess vs SPY = —
- **H3-RSP-2y** — Candidates (gate-off) beat RSP (equal-weight S&P 500) over 2y on average → **? inconclusive**
  - n=0, mean excess vs RSP = —
- **H3-VTV-2y** — Candidates (gate-off) beat VTV (Vanguard Value) over 2y on average → **? inconclusive**
  - n=0, mean excess vs VTV = —
- **H3-SPY-3y** — Candidates (gate-off) beat SPY (cap-weight) over 3y on average → **? inconclusive**
  - n=0, mean excess vs SPY = —
- **H3-RSP-3y** — Candidates (gate-off) beat RSP (equal-weight S&P 500) over 3y on average → **? inconclusive**
  - n=0, mean excess vs RSP = —
- **H3-VTV-3y** — Candidates (gate-off) beat VTV (Vanguard Value) over 3y on average → **? inconclusive**
  - n=0, mean excess vs VTV = —
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
| 1y | 1586 | 80% (78–82%) | 65% (63–68%) | 50% (47–52%) | +22.3% (19.9…25.1) | -0.3% (-2.6…2.5) | +8.1% (5.8…10.9) | +5.2% (2.9…8.0) |
| 2y | 1091 | 82% (80–85%) | 72% (69–75%) | 59% (56–62%) | +45.7% (40.6…52.2) | +0.3% (-4.8…6.7) | +18.1% (13.1…24.4) | +11.0% (6.0…17.4) |
| 3y | 575 | 82% (78–85%) | 74% (71–78%) | 66% (62–70%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By gate-off Candidate flag

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Candidate (gate-off) | 1y | 43 | 74% (60–85%) | 30% (19–45%) | +25.8% (13.5…40.3) | +8.4% (-3.9…23.0) | +13.7% (1.3…28.0) | +10.5% (-1.8…24.8) |
| Candidate (gate-off) | 2y | 0 | — | — | — | — | — | — |
| Candidate (gate-off) | 3y | 0 | — | — | — | — | — | — |
| Non-candidate | 1y | 1543 | 80% (78–82%) | 66% (64–68%) | +22.2% (19.7…24.9) | -0.5% (-2.9…2.3) | +7.9% (5.5…10.8) | +5.1% (2.7…7.9) |
| Non-candidate | 2y | 1091 | 82% (80–85%) | 72% (69–75%) | +45.7% (40.6…52.2) | +0.3% (-4.8…6.7) | +18.1% (13.1…24.4) | +11.0% (6.0…17.4) |
| Non-candidate | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By today-liquid Candidate flag (gap vs gate-off quantifies options-liquidity gate's selection)

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Candidate (today-liquid) | 1y | 1 | — | — | — | — | — | — |
| Candidate (today-liquid) | 2y | 0 | — | — | — | — | — | — |
| Candidate (today-liquid) | 3y | 0 | — | — | — | — | — | — |
| Non-candidate | 1y | 1585 | 80% (78–82%) | 65% (63–68%) | +22.3% (19.9…24.8) | -0.3% (-2.7…2.3) | +8.1% (5.7…10.7) | +5.2% (2.8…7.8) |
| Non-candidate | 2y | 1091 | 82% (80–85%) | 72% (69–75%) | +45.7% (40.6…52.2) | +0.3% (-4.8…6.7) | +18.1% (13.1…24.4) | +11.0% (6.0…17.4) |
| Non-candidate | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By outlier-rule fired

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Outlier fired | 1y | 18 | — | — | — | — | — | — |
| Outlier fired | 2y | 0 | — | — | — | — | — | — |
| Outlier fired | 3y | 0 | — | — | — | — | — | — |
| TTM trusted | 1y | 1568 | 80% (78–82%) | 65% (63–68%) | +22.4% (20.0…24.9) | -0.2% (-2.6…2.2) | +8.2% (5.9…10.6) | +5.3% (3.0…7.8) |
| TTM trusted | 2y | 1091 | 82% (80–85%) | 72% (69–75%) | +45.7% (40.6…52.2) | +0.3% (-4.8…6.7) | +18.1% (13.1…24.4) | +11.0% (6.0…17.4) |
| TTM trusted | 3y | 575 | 82% (78–85%) | 74% (71–78%) | +73.9% (60.6…89.4) | +5.6% (-7.5…20.8) | +35.2% (21.9…50.6) | +23.7% (10.5…39.2) |


### By confidence label

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| high | 1y | 95 | 80% (71–87%) | 69% (60–78%) | +12.9% (8.5…17.3) | -9.7% (-14.2…-4.9) | -1.4% (-6.0…3.1) | -4.6% (-9.0…-0.2) |
| high | 2y | 57 | 89% (79–95%) | 82% (71–90%) | +29.8% (21.0…39.0) | -17.4% (-25.6…-8.8) | +0.5% (-7.8…9.1) | -6.5% (-15.0…2.1) |
| high | 3y | 33 | 85% (69–93%) | 82% (66–91%) | +44.7% (30.5…60.6) | -28.1% (-40.5…-14.6) | +2.3% (-10.8…16.8) | -9.2% (-22.7…5.9) |
| medium | 1y | 441 | 78% (73–81%) | 62% (58–67%) | +14.5% (10.6…19.7) | -8.8% (-12.8…-3.6) | -0.6% (-4.6…4.6) | -3.6% (-7.6…1.5) |
| medium | 2y | 281 | 79% (74–84%) | 69% (63–74%) | +27.3% (20.8…34.9) | -18.0% (-24.4…-10.5) | -0.8% (-7.3…6.7) | -8.5% (-15.0…-1.1) |
| medium | 3y | 132 | 80% (73–86%) | 69% (61–76%) | +52.9% (31.0…75.3) | -14.8% (-35.6…7.5) | +13.2% (-8.5…35.5) | +0.7% (-21.0…23.0) |
| low | 1y | 1050 | 81% (78–83%) | 66% (63–69%) | +26.3% (23.2…30.2) | +4.1% (1.0…7.9) | +12.6% (9.5…16.3) | +9.8% (6.7…13.6) |
| low | 2y | 753 | 83% (80–86%) | 72% (69–75%) | +53.7% (45.6…62.2) | +8.4% (0.7…17.1) | +26.5% (18.7…35.2) | +19.7% (11.8…28.4) |
| low | 3y | 410 | 82% (78–85%) | 76% (71–80%) | +83.0% (65.5…102.5) | +14.9% (-2.7…34.7) | +44.9% (27.5…64.7) | +33.7% (16.4…53.4) |


### By peer-cohort divergent

| Stratum | Horizon | N | Hit p25 | Hit median | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| Divergent | 1y | 106 | 69% (60–77%) | 69% (60–77%) | +28.0% (17.1…41.2) | +4.4% (-6.4…17.5) | +12.9% (2.2…26.2) | +10.1% (-0.7…23.3) |
| Divergent | 2y | 77 | 69% (58–78%) | 69% (58–78%) | +49.6% (27.0…77.5) | +4.5% (-18.2…32.3) | +22.0% (-0.7…50.0) | +14.6% (-7.9…42.4) |
| Divergent | 3y | 36 | 64% (48–78%) | 64% (48–78%) | +99.2% (28.8…203.7) | +31.0% (-39.5…134.7) | +60.0% (-10.4…164.5) | +48.0% (-22.2…152.4) |
| Stable | 1y | 1480 | 80% (78–82%) | 65% (62–67%) | +21.8% (19.5…24.7) | -0.6% (-2.9…2.1) | +7.7% (5.4…10.5) | +4.9% (2.5…7.6) |
| Stable | 2y | 1014 | 83% (81–86%) | 72% (69–75%) | +45.4% (39.8…52.3) | -0.0% (-5.6…6.8) | +17.8% (12.1…24.8) | +10.8% (5.1…17.8) |
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
| 1y | 1586 | 80% (78–82%) | 65% (63–68%) | 50% (47–52%) | +26.3% (23.9…29.1) | +3.7% (1.4…6.5) | +12.1% (9.8…14.9) | +9.2% (6.9…12.0) |
| 2y | 1091 | 82% (80–85%) | 72% (69–75%) | 59% (56–62%) | +53.7% (48.6…60.2) | +8.3% (3.2…14.7) | +26.1% (21.1…32.4) | +19.0% (14.0…25.4) |
| 3y | 575 | 82% (78–85%) | 74% (71–78%) | 66% (62–70%) | +85.9% (72.6…101.4) | +17.6% (4.5…32.8) | +47.2% (33.9…62.6) | +35.7% (22.5…51.2) |


### Sensitivity (monthly) with overlay

| Horizon | N | Hit p25 | Hit median | Hit p75 | Mean realized | vs SPY | vs RSP | vs VTV |
|---|---|---|---|---|---|---|---|---|
| 1y | 18361 | 78% (78–79%) | 63% (62–64%) | 48% (47–49%) | +22.1% (21.5…22.8) | +3.5% (2.8…4.2) | +11.2% (10.5…11.9) | +9.3% (8.7…10.0) |
| 2y | 12407 | 81% (80–82%) | 70% (69–71%) | 58% (56–59%) | +56.9% (54.5…59.5) | +11.9% (9.5…14.4) | +30.3% (27.9…32.9) | +25.8% (23.3…28.3) |
| 3y | 6484 | 76% (74–78%) | 70% (67–72%) | 64% (61–66%) | +90.7% (85.1…97.4) | +23.4% (17.9…29.9) | +54.3% (48.7…60.8) | +47.3% (41.7…53.9) |


**Baselines.** *SPY* = SPDR S&P 500 ETF (cap-weighted, total return) — what most investors compare to. *RSP* = Invesco S&P 500 Equal Weight ETF — strips Mag7 concentration; the gap (excess vs SPY) − (excess vs RSP) quantifies how much underperformance is the index's top-heavy concentration. *VTV* = Vanguard Value ETF — large-cap value style; beating it means stock-picking generates real alpha over a buy-the-style ETF.

Hit-rate CIs are Wilson 95%; mean-return CIs are 1000-resample bootstrap with seeded RNG. Strata with N < 30 show "—".