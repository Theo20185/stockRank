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

## 2. Expiration selection (weekly / monthly / yearly cascade)

Surface up to three expirations per stock — one short-dated, one
monthly-cycle, one January-yearly — so the UI's Plan screen can offer
the user a choice of horizons (`weekly` tab, `monthly` tab, `yearly`
tab). The cascade guarantees three *distinct* dates whenever the chain
has them, even when the soonest listed expiration itself happens to
fall in a 3rd-week (day 15-21) window.

### 2.1 Selection ladder

Given today's date `D` and the chain's future expirations sorted
ascending, fill these three slots:

1. **Weekly** — the soonest future expiration (any weekday, any
   day-of-month).
2. **Monthly** — the soonest future 3rd-week expiration (day-of-month
   in `[15, 21]`, with weekday as a tiebreaker per §2.3) that is
   **strictly later** than the weekly slot. When the next 3rd-week
   date equals the weekly slot, the monthly slot cascades to the
   next 3rd-week after that — so a chain with no real weeklies
   (only monthly-cycle dates listed) still yields two distinct
   slots.
3. **Yearly** — the soonest future *January* 3rd-week expiration
   strictly later than the monthly slot. Same cascade rule applies
   when the next monthly slot IS the next January date.

Each slot is independent: if a chain has no qualifying date for a
slot, that slot is omitted (the result is `0`, `1`, `2`, or `3`
entries — never empty placeholders).

The selector returns a structured result so the UI can label each
contract honestly: `selectionReason: "weekly" | "monthly" | "yearly"`.

### 2.2 Why this shape

- **Weekly slot** matches the wheel-strategy short-dated cadence —
  the user can roll a cash-secured put weekly while waiting for
  assignment, capturing premium more times per year than a single
  monthly contract would.
- **Monthly slot** is the standard 30-50 DTE options-trading
  horizon and is where the bulk of OCC liquidity lives. For
  thinly-traded names whose chain only lists monthly-cycle dates
  (no real weeklies), the cascade pushes monthly to ~60 DTE and
  that's accepted.
- **Yearly slot** is the LEAPS horizon — matches the holding-period
  view of a value investor (the re-rate-to-fair-value thesis often
  takes quarters or years).

### 2.3 Date detection

A monthly third-week expiration is determined by the day-of-month
window alone: `date.day >= 15 && date.day <= 21`. Weekday is used as
a tiebreaker when multiple listed expirations fall inside the window
for the same month (the Friday entry is the canonical OCC monthly),
but it is **not** a hard filter. Yahoo occasionally lists a symbol's
monthly on an adjacent weekday — e.g. EIX's `EIX260618` Thursday
contract — and the selector must accept those when no Friday is
listed for that month. Yahoo returns expirations as ISO timestamps;
convert in UTC for the day check.

## 3. Strike selection

Strikes are anchored to the `FairValue` output from `fair-value.md`.
Each Ranked stock × expiration produces at most **one covered call**
and at most **one cash-secured put** — both anchored to the
conservative tail (`p25`) of the fair-value range per §3.1, with
per-side snap rules in §3.2 (calls) and §3.3 (puts). Snap warning
behavior is shared in §3.4.

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
  conservative fair value." Since Candidates have `current < p25` by
  definition, this strike is typically ITM at sale — the intrinsic
  value (= p25 − current) becomes part of the premium received and
  translates to a cost-basis discount upon assignment. If the stock
  recovers to p25 before expiry, we close the put (buy back at the
  remaining time value) and capture nearly the full premium as
  profit. Backtest evidence (`project_engine_alpha_2026_04_26`):
  strike-at-p25 doubles premium harvest vs the prior 5%-OTM
  approach when combined with buy-to-close + position-close-at-p25
  + 10%-profit-close mechanics.

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

- **Anchor**: `range.p25` (displayed; defines the upper bound for
  eligible strikes).
- **Eligibility filter**: strike ≤ p25 AND `bid > 0` AND
  `impliedVolatility > 0`. Deep-ITM strikes the broker quotes via
  parity (no active market) show IV=0 — these have no real time-
  value premium beyond intrinsic carry, so we skip them.
- **Selection**: among eligible strikes, pick the strike with
  **maximum time-value yield** = `(bid - max(0, K - S)) / K`.
  Time value isolates the actual premium the seller earns (intrinsic
  is just a discount on the future stock purchase, not income).
  This metric naturally peaks near ATM-to-slightly-ITM, which is
  also where the discount-vs-spot if assigned is largest.
- **Suppression**: when `current ≥ p25`, the entire put workflow is
  suppressed with reason `above-conservative-tail` (no value entry).
- **Label**: `deep-value`.

Updated 2026-04-27 (three times in one day, with cumulative learning):

1. Removed the previous OTM-only constraint after backtest evidence
   suggested ITM strikes were better. See `project_engine_alpha_*` memory.
2. Added the `impliedVolatility > 0` pre-filter after the EIX case
   study showed that deep-ITM puts on dividend payers can have
   IV → 0 (priced as forwards, no real premium beyond intrinsic
   carry).
3. **Switched from "highest IV>0 strike ≤ p25" to "max time-value
   yield among IV>0 strikes ≤ p25"** after a corrected-pricing
   backtest revealed that the prior wheel-at-p25 IRR (19.81%) was
   inflated by ~6 pp/yr from the naive intrinsic = K-S model. With
   proper put-call parity pricing (`bid ≈ K·e^(-rT) − S·e^(-qT) +
   time_value`), the deep-ITM advantage disappears entirely. Time-
   value yield as the selection criterion correctly picks
   slightly-OTM-to-near-ATM strikes where real premium peaks. The
   user's heuristic ("look for the highest strike with non-zero IV
   and best yield") matches this conclusion exactly.

For EIX 2026-04-27 (current=$68.50, p25=$100, 263 DTE), the new
rule picks **$67.50 (slightly OTM, time-value yield 8.59%)** instead
of $100 (deep-ITM, time-value yield NEGATIVE because bid < naive
intrinsic). The $67.50 strike also offers the deepest real discount
($6.80/share = 9.9% below current spot if assigned).

### 3.4 Snap warning

Both call and put outputs carry a boolean `snapWarning`. It is set
when the chosen strike differs from the `p25` anchor by more than 5%
(`|K − p25| / p25 > 0.05`) — the UI then surfaces a "no strike near
your target" chip so the user knows the trade is a compromise rather
than a clean hit on the anchor. Per-side snap rules (call: §3.2,
put: §3.3) decide *which* strike is picked; this section only
defines when the warning fires.

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
weekly). For monthly and yearly slots this is rarely an issue, but
mark any contract with `T < 30` as `shortDated: true` so the UI can
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
  fetchedAt: string;              // ISO timestamp of the chain fetch
  currentPrice: number;           // spot used for all return math
  expirations: Array<{
    expiration: string;
    selectionReason: "weekly" | "monthly" | "yearly";
    coveredCalls: CoveredCall[];  // at most 1; empty when no listed strike clears §3.2
    puts: CashSecuredPut[];       // at most 1; empty when no listed strike clears §3.3
    putsSuppressedReason?: "above-conservative-tail";  // set only when current ≥ p25
  }>;
};
```

## 6. Fetch policy

- **Batched during `npm run refresh`, Ranked-bucket only.** Options
  chains are heavier than quotes, so they're not fetched universe-wide
  — only for stocks gated into the Ranked bucket (the only ones whose
  output the Plan screen actually uses). The roll-up writes one
  `public/data/options/<SYMBOL>.json` per Ranked name and one
  `options-summary.json` index. Stale files (symbols that dropped out
  of Ranked) are pruned in the same step.
- **Throttle**: 1500 ms between chains by default
  (`packages/data/src/options/fetch-cli.ts`). Yahoo hasn't documented
  a chain rate limit, so the default is conservative; override with
  `--throttle <ms>` for ad-hoc runs.
- **Provider abstraction**: hidden behind `OptionsProvider` interface
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
- **Live smoke test (manual, not CI):** `npm run options:fetch -- DECK`
  → eyeball the three slot selections (weekly / monthly / yearly) and
  the single call + single put per slot against the user's fair-value
  mid for sanity.
- **Regression test:** the user's NVO Jan-2027 $40 covered call is a
  known fixture — given the chain on a known date, our model should
  flag it as the "conservative" strike and produce return numbers
  matching the user's actuals (premium $12,297 / 2000 sh = $6.15/sh).

## 10. Open questions

1. **Implied volatility surface.** Yahoo gives per-contract IV. The
   current §3.3 put rule uses it only as a tradability filter
   (`IV > 0` rejects deep-ITM parity-priced contracts). Could surface
   it as a "premium richness" indicator (high IV = paid more for the
   same strike) but that's a v2 feature.
2. **Dividend forecasting for expectedDividends.** `quote.dividendRate
   × (T / 365)` assumes the current rate continues. For dividend
   growers (KO, JNJ) this is conservative; for dividend cutters it
   overstates. Acceptable approximation for v1.
3. **Roll suggestions.** When a covered call is approaching expiry
   ITM, the natural next question is "roll up and out?" — explicitly
   out of scope for v1; needs the holdings module first.

### Resolved (kept for traceability)

- **Put-strike anchor** (resolved 2026-04-27 → §3.1/§3.3). Both
  call and put now anchor to `p25` (not mirrored tails); puts pick
  the OTM strike closest to current under bid/IV/premium floors.
- **Multiple expirations in the UI** (resolved 2026-05-11). The
  Plan screen exposes three independent tabs — weekly / monthly /
  yearly — so no single screen renders all expirations at once.
