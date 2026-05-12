/**
 * Per-stock options-view orchestrator. Consumes a fair-value range +
 * one or more fetched expiration groups and produces the
 * `OptionsView` the UI renders. See docs/specs/options.md §3, §4.
 */

import type { ContractQuote, ExpirationGroup } from "@stockrank/core";
import type { FairValue } from "../fair-value/types.js";
import type {
  CashSecuredPut,
  CashSecuredPutAnchor,
  CashSecuredPutLabel,
  CoveredCall,
  CoveredCallAnchor,
  CoveredCallLabel,
  ExpirationView,
  OptionsView,
  SelectionReason,
} from "./types.js";
import { snapStrike } from "./strike-snap.js";
import { computeCallReturns, computePutReturns } from "./returns.js";

export type { CoveredCall, CashSecuredPut, ExpirationView, OptionsView, SelectionReason } from "./types.js";

type SelectedExpirationMeta = {
  expiration: string;
  selectionReason: SelectionReason;
};

// Single-anchor strategy: every strike is anchored to the conservative
// fair-value tail (p25).
//
// Calls assign at p25 or just above — "exit at conservative fair value."
//
// Puts target the highest listed strike at-or-below p25 (typically
// ITM for Candidates, since price < p25 by definition). The intrinsic
// value of an ITM put becomes part of the premium received; if assigned,
// effective cost basis = strike − premium ≈ price below current spot.
// If the stock recovers to p25 before expiry, we close the put (buy
// back) capturing nearly all the premium and freeing capital for the
// next cycle. This is the wheel mechanic validated in the 2026-04-26/27
// portfolio backtest (see project_engine_alpha_2026_04_26 memory):
// at strike=p25 with 1y expiry, premium harvest is ~2× the OTM
// strategy and IRR is materially higher when combined with B2C +
// position-close-at-p25 + 10%-profit close.
//
// Median + p75 anchors were dropped earlier to keep the workflow
// honest — selling above the conservative tail is greedy for a value
// investor.
const CALL_LABEL: CoveredCallLabel = "conservative";
const CALL_ANCHOR: CoveredCallAnchor = "p25";
const PUT_LABEL: CashSecuredPutLabel = "deep-value";
const PUT_ANCHOR: CashSecuredPutAnchor = "p25";

function findContract(
  contracts: ContractQuote[],
  strike: number,
): ContractQuote | undefined {
  return contracts.find((c) => c.strike === strike);
}

export type BuildExpirationViewInput = {
  selected: SelectedExpirationMeta;
  group: ExpirationGroup;
  fairValue: FairValue;
  currentPrice: number;
  annualDividendPerShare: number;
};

export function buildExpirationView(input: BuildExpirationViewInput): ExpirationView {
  const { selected, group, fairValue, currentPrice, annualDividendPerShare } = input;
  const range = fairValue.range;

  if (!range) {
    return {
      expiration: selected.expiration,
      selectionReason: selected.selectionReason,
      coveredCalls: [],
      puts: [],
    };
  }

  const callStrikes = group.calls.map((c) => c.strike);
  const putStrikes = group.puts.map((p) => p.strike);
  const anchor = range.p25;

  // ---- Single covered call: anchored at p25, snapped to ≥ p25 with bid > 0 ----
  //
  // OTM-only rule (user directive 2026-05-13): strike must be STRICTLY
  // greater than current price. Skipping ATM/ITM keeps the workflow
  // honest — covered calls are "if I'd accept being called away at this
  // price for premium", which only makes sense above current.
  const coveredCalls: CoveredCall[] = [];
  if (anchor > currentPrice) {
    const snap = snapStrike(callStrikes, anchor, "call");
    if (snap && snap.strike > currentPrice) {
      const contract = findContract(group.calls, snap.strike);
      if (contract && contract.bid !== null && contract.bid > 0) {
        const r = computeCallReturns({ contract, currentPrice, annualDividendPerShare });
        coveredCalls.push({
          label: CALL_LABEL,
          anchor: CALL_ANCHOR,
          anchorPrice: anchor,
          contract,
          snapWarning: snap.snapWarning,
          shortDated: r.shortDated,
          staticReturnPct: r.staticReturnPct,
          staticAnnualizedPct: r.staticAnnualizedPct,
          assignedReturnPct: r.assignedReturnPct,
          assignedAnnualizedPct: r.assignedAnnualizedPct,
          effectiveCostBasis: r.effectiveCostBasis,
          effectiveDiscountPct: r.effectiveDiscountPct,
        });
      }
    }
  }

  // ---- Single cash-secured put: highest OTM strike (closest to current) ----
  //
  // Strike selection rule (revised 2026-05-13 — closest-to-current,
  // bounded):
  //   1. Filter to strikes STRICTLY BELOW current price — OTM only.
  //   2. Cap maximum OTM distance: strike ≥ currentPrice × 0.75.
  //      Deeper strikes (> 25% OTM) require an implausible crash
  //      before assignment AND tend to surface stale-IV / penny-bid
  //      data that doesn't reflect real market liquidity.
  //   3. Require bid > 0 AND impliedVolatility > 0 (tradeable contract).
  //   4. Require bid × 100 ≥ $10 of premium per contract. Cuts out
  //      pathological penny quotes (F 2026-05-13: $4 strike bid $0.01
  //      passed the IV>0 filter but the $1 premium per contract is
  //      noise, not income).
  //   5. Among survivors, pick the MAX strike — the OTM strike closest
  //      to current price ("least OTM" / near-ATM).
  //
  // When NO strike survives, the put is suppressed for that expiration.
  // The user sees an empty puts list for that mode and can switch to
  // weekly/yearly — better than a garbage strike pretending to be
  // actionable. History motivating each filter:
  //   - 2026-04-27 (EIX): deep-ITM strikes with IV=0 priced as forwards.
  //   - 2026-05-13 (SYF): deep-OTM strike with stale IV=188.6%.
  //   - 2026-05-13 (F):   penny bid on $4 strike at $11.82 current.
  const MIN_OTM_STRIKE_FRACTION = 0.75;
  const MIN_PREMIUM_PER_CONTRACT_DOLLARS = 10;

  const puts: CashSecuredPut[] = [];
  if (currentPrice >= range.p25) {
    return {
      expiration: selected.expiration,
      selectionReason: selected.selectionReason,
      coveredCalls,
      puts: [],
      putsSuppressedReason: "above-conservative-tail",
    };
  }

  const minStrike = currentPrice * MIN_OTM_STRIKE_FRACTION;
  let bestStrike: number | null = null;
  for (const strike of putStrikes) {
    // OTM-only: strike strictly less than current.
    if (strike >= currentPrice) continue;
    // Max-OTM cap: strike no more than 25% below current.
    if (strike < minStrike) continue;
    const c = findContract(group.puts, strike);
    if (
      c === undefined ||
      c.bid === null ||
      c.bid <= 0 ||
      c.impliedVolatility === null ||
      c.impliedVolatility <= 0
    ) {
      continue;
    }
    // Premium floor: at least $10 per contract.
    if (c.bid * 100 < MIN_PREMIUM_PER_CONTRACT_DOLLARS) continue;
    if (bestStrike === null || strike > bestStrike) {
      bestStrike = strike;
    }
  }

  if (bestStrike !== null) {
    const contract = findContract(group.puts, bestStrike)!;
    // Snap warning: chosen strike differs from p25 by >5% (informational).
    const offByPct = Math.abs(bestStrike - range.p25) / range.p25;
    const snapWarning = offByPct > 0.05;
    const r = computePutReturns({ contract, currentPrice });
    puts.push({
      label: PUT_LABEL,
      anchor: PUT_ANCHOR,
      anchorPrice: anchor,
      contract,
      snapWarning,
      shortDated: r.shortDated,
      notAssignedReturnPct: r.notAssignedReturnPct,
      notAssignedAnnualizedPct: r.notAssignedAnnualizedPct,
      effectiveCostBasis: r.effectiveCostBasis,
      effectiveDiscountPct: r.effectiveDiscountPct,
      inTheMoney: r.inTheMoney,
    });
  }

  return {
    expiration: selected.expiration,
    selectionReason: selected.selectionReason,
    coveredCalls,
    puts,
  };
}

export type BuildOptionsViewInput = {
  symbol: string;
  fetchedAt: string;
  currentPrice: number;
  annualDividendPerShare: number;
  fairValue: FairValue;
  expirations: Array<{ selected: SelectedExpirationMeta; group: ExpirationGroup }>;
};

export function buildOptionsView(input: BuildOptionsViewInput): OptionsView {
  return {
    symbol: input.symbol,
    fetchedAt: input.fetchedAt,
    currentPrice: input.currentPrice,
    expirations: input.expirations.map((e) =>
      buildExpirationView({
        selected: e.selected,
        group: e.group,
        fairValue: input.fairValue,
        currentPrice: input.currentPrice,
        annualDividendPerShare: input.annualDividendPerShare,
      }),
    ),
  };
}
