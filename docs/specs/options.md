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

## 2. Expiration selection (monthlies + yearly)

Surface every monthly 3rd-week expiration between today and the
yearly (January) slot, plus the yearly itself. The UI's Plan screen
shows two tabs — Monthly + Yearly — while the broader set of monthly
chains is kept on disk so the portfolio screen can look up bid/ask
for any held contract by its expiration date.

The weekly slot was removed 2026-05-26: the user only writes monthly+
horizons, so a "weekly" tab encouraged a workflow they don't actually
follow.

### 2.1 Selection ladder

Given today's date `D` and the chain's future expirations sorted
ascending:

1. **Monthlies** — for each future 3rd-week expiration (day-of-month
   in `[15, 21]`, weekday as a tiebreaker per §2.3), emit one entry
   per calendar month up to (exclusive of) the yearly slot. Prefer
   the Friday entry when multiple day-15-21 dates exist in the same
   month; fall back to the latest such day otherwise. All emit
   `selectionReason: "monthly"`.
2. **Yearly** — the soonest future *January* 3rd-week expiration.
   When the soonest Jan candidate is within 60 days of today AND a
   later Jan exists in the chain, the yearly slot cascades forward
   to that later Jan so "yearly" actually represents a ~1-year
   horizon (not a near-term contract that just happens to be in
   January). Emits `selectionReason: "yearly"`.

If the chain has no Jan 3rd-week at all, the yearly slot is omitted
and the result is just the monthlies. If the chain lists only the
yearly with no intermediate monthlies (rare illiquid case), the
result is a single yearly entry.

The selector returns a structured result so the UI can label each
contract honestly: `selectionReason: "monthly" | "yearly"`.

### 2.2 Why this shape

- **Monthlies** are the user's only writing horizon (monthly+
  contracts only). The widened set — every 3rd-week from today
  through yearly — keeps the portfolio screen useful for held
  options on any month between now and the LEAPS slot, since the
  per-symbol options JSON now contains the full chain context.
- **Yearly** is the LEAPS horizon — matches the holding-period
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

- A covered call sold at (or just above) the p25 strike says "I'd
  happily exit at my conservative fair value with a premium on top."
  Selling above p25 (median, p75) is greedy — you might never get
  assigned, and if the stock recovers to median, you've capped at
  higher than necessary.
- A cash-secured put says "pay me to wait for my entry." The put is
  only offered while `current < p25` (we want to own the stock), but
  its strike is selected from the **strictly-OTM** strikes below
  current (§3.3) — NOT at p25. The earlier ITM-at-p25 design was
  retracted: the corrected put-call-parity backtest (2026-04-27,
  commit 3961cdf) showed ITM "intrinsic harvesting" was an artifact
  of mispricing — deep-ITM puts are priced as forwards (bid ≈
  PV(K) − S, IV → 0) and carry no real income beyond intrinsic. Real
  seller income is time value only, and time value peaks near ATM.

### 3.2 Covered-call strike (sell side)

- **Anchor**: the **projected `p25` at the call's expiration** when a
  forward projection is available (OLS over trailing quarterly
  FV-trend samples — see `packages/ranking/src/projections/`), else
  today's `range.p25`. An improving FV picks a higher strike that
  captures the upward drift; the value-thesis gate ("would I accept
  being called away here?") still uses today's p25.
- **Snap**: prefer listed strike `≥ anchor`; fall back to nearest
  below if none exists.
- **Floor**: drop the call unless the snapped strike is **strictly
  above** `currentPrice` (OTM-only, user directive 2026-05-13 —
  ATM/ITM calls are guaranteed assignment with a misleading static
  return).
- **Liquidity** (2026-06-11, mirrors the put-side floors): require
  `bid > 0` AND `impliedVolatility > 0.01` AND `bid × 100 ≥ $10` per
  contract. Yahoo marks parity-priced contracts with a sentinel IV of
  ~1e-5 (not exactly 0), so the epsilon is what actually catches
  them; the premium floor cuts penny-bid noise the same way it does
  for puts.
- **Label**: `conservative`.

When the orchestrator is run for a stock with `current ≥ p25`, no call
is emitted — but in practice the ingest only feeds Ranked-bucket
stocks (which already require `current < p25`), so this branch is
defensive.

### 3.3 Cash-secured-put strike (buy side)

Current rule (2026-05-13, "closest-to-target, bounded"):

1. **OTM only** — eligible strikes are **strictly below**
   `currentPrice`. ITM entry was retracted with the pricing-bug fix
   (see history below).
2. **Max-OTM cap**: strike ≥ `currentPrice × 0.75`. Deeper strikes
   (> 25% OTM) require an implausible crash before assignment AND
   tend to surface stale-IV / penny-bid data that doesn't reflect
   real market liquidity.
3. **Tradability**: `bid > 0` AND `impliedVolatility > 0.01` (rejects
   parity-priced contracts with no active market). The epsilon
   matters: Yahoo's sentinel IV on parity-priced contracts is
   ~`1e-5`, not exactly 0, so a plain `> 0` check passes them
   (observed in the 2026-06-10 capture across 15 symbols).
4. **Premium floor**: `bid × 100 ≥ $10` per contract. Cuts out
   pathological penny quotes that pass the IV filter but are noise,
   not income.
5. **Selection**: among survivors, pick the strike **closest to the
   target**; ties prefer the higher strike. Target = the **projected
   price at the put's expiration** when a forward projection exists
   (same OLS machinery as §3.2), else `currentPrice` — i.e. the
   least-OTM ("near-ATM") strike. Bearish projections lower the
   target; bullish projections push it up against the OTM floor
   (which always stays anchored to TODAY's current).
- **Suppression**: when `current ≥ p25`, the entire put workflow is
  suppressed with reason `above-conservative-tail` (no value entry).
- **Anchor (display)**: `range.p25` is still surfaced as the
  `anchorPrice` and drives the §3.4 snap warning, but it no longer
  bounds strike eligibility — OTM-below-current is below p25 by
  construction (Candidates require `current < p25`).
- **Label**: `deep-value`.

History (cumulative learning, each step motivated by a real case):

1. **2026-04-27** — removed the original OTM-only constraint after a
   (naively priced) backtest suggested ITM-at-p25 was better.
2. **2026-04-27** — added the `impliedVolatility > 0` pre-filter
   after the EIX case study showed deep-ITM puts on dividend payers
   have IV → 0 (priced as forwards, no real premium beyond intrinsic
   carry).
3. **2026-04-27** — corrected put-call-parity pricing revealed the
   wheel-at-p25 IRR (19.81%) was inflated ~6 pp/yr by the naive
   `intrinsic = K − S` model; switched selection to max time-value
   yield = `(bid − max(0, K−S)) / K`, which peaks slightly-OTM-to-
   near-ATM. EIX example: rule picks $67.50 (TV yield 8.59%) over
   $100 deep-ITM (TV yield negative).
4. **2026-05-11** (commit ba706e2) — re-imposed **strictly-OTM** on
   both sides: with time-value as the only real income, ITM entry
   has no edge and worse downside accounting.
5. **2026-05-13** (commits b095bb1, 5db6d44) — replaced max-TV-yield
   with **closest-to-current**: bid/K yield maximization kept
   surfacing strikes whose "yield" was a data artifact (SYF deep-OTM
   with stale IV = 188.6%; F $4 strike penny bid at $11.82 spot).
   Added the 25% OTM cap and $10/contract floor from the same cases.
   Near-ATM is where real time value peaks anyway, so the honest
   data filter and the yield objective converge on the same strikes.
6. **2026-05-26 / projections** — target re-anchored to the
   projected price at expiry when trend samples support it.

Backtest status: the corrected-pricing portfolio backtest
(2026-04-27, yield-aware grid ≤ ATM, Tasty 50% close) returned
**12.97%/yr IRR vs 14.70% ex-Mag-7 equal-weight and 13.44% SPY** on
2017-12-31 → 2026-04-22 with identical DCA — i.e. the CSP/CC overlay
did NOT add alpha over holding the same universe once pricing was
corrected; its value is entry/exit discipline and income smoothness,
not return enhancement. The 2026-05-13 production rule was
re-validated 2026-06-11 (`docs/backtest-production-rule-2026-06-11.md`):
with projection targeting OFF it matches yield-aware (12.88%/yr,
within run noise); with projection ON it loses a further **0.85
pp/yr** (12.03%) — the same trend-extrapolation failure shape as the
removed H10 signal. Open decision: drop the §3.3 projection target
(fall back to closest-to-current) or re-test on real premiums once
`data/options-archive/` matures.

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
    selectionReason: "monthly" | "yearly";
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
- **Dated chain archive** (2026-06-11). Every full Ranked-bucket
  fetch also appends one file to `data/options-archive/` at the repo
  root: `<snapshotDate>.json.gz` — gzipped, minified JSON of shape
  `{ snapshotDate, generatedAt, views: OptionsView[] }` containing
  every per-symbol view written that day, chains included. Purpose:
  all backtests so far price options synthetically (realized-vol
  Black-Scholes approximation), which can rank configurations against
  each other but cannot measure absolute alpha — real captured
  bids/asks/IV are the only way to validate premium income. The
  archive makes a real-premium backtest possible once enough history
  accumulates (~6-12 months). Properties:
  - Repo root `data/`, NOT `public/` — the archive must not ship
    with the GitHub Pages build.
  - Gzipped + minified (~1 MB/day vs ~12 MB pretty-printed); same-day
    re-runs overwrite (last fetch of the day wins).
  - Never pruned — unlike `public/data/options/<SYMBOL>.json`, the
    point is accumulation.
  - Ad-hoc single-symbol runs (`npm run options:fetch -- DECK`) do
    NOT archive — a partial-universe file would poison the day's
    record. Only the full refresh path writes the archive.

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
  → eyeball the monthly slot selections (one per month from today
  through the yearly) plus the yearly entry, and the single call +
  single put per slot, against the user's fair-value mid for sanity.
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
- **Multiple expirations in the UI** (resolved 2026-05-11, refined
  2026-05-26). The Plan screen exposes two tabs — Monthly + Yearly
  — and the per-symbol options JSON additionally contains every
  monthly 3rd-week between today and yearly for the portfolio's
  bid/ask lookup. The weekly tab was removed because the user only
  writes monthly+ horizons.
