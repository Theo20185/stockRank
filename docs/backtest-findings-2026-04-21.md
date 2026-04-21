# Back-test findings — 2026-04-21

First single-name validation pass against five hand-picked symbols
(EIX, INCY, TGT, NVO, INTC) over four years of monthly snapshots.
Reproduce with:

```
npm run backtest -- --symbols EIX,INCY,TGT,INTC --years 4
npm run backtest -- --symbols NVO --years 4 \
  --peers NVO:LLY,JNJ,MRK,PFE,ABBV,GSK,AZN,BMY,SNY
```

Outputs land under `tmp/backtest/` (gitignored — text only, easy to
regenerate).

## What we measured

For each month-end over the back-test window, the script reconstructs
what the snapshot would have looked like given only data public at
that date (annual fundamentals filtered by `period-end + 90-day
reporting lag`; historical close from Yahoo's `chart` API). It then
runs `fairValueFor` twice:

- **With outlier rule** — current production logic.
- **Naive** — `skipOutlierRule: true`, peer-median P/E anchor uses
  raw TTM EPS regardless of spike detection.

The diff between the two reveals exactly when and how much the
outlier rule contributed.

## Headline results

| Symbol | Snapshots | Outlier fired | Max single-snapshot effect | What the rule caught |
|---|---|---|---|---|
| EIX  | 49 | 2 (4%) | $22.62 | The 2026 wildfire-settlement TTM-EPS spike. Naive median $106.67 → with-rule $84.05. |
| INCY | 49 | 2 (4%) | $23.65 | The 2026 biotech earnings spike. Naive $119.39 → with-rule $96.89. |
| TGT  | 48 | 0      | $0     | No EPS spikes; rule correctly silent. |
| NVO  | 49 | 0      | $0     | No EPS spike; rule silent. (Different framework gap — see below.) |
| INTC | 49 | 0      | $0     | No spike to defend against. |

## Validates

- **Outlier rule fires selectively.** ~4% of snapshots on names that
  actually had TTM-EPS spikes (EIX, INCY); 0% on stable / cyclical
  names (TGT, NVO, INTC). Calibration is appropriately tight — no
  false positives observed.
- **When it fires, the impact is meaningful.** $22–$24 per share on
  the canonical wildfire-settlement and earnings-spike cases — exactly
  what the rule was built to defend against.
- **Confidence flag self-flags weak fair values.** NVO at the back-test
  ends shows p25/p75 spread of ~9× → maps to "low" confidence per
  `computeConfidence`. The framework is honest about its own
  uncertainty in those cases.

## Exposes

- **Forward-EPS unavailable historically.** The outlier rule's
  forward-corroboration check runs with `forward = null`, mapping to
  the conservative "treat spike as one-time" branch. Production
  behavior with live forward EPS would fire less often. INCY's actual
  recent case is a "spike + forward agrees → trust TTM" — the
  back-test doesn't capture that branch correctly.
- **No defense against unsustainable earnings growth.** NVO shows
  peer-median P/E × NVO's massive 2024–25 EPS giving $200–400 fair
  values when the stock collapsed from $130 → $39. The model trusts
  recent earnings as the baseline; for hype-cycle names, that's the
  wrong assumption. Spread-driven low-confidence partially
  compensates but doesn't catch the magnitude.
- **No defense against structural deterioration.** INTC late 2023:
  model showed +77.9% upside to p25 while INTC was about to fall
  another 40%. Peer multiples (NVDA/AVGO/AMD/etc.) didn't reflect
  Intel-specific manufacturing-execution issues. Spread was 3.45× →
  "low" confidence — the framework flagged the uncertainty, but the
  bullish projection was directionally wrong.

## Caveats

- **Restatement bias** — today's `fundamentalsTimeSeries` includes
  any restatements published since the original period.
- **Industry classification** — peers are taken from today's snapshot;
  we don't reconstruct historical industry membership. Peer market
  caps recompute per-date but the cohort is fixed.
- **TTM proxied as annual** — Yahoo's true TTM is rolling-quarterly;
  the back-test uses the most-recent annual as a TTM stand-in. Slow-
  moving metrics (P/E, P/FCF) are minimally affected; faster-moving
  ones less so.

## Recommendations

1. **Trust the confidence flag.** Names with spread > 2.5× drop to
   "low" confidence — that's the framework saying "I don't really
   know." Treat the fair-value mid as illustrative on those rows; the
   p25 (conservative tail) is the only number worth acting on.
2. **For outright stock entries**, the current default of "Upside =
   to p25" + "Ranked requires current < p25" is the right framing —
   the back-test confirms p25-based decisions are more honest than
   median-based ones.
3. **For options income**, the framework holds up: outlier rule
   correctly stabilizes the strike anchors on EIX-class events. The
   trade-comparison table is unaffected by the structural-issue gaps
   identified above (it just uses the snap strike, doesn't project
   beyond what the user picks).
4. **Don't extend to a universe-wide back-test yet.** Until we
   address the structural-deterioration gap (or accept it explicitly
   via a UI confidence-down-weighting), a universe-wide back-test
   would mostly amplify the INTC-style false positives.
