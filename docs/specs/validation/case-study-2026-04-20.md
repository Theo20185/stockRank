# Validation Case Study — 2026-04-20

Three of the user's actual entries scored against the proposed ranking
model (PLAN.md §3, ranking.md draft). Goal: would the model have
surfaced these names at the user's entry date?

| Symbol | Entry date | Entry price | Latest known annual at entry | Source |
|---|---|---|---|---|
| INTC | 2025-08-22 | ~$21.00 | FY2024 (filed 2025-01-31) | FMP + Fidelity |
| TGT  | 2026-04-09 | ~$81.00 | FY2025 ending 2026-01-31 (filed 2026-03-11) | FMP + Fidelity |
| NVO  | 2026-03-06 | $38.78  | FY2025 ending 2025-12-31 | Fidelity (FMP free tier blocks foreign) |

## NVO — Novo-Nordisk @ $38.78 (2026-03-06) → ✅ Strong match

Industry: Pharmaceuticals. All figures USD millions unless stated.

**Source data (FY2025):** Revenue 48,588 · EBIT 20,150 · EBITDA 22,456
· Interest 699 · Net income 16,104 · EPS 3.62 · Shares 4,444M · Cash &
ST inv 4,239 · Total debt 20,588 · Equity 30,506 · OCF 18,724 · CapEx
9,455 · FCF 9,269 · Dividends paid 8,171.

| Metric | Value | Verdict |
|---|---|---|
| **Quality floor** | NI > 0 ✓; ROIC ≈ **33.8%** | ✅ Massive pass |
| Current Ratio | 0.80 | ⚠ Below 1 — typical for pharma (rebate accruals); not a real concern |
| Debt / EBITDA | **0.92x** | ✅ Very low leverage |
| Interest Coverage | **28.8x** | ✅ Excellent |
| **P/E** | **10.7x** | ✅ Cheap |
| **EV / EBITDA** | **8.4x** | ✅ Cheap (Pharma median is 13–15x) |
| **P / FCF** | 18.6x | ✅ Reasonable |
| **P / B** | 5.65x | Neutral (high-ROIC pharma trades at premium to book) |
| **Dividend Yield** | **4.74%** | ✅ Strong |
| 5Y Dividend CAGR | **+25.5%/yr** | ✅ Outstanding |
| 5Y Revenue CAGR | **+22.6%** | ✅ Outstanding |
| 5Y EPS CAGR | **+22.8%** | ✅ Outstanding |
| % off 52w high | ~52% (high $81.44, entry $38.78) | ✅ Deep drawdown — opportunity signal |

**Conclusion:** NVO would have ranked at or near the top of Pharmaceuticals
on every category and would have screamed loudly via the drawdown signal.
The model captures this trade cleanly.

## TGT — Target @ ~$81.00 (2026-04-09) → ✅ Strong match (with one nuance)

Industry: Discount Stores / Consumer Staples Retail. All figures USD M.

**Source data (FY2025, ending 2026-01-31):** Revenue 104,780 · EBIT 5,212
· EBITDA 8,013 · Interest 445 · Net income 3,705 · EPS 8.13 · Diluted
shares 455.6M · Cash 5,488 · Total debt 5,592 · Equity 16,165 · OCF 6,562
· CapEx 3,727 · FCF 2,835 · Dividends 2,053 · Buybacks 408.

| Metric | Value | Verdict |
|---|---|---|
| **Quality floor** | NI > 0 ✓; ROIC ≈ **24.9%** | ✅ Strong pass |
| Current Ratio | 0.94 | Normal for retail |
| Debt / EBITDA | **0.70x** | ✅ Very low |
| Interest Coverage | **11.7x** | ✅ Strong |
| **P/E** | **10.0x** | ✅ Cheap (Discretionary retail median ~16x) |
| **EV / EBITDA** | **4.6x** | ✅ Very cheap |
| **P / FCF** | 13.0x | ✅ Reasonable |
| **P / B** | 2.28x | Normal |
| **Dividend Yield** | **5.57%** | ✅ Excellent |
| Buyback Yield | 1.11% | ✅ Plus |
| Total Shareholder Yield | **6.68%** | ✅ Very strong |
| 5Y Revenue CAGR | −0.3%/yr | ⚠ See nuance |
| 5Y EPS CAGR | **−12.9%/yr** | ⚠ See nuance |
| % off 52w high | ~38% (entry $81 vs prior 12m high) | ✅ Deep drawdown |

**The growth nuance:** TGT's 5Y growth looks bad because the base year
(FY2021) was the COVID retail boom — peak revenue and peak margins.
Comparing trough to peak makes any retailer look terrible. The model
needs to handle this. Options:
- Use 7Y or 10Y CAGRs (smooths cycle).
- Use *median* annual growth rate over 5Y instead of CAGR.
- Lower the weight of growth for cyclical industries.
- Compare a stock's growth to its industry-group's growth, not to zero
  (peer-relative percentile already partially handles this).

**Conclusion:** Even with the negative-growth drag, TGT would have
ranked in the top quintile of its industry on valuation, health, and
shareholder return. The model captures this trade.

## INTC — Intel @ ~$21.00 (2025-08-22) → ❌ Model fails to flag

Industry: Semiconductors. All figures USD M.

**Source data (FY2024 — most recent annual at entry):** Revenue 53,101
· EBIT **−10,176** · EBITDA 1,203 (depressed) · Interest 824 · Net
income **−18,756** · EPS **−4.38** · Shares 4,280M · Cash & ST inv
22,062.

**Quarterlies known by entry (Q1+Q2 2025):** Net income −821 + −2,918
= −3,739. Operations still deeply negative; Q3 2025's headline +4,063
came from a $5.4B special-items gain (foundry-related), reported *after*
entry.

| Metric | Value | Verdict |
|---|---|---|
| **Quality floor (TTM NI > 0)** | **FAIL** | ❌ Excluded from universe |
| ROIC (TTM) | **NEGATIVE** | ❌ Floor fails |
| 5-year average NI | ~$2.7B/yr (positive) | ⚠ Borderline |
| 5-year average ROIC | ~1.9% | ❌ Below typical floor (8%) |
| Profitable in N of last 5 years | 3 of 4 (2021/22/23 yes; 24 no) | ⚠ Passes if rule is "3 of 5" |
| EV / EBITDA | ~96x (EBITDA collapsed) | ❌ Useless during loss year |
| P / E | undefined | ❌ |
| P / B | ~1.0x | Cheap on book — but book full of impaired fab assets |

**Conclusion:** A backward-looking quantitative model **would not have
flagged INTC at entry.** The user's bet was qualitative: government
CHIPS Act backstop, foundry strategic value, sentiment-cycle bottom,
forward-looking turnaround thesis. None of those are in the data.

This is a **class of trade the ranker is not designed to capture**, and
we shouldn't pretend otherwise. Better to acknowledge the limit and
add a complementary lane (see §3 below).

## Design implications

1. **Quality floor framing.** TTM-net-income-positive is too brittle for
   a value-tilted strategy that targets cyclical recoveries. Replace with
   a **multi-year track record** rule:
   - Profitable in ≥ N of last 5 years (proposed N=3), AND
   - 5-year average ROIC > some sector-relative floor.
   This still excludes structural losers (the original goal) but lets
   "good company having a bad year" stay in.

2. **Cyclicality-aware growth.** Replace 5Y CAGR with one of:
   - 7Y or 10Y CAGR (smooths COVID distortion);
   - Median annual growth over last 5 years (drops outliers);
   - Peer-relative growth percentile (a stock with −13% EPS CAGR in an
     industry where everyone is at −15% is actually outperforming).
   Probably worth doing all three and letting the user choose; default to
   peer-relative percentile.

3. **Turnaround lane (separate from composite).** Some trades are
   forward-looking and won't be captured by backward-looking ratios.
   Surface a *separate* watchlist of names that:
   - Have a strong **long-term track record** (e.g., 10Y avg ROIC > 12%),
   - Are currently in a **TTM trough** (loss or sub-trend earnings),
   - Are trading at a **deep drawdown** (>40% off 52w high).
   These don't get a composite score — they get flagged as "fallen
   blue-chips, evaluate qualitatively." That's exactly the INTC entry.

4. **Industry-relative floor levels.** Pharma's <1 current ratio and
   retail's <1 current ratio are both fine. Define floors as percentiles
   within industry group, not absolute thresholds.

5. **Drawdown column, confirmed.** All three names had ≥38% drawdown
   from prior 12m high at entry. The signal works exactly as intended.

## Acceptance criteria for the ranking implementation

When Phase 2 implements the engine, the regression test fixture must
include these three snapshots and assert:

- **NVO at 2026-03-06**: top quartile within Pharmaceuticals on the
  composite; drawdown column flags it as opportunity.
- **TGT at 2026-04-09**: top quartile within its industry group;
  drawdown column flags it.
- **INTC at 2025-08-22**: appears on the **turnaround watchlist**, not
  the main ranked composite. Composite either excludes it (via floor)
  or ranks it explicitly low — both are acceptable so long as the
  turnaround lane surfaces it.

If the implementation can't produce all three of those outcomes, the
design needs another iteration before we ship.
