# Spec: Trade Comparison P&L

**Status:** draft. Extends `docs/specs/options.md` by turning each
per-stock options view into a side-by-side projected-P&L comparison
across four mutually-exclusive trade types. Answers "given this stock,
this expiration, and my view of fair value — which deployment of
capital projects the best outcome?"

## 1. The five trades

For a stock with current price `P`, a chosen expiration `T` days out,
and a projected end price `FV` (default p25), every decision about
this stock-expiration pair reduces to one of five capital deployments:

| # | Trade | Initial capital | Stock exposure | Option leg | Cash exposure |
|---|---|---|---|---|---|
| 1 | **Buy outright** | `P` per share | Long stock | — | 0 |
| 2 | **Buy-write** | `P − bidCall` per share | Long stock | Short call @ `Kc` | 0 (premium consumed at entry) |
| 3 | **Covered call** | `P` per share (held) | Long stock (already owned) | Short call @ `Kc` | `bidCall` in SPAXX |
| 4 | **Cash-secured put** | `Kp` per share | None until assigned | Short put @ `Kp` | `Kp + bidPut` in SPAXX |
| 5 | **Hold cash (SPAXX)** | `P` per share | None | — | `P` in SPAXX |

Trade 5 is the baseline — "what does my money do if I don't take this
trade at all?" It's there so the other four have something honest to
beat. Without it, a 2% trade looks attractive until you notice SPAXX
was paying 4.5%.

**Buy-write vs. covered call**: same option contract, different starting
position. Buy-write is the right comparison for a user opening a new
position today — premium discounts the purchase price, no separate
cash to earn interest. Covered call is the right comparison for a user
who already owns the share — no new capital deployed (the share is
opportunity cost), and the premium is incremental cash that sits in
SPAXX until expiry.

Strikes come directly from `options.md` §3.2/§3.3: single anchor at
fair-value p25 for both sides.

## 2. P&L formulas (per share, over the holding period to expiry)

Let:

- `P` = current price
- `FV` = projected end price (fair-value median by default)
- `Kc, Kp` = call and put strikes
- `bidCall, bidPut` = option bids (premium collected per share)
- `T` = days to expiration
- `D` = annual dividend per share (= `ttm.dividendYield × P`)
- `r` = SPAXX annualized yield (see §4 for sourcing)

### Trade 1 — Buy outright

```
stock P&L     = FV − P
dividend P&L  = D × (T / 365)
premium P&L   = 0
spaxx P&L     = 0
─────────────────────────────
total/share   = (FV − P) + D × T/365
ROI on P      = total / P
```

### Trade 2 — Buy-write (strike `Kc`)

Open the position by buying the stock and selling the call in a single
transaction; the premium received discounts the purchase price.

```
stock P&L:
  if FV ≥ Kc:  Kc − P      (called away at Kc)
  else:        FV − P      (keep the stock)
dividend P&L  = D × T/365
premium P&L   = bidCall   (consumed at entry — discounts the buy)
spaxx P&L     = 0          (no premium left in cash)
─────────────────────────────
total/share   = stock + dividend + bidCall
ROI on (P − bidCall) = total / (P − bidCall)
```

Net cash outlay is `P − bidCall` — the premium isn't sitting separately
to earn interest because it was used to fund part of the purchase.

### Trade 3 — Covered call (strike `Kc`, stock already owned)

Same option contract, different starting position. The share is already
in your account; selling the call is the only new transaction.

```
stock P&L:
  if FV ≥ Kc:  Kc − P
  else:        FV − P
dividend P&L  = D × T/365
premium P&L   = bidCall
spaxx P&L     = bidCall × r × T/365   (fresh cash, sits in SPAXX)
─────────────────────────────
total/share   = stock + dividend + bidCall + spaxx
ROI on P      = total / P
```

Capital denominator is `P` — the opportunity cost of the held share
(you could sell at `P` and reallocate). The premium is incremental
cash that earns SPAXX for the holding period.

### Trade 4 — Cash-secured put (strike `Kp`)

Two branches depending on whether the put finishes ITM. SPAXX interest
accrues on the full `Kp` collateral **plus the bid premium received**
for the entire holding period, regardless of assignment outcome
(assignment happens at expiration for European-style thinking; the
collateral conversion to stock is a T-day event, and the premium is
free cash from the moment the put is sold).

```
stock P&L:
  if FV ≥ Kp:  0           (put expires worthless; no stock owned)
  else:        FV − Kp     (assigned at Kp; stock now worth FV)
dividend P&L  = 0          (no stock during the holding period)
premium P&L   = bidPut
spaxx P&L     = (Kp + bidPut) × r × T/365
─────────────────────────────
total/share   = stock + bidPut + spaxx
ROI on Kp     = total / Kp
```

ROI uses `Kp` as the denominator (the at-risk collateral); the
`bidPut` portion of the SPAXX leg is incremental cash you gained
from selling the option, not capital you committed.

### Trade 5 — Hold cash (SPAXX)

```
stock P&L     = 0
dividend P&L  = 0
premium P&L   = 0
spaxx P&L     = P × r × T/365
─────────────────────────────
total/share   = P × r × T/365
ROI on P      = r × T/365
```

The `P × r` uses current price as the notional so the row is directly
comparable to Trade 1 on the same capital base.

## 3. The projected end price

Default projection: **fair-value median** (`row.fairValue.range.median`).
This is the "if the thesis plays out" number — the value-tilted
defensive mental model that peer multiples × this company's earnings
re-rate to the cohort midpoint.

The UI should optionally show two sensitivities:

- **Conservative**: `FV = range.p25` — "if mean reversion only carries
  us to the conservative tail."
- **Bear**: `FV = P` (no move) — "if the thesis doesn't play out and
  the stock just sits." Exposes the option-only P&L.

A bear-case row shows very clearly why the put and call dominate the
outright-buy when the thesis lags: you still collect premium and SPAXX
interest. The outright-buy row goes to just `D × T/365`.

Sensitivity isn't a range of estimates — it's three scenarios the user
can flip between. Keeps the UI honest.

## 4. SPAXX rate

Fidelity's SPAXX (government money market) yield moves with the short
end of the curve. As of this spec it's running ~4.5% annualized, but
that will drift.

Sourcing options (pick one):

1. **Hardcoded constant** in `packages/ranking/src/trade-comparison/`
   (or wherever the math lives). Simplest; requires a yearly-ish manual
   update. Comment clearly: "If SPAXX is >6 months stale, update."
2. **UI slider** on the stock-detail screen, persisted in
   `localStorage` so the user sets it once per rate-regime. More
   interactive; lets the user stress-test different rate environments.
3. **Yahoo ticker scrape** — SPAXX isn't quoted but you can proxy via
   the 3-month Treasury (`^IRX`). Would bake it into the nightly
   ingest. Most automated but couples the whole pipeline to a new
   data dependency.

Going with **option 1 for v1**, in a new `config.ts` file at repo root
that exports `SPAXX_RATE = 0.045` or similar with a dated comment.
Trivial to swap for option 2 later.

## 5. Output structure

```ts
type ProjectedEndCase = "median" | "p25" | "flat";

type TradeComparison = {
  symbol: string;
  expiration: string;             // ISO date
  daysToExpiry: number;
  currentPrice: number;
  projectedEndPrice: number;       // the FV used
  projectedEndCase: ProjectedEndCase;
  spaxxRate: number;               // the rate used
  trades: {
    buyOutright:        TradeLeg;
    coveredCall:        TradeLeg | null;   // null if no call strike available
    cashSecuredPut:     TradeLeg | null;   // null if no put strike available
    holdCashSpaxx:      TradeLeg;
  };
};

type TradeLeg = {
  initialCapital: number;          // per share basis of the capital committed
  stockPnl: number;
  dividendPnl: number;
  premiumPnl: number;
  spaxxPnl: number;
  totalPnl: number;                // sum of the four
  roi: number;                     // totalPnl / initialCapital
  roiAnnualized: number;           // roi × 365/T
  // Useful hints for the UI:
  assigned?: boolean;              // for call/put: did projection put us ITM?
  strike?: number;
  bid?: number;
};
```

Annualized ROI is the apples-to-apples comparator, since the four
trades have different risk profiles but should be compared on a "per
dollar per year" basis.

## 6. UI presentation

Per expiration on the stock-detail screen, render a compact table
with the four trades as rows:

| Trade | Capital | Stock | Div | Premium | SPAXX | Total | ROI (annl) |
|---|---|---|---|---|---|---|---|
| Buy outright | $P | … | … | 0 | 0 | … | … |
| Covered call @ Kc | $P − bid | … | … | $bid | 0 | … | … |
| Cash-secured put @ Kp | $Kp | … | 0 | $bid | … | … | … |
| Hold cash (SPAXX) | $P | 0 | 0 | 0 | … | … | … |

Highlight the winner by annualized ROI. Above the table, a small
toggle for the scenario: **Median / Conservative / Flat**. Default
Median.

Next to the ROI cell, a tiny indicator: `↑` if above SPAXX baseline,
`↓` if below. Reinforces the opportunity-cost framing.

## 7. Edge cases

| Case | Handling |
|---|---|
| Stock has no call strike (rare after `options.md` filters) | `coveredCall: null`; row omitted or shown as "no strike available." |
| Stock has no put strike | `cashSecuredPut: null`; same. |
| `projectedEndCase === "flat"` AND fair value is below current | Outright row shows negative stock P&L; dividend + SPAXX rows unchanged. Useful for stress-testing. |
| Dividend rate is 0 | Dividend cell reads `$0.00` — no special case needed. |
| `T = 0` (shouldn't happen since we only fetch forward expirations) | All time-dependent terms go to 0; defensive. |
| SPAXX rate is stale (> 6 months) | UI could show a small "rate: X%, last set Y" tag. Nice-to-have. |

## 8. Test strategy

- **Unit tests:** pure P&L math per trade with synthetic inputs.
  - Covered call assignment vs no-assignment branches.
  - Put assignment vs worthless-expiry branches.
  - SPAXX baseline vs zero-rate.
  - T = 0 returns zero on all time-dependent terms.
- **Integration test:** end-to-end from a fixture OptionsView + fair
  value → full TradeComparison; eyeball numbers match hand-computed
  values for one concrete example.
- **UI:** render the table, assert winner highlight matches the
  projected ROI values.

## 9. Open questions

1. **Multiple expirations per stock** — should the UI aggregate
   "best trade across all expirations" at the top, or show one
   comparison table per expiration? Probably one per expiration for
   transparency; an index column shows which expiration wins overall.
2. **Margin-secured puts?** Some brokers let you secure a put with
   margin rather than cash, freeing capital for another position.
   Out of scope for v1 — assume full cash coverage.
3. **Tax drag** — premium income is short-term capital gains (less
   favorable) vs buy-and-hold qualifying for long-term rates.
   Arguably should be reflected in the ROI. Out of scope for v1.
4. **Rolling strategy** — a covered call near assignment could be
   rolled for more premium. v1 treats every position as hold-to-expiry.
