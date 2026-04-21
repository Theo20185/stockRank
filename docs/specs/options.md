# Spec: Options Workflow

**Status:** draft. Builds on `fair-value.md` (anchors define strikes) and
the Yahoo provider (chains via `yahoo-finance2`'s `options()` method,
confirmed live on 2026-04-20). Implementation gated on `fair-value.md`
shipping first.

## 1. Purpose

For each ranked stock, surface a **short, opinionated set of options
trades** that align with the user's value-tilted defensive strategy:

- **Covered calls** on names already held: get paid premium + dividend
  while waiting for the market to re-rate toward fair value, with
  predictable assignment levels.
- **Cash-secured puts** on names the user wants to own: get paid
  premium while waiting for a pullback into the fair-value range, with
  a deliberately chosen entry price if assigned.

This module is **not** a general options analytics tool. No Greeks
beyond IV. No spreads or multi-leg strategies. No live mid-price
modeling. The goal is "if I sell this contract today at the bid and
hold to expiry, what are the two outcomes worth?" — nothing more.

## 2. Expiration selection (LEAPS-preferred)

Per user preference, prefer long-dated monthly January contracts when
available, fall back gracefully when not.

### 2.1 Selection ladder

Given today's date `D`, pick **up to two** expirations per stock from
the chain in this order of preference:

1. **Next two January LEAPS**: monthly third-Friday expirations in
   January of `year(D)+1` and `year(D)+2`. If both exist, return both.
2. **Single available January LEAPS**: if only one of the next two
   Januaries is listed, return that one plus the next eligible
   non-January monthly that's at least 60 days out.
3. **No January LEAPS at all**: return the next two quarterly
   expirations (Mar/Jun/Sep/Dec third-Friday).
4. **No quarterlies in chain**: return the next two monthly
   expirations (any month).
5. **Chain has fewer than two expirations total**: return whatever it
   has.

The selector returns a structured result so the UI can label each
contract honestly: `selectionReason: "leap" | "leap-fallback" |
"quarterly" | "monthly"`.

### 2.2 Why this order

- **LEAPS** match the holding-period horizon of a value investor —
  paid premium scales with time, and the thesis ("market re-rates to
  fair value") often takes quarters or years to play out.
- **Quarterly** is the standard fallback because liquidity tends to
  cluster at quarter-end expirations even on names without LEAPS.
- **Monthly** is last-resort because weekly/short-dated premium is
  driven by event risk we don't model.

### 2.3 Date detection

A monthly third-Friday expiration is determined by:
`date.day >= 15 && date.day <= 21 && date.weekday === Friday`.
Yahoo returns expirations as ISO timestamps; convert in the user's
local timezone for the day check. Quarterly months are March, June,
September, December.

## 3. Strike selection

Strikes are anchored to the `FairValue` output from `fair-value.md`.
Three covered-call strikes (sell side) and three cash-secured-put
strikes (buy side), then snap to the nearest **listed** strike on the
selected expiration's chain.

### 3.1 Single-anchor strategy

Both sides anchor to the **conservative tail (p25) of the fair-value
range**. Each Ranked stock × expiration produces at most one covered
call and one cash-secured put — a focused, opinionated workflow rather
than a 3×3 grid.

**Rationale.** Per the value-tilted defensive thesis, the stock has
already been gated into the Ranked bucket only when `current < p25`.
At that point:

- A covered call sold at the p25 strike says "I'd happily exit at my
  conservative fair value with a premium on top." Selling above p25
  (median, p75) is greedy — you might never get assigned, and if the
  stock recovers to median, you've capped at higher than necessary.
- A cash-secured put with strike at p25 says "I'd happily own at my
  conservative fair value." Strikes above p25 aren't value entries;
  strikes well below p25 are tempting but the snap rule already
  prefers the highest OTM strike (≤ current) so we naturally land
  near current.

### 3.2 Covered-call strike (sell side)

- **Anchor**: `range.p25`.
- **Snap**: prefer listed strike `≥ p25`; fall back to nearest below
  if none exists.
- **Floor**: drop the call if the snapped strike is `< currentPrice`
  (would be ITM, guaranteed assignment, misleading static return).
- **Label**: `conservative`.

When the orchestrator is run for a stock with `current ≥ p25`, no call
is emitted — but in practice the ingest only feeds Ranked-bucket
stocks (which already require `current < p25`), so this branch is
defensive.

### 3.3 Cash-secured-put strike (buy side)

- **Anchor**: `range.p25` (displayed); snap target uses
  `min(p25, currentPrice)` which equals `currentPrice` whenever
  `current < p25`.
- **Snap**: prefer listed strike `≤ currentPrice` (highest OTM put).
- **Floor**: drop the put if the snapped strike is `> currentPrice`
  (ITM put → committing to buy above market).
- **Suppression**: when `current ≥ p25`, the entire put workflow is
  suppressed with reason `above-conservative-tail`. (Same defensive
  branch as calls.)
- **Label**: `deep-value`.

### 3.3 Strike snapping

Each anchor price `A` is snapped to the nearest listed strike `S` on
the chain, with two tie-breakers:
1. Prefer `S ≤ A` for puts (lower strike = lower assignment cost,
   slightly more conservative).
2. Prefer `S ≥ A` for calls (higher strike = more upside, slightly
   more conservative).

If the snapped strike differs from the anchor by more than 5%, mark
the contract `snapWarning: true` so the UI can show "no strike near
your target."

## 4. Return calculations

All returns are **point estimates assuming fill at the bid (we sell)
and hold to expiry**. We deliberately do not model time decay,
re-pricing, or rolling.

### 4.1 Covered-call returns

Inputs: `bid`, `strike K`, `currentPrice P`, `daysToExpiry T`,
`annualDividendPerShare D` (from snapshot, may be 0).

Per share:
```
expectedDividends      = D × (T / 365)
staticReturn$          = bid + expectedDividends                  // not assigned
staticReturn%          = staticReturn$ / P
staticAnnualized%      = staticReturn% × (365 / T)

assignedReturn$        = bid + expectedDividends + (K - P)         // assigned at expiry
assignedReturn%        = assignedReturn$ / P
assignedAnnualized%    = assignedReturn% × (365 / T)

effectiveCostBasis     = P - bid                                  // see §4.3
effectiveDiscountPct   = bid / P                                  // premium as % of current
```

The "if assigned" line includes capital appreciation `K - P`, which is
positive for OTM calls (the normal case here per §3.1).

### 4.2 Cash-secured-put returns

Inputs: `bid`, `strike K`, `currentPrice P`, `daysToExpiry T`. No
dividends — we don't own the shares while the put is open.

Per share / per contract on `K` cash collateral:
```
notAssignedReturn$     = bid                                       // expires worthless
notAssignedReturn%     = bid / K                                   // return on collateral
notAssignedAnnualized% = notAssignedReturn% × (365 / T)

effectiveCostBasis     = K - bid                                   // if assigned
effectiveDiscountPct   = (P - effectiveCostBasis) / P              // vs current price
```

`effectiveCostBasis` is the headline number for the assignment case —
"if assigned, you own this stock at $X, which is Y% below current
price." We deliberately do not compute "return if assigned" because
that depends on the user's go-forward fair-value view, which they
already have one screen away.

### 4.3 Effective cost basis — both sides

`effectiveCostBasis` appears on calls and puts so the user always
sees a net per-share number for the trade.

| Side | Formula | Reading |
|---|---|---|
| Covered call | `P - bid` | "If you bought this stock today and immediately sold this call, your net entry per share is X (Y% below current)." |
| Cash-secured put | `K - bid` | "If assigned at expiry, you own the stock at X (Y% below current)." |

The call version uses **current price as a cost-basis proxy** because
we don't yet track real holdings — once `holdings.md` lands, the call
view should swap in the user's actual cost basis when one exists, and
fall back to current price otherwise. The interpretation stays the
same either way: net per-share after the premium is collected.

### 4.4 Annualization caveat

The `× (365 / T)` extrapolation breaks down for very short-dated
contracts (a 7-DTE 1% return annualizes to 52% but isn't repeatable
weekly). For LEAPS-dominated output this is rarely an issue, but mark
any contract with `T < 30` as `shortDated: true` so the UI can
de-emphasize the annualized number.

## 5. Output structure

Per stock, attached to the snapshot detail row (not the ranking row —
options data is too heavy for the universe-wide table):

```ts
type ContractQuote = {
  contractSymbol: string;       // Yahoo's OCC symbol, e.g. "DECK270115C00120000"
  expiration: string;           // ISO date
  daysToExpiry: number;
  strike: number;
  bid: number | null;
  ask: number | null;
  lastPrice: number | null;
  volume: number;
  openInterest: number;
  impliedVolatility: number | null;  // Yahoo decimal, e.g. 0.42
  inTheMoney: boolean;
};

type CoveredCall = {
  label: "conservative" | "aggressive" | "stretch";
  anchor: "p25" | "median" | "p75";
  anchorPrice: number;
  contract: ContractQuote;
  snapWarning: boolean;
  shortDated: boolean;
  staticReturnPct: number;        // not assigned
  staticAnnualizedPct: number;
  assignedReturnPct: number;
  assignedAnnualizedPct: number;
  effectiveCostBasis: number;     // P - bid; see §4.3
  effectiveDiscountPct: number;   // bid / P
};

type CashSecuredPut = {
  label: "stretch" | "aggressive" | "deep-value";
  anchor: "p75" | "median" | "p25";
  anchorPrice: number;
  contract: ContractQuote;
  snapWarning: boolean;
  shortDated: boolean;
  notAssignedReturnPct: number;
  notAssignedAnnualizedPct: number;
  effectiveCostBasis: number;
  effectiveDiscountPct: number;   // vs current price
  inTheMoney: boolean;
};

type OptionsView = {
  symbol: string;
  fetchedAt: string;
  expirations: Array<{
    expiration: string;
    selectionReason: "leap" | "leap-fallback" | "quarterly" | "monthly";
    coveredCalls: CoveredCall[];   // up to 3, fewer if anchor floors filter
    puts: CashSecuredPut[];        // up to 3, fewer if floors filter
    suppressedReason?: "below-fair-value";  // only when puts suppressed entirely
  }>;
};
```

## 6. Fetch policy

- **On-demand only.** Options chains are heavier than quotes — do not
  fetch nightly across the universe. Fetch when the user opens a
  stock-detail screen and the options tab is active. Cache per
  `(symbol, fetchedAt within 30 min)` so repeat opens don't hammer
  Yahoo.
- **Throttle**: 1 chain per 1.5s when the user is browsing (vs ingest
  throttle for quote/fundamentals). Yahoo hasn't documented a chain
  rate limit, so be conservative.
- **Provider abstraction**: hide behind `OptionsProvider` interface
  with a `yahoo` implementation. Same lesson as the FMP/Yahoo split —
  Yahoo deprecated `quoteSummary` modules in late 2024, and chains
  could be next.

## 7. UI presentation (input to ui.md)

On the stock-detail screen, add an "Options" tab. Per expiration,
show two compact tables:

**Covered calls** (header: "If you own this stock today")
| Strike | Bid | DTE | Static % (annl) | If assigned % (annl) | Effective cost (discount %) | Label |

**Cash-secured puts** (header: "If you want to own this stock")
| Strike | Bid | DTE | Premium % collateral (annl) | Effective cost (discount %) | Label |

The **Effective cost** column reads identically on both sides — net
per-share after the premium — so the user can scan calls and puts in
the same mental units.

A small chip per row indicates `snapWarning` ("strike is X% off your
target") and `shortDated` ("annualized assumes you can repeat the
trade — short-dated"). When puts are suppressed via §3.2, show a
single line: "Stock is already below fair value. Consider buying
outright."

For the user's NVO-style covered-call setup specifically, the UI
should also show a "current covered position" entry where the user
can pin known holdings (NVO 2000 sh, $77,468 cost basis, Jan 2027 $40
call sold for $12,297 premium) and see the same return math against
their actual contract — but that's `holdings.md` territory, not
options.md.

## 8. Edge cases

| Case | Handling |
|---|---|
| Yahoo returns no chain for symbol | Output empty `expirations: []`, UI shows "No options listed for this symbol." |
| Bid is null or zero (illiquid contract) | Skip that strike; if all three for a label are dead, drop the label entirely. |
| Strike snapping puts call at K < P | Drop per §3.1 floor — ITM covered call isn't this workflow. |
| Strike snapping puts at K > P | Keep, but mark `inTheMoney: true`; effective-cost-basis math still works. |
| `fair-value.range === null` | No anchors → no strikes. UI shows "Fair value not computable; options analysis requires it." |
| Stock has no annual dividend | `expectedDividends = 0`; `staticReturn` is just premium. |
| Special dividend during contract life | Out of scope — `D` is pulled from `quote.dividendRate`, not forward-projected. |
| Stock split between fetch and expiry | Out of scope; Yahoo returns adjusted strikes after the fact. |

## 9. Test strategy

- **Unit tests:** fixture chains with known expirations covering every
  branch of §2.1 ladder; verify selector picks correctly. Synthetic
  fair-value ranges + chains, verify strike snapping, floor rules, and
  return math to the cent.
- **Mapping tests:** Yahoo `options()` shape → `ContractQuote`
  contract; reject malformed contracts gracefully.
- **Live smoke test (manual, not CI):** `npm run options DECK` → eyeball
  the LEAPS selection and the three call/put strikes against the user's
  fair-value mid for sanity.
- **Regression test:** the user's NVO Jan-2027 $40 covered call is a
  known fixture — given the chain on a known date, our model should
  flag it as the "conservative" strike and produce return numbers
  matching the user's actuals (premium $12,297 / 2000 sh = $6.15/sh).

## 10. Open questions

1. **Put-strike anchor confirmation.** Spec uses fair-value tails
   mirrored (§3.2). Alternatives considered: (a) fixed % below current
   (e.g., 5/10/20%), (b) historical-volatility-based, (c) blended
   "max(fair-value anchor, current × 0.85)" floor. Going with mirror
   for now — symmetric with calls, keeps the mental model clean. Open
   to override per stock if the user wants to specify a custom buy
   target (e.g., "I'd buy NVO at $35 regardless of model").
2. **Multiple expirations in the UI.** Two LEAPS rows per stock will
   double the table height. Consider showing only the nearer LEAPS by
   default with the further one behind a toggle.
3. **Implied volatility surface.** Yahoo gives per-contract IV. We
   don't currently use it for anything — could surface it as a
   "premium richness" indicator (high IV = paid more for the same
   strike) but that's a v2 feature.
4. **Dividend forecasting for expectedDividends.** `quote.dividendRate
   × (T / 365)` assumes the current rate continues. For dividend
   growers (KO, JNJ) this is conservative; for dividend cutters it
   overstates. Acceptable approximation for v1.
5. **Roll suggestions.** When a covered call is approaching expiry
   ITM, the natural next question is "roll up and out?" — explicitly
   out of scope for v1; needs the holdings module first.
