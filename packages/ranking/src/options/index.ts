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
} from "./types.js";
import { snapStrike } from "./strike-snap.js";
import { computeCallReturns, computePutReturns } from "./returns.js";

export type { CoveredCall, CashSecuredPut, ExpirationView, OptionsView } from "./types.js";

type SelectedExpirationMeta = {
  expiration: string;
  selectionReason: "leap" | "leap-fallback" | "quarterly" | "monthly";
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
  const coveredCalls: CoveredCall[] = [];
  if (anchor >= currentPrice) {
    const snap = snapStrike(callStrikes, anchor, "call");
    if (snap && snap.strike >= currentPrice) {
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

  // ---- Single cash-secured put: strike anchored at p25 ----
  // For Candidates (current < p25) the snapped strike is typically
  // ABOVE current — i.e., the put is ITM at sale. The premium
  // received includes the intrinsic value (strike − current), which
  // becomes part of the cost-basis cushion if assigned. If the stock
  // recovers to p25 before expiry we close the put early (buy-back)
  // and capture nearly all the premium as profit. See backtest memory
  // for the wheel mechanics this matches.
  const puts: CashSecuredPut[] = [];
  if (currentPrice >= range.p25) {
    // Stock is already at or above the conservative tail — there's
    // no "buy at discount" thesis. Suppress puts.
    return {
      expiration: selected.expiration,
      selectionReason: selected.selectionReason,
      coveredCalls,
      puts: [],
      putsSuppressedReason: "above-conservative-tail",
    };
  }

  // Snap to highest listed put strike ≤ p25. snapStrike() for puts
  // walks descending from the anchor, so the result is "the listed
  // strike just below or at p25." For Candidates this is typically
  // ITM (strike > current) — that's the design: the intrinsic value
  // is part of the premium and translates to a cost-basis discount
  // upon assignment.
  const putSnap = snapStrike(putStrikes, range.p25, "put");
  if (putSnap) {
    const contract = findContract(group.puts, putSnap.strike);
    if (contract && contract.bid !== null && contract.bid > 0) {
      const r = computePutReturns({ contract, currentPrice });
      puts.push({
        label: PUT_LABEL,
        anchor: PUT_ANCHOR,
        anchorPrice: anchor,
        contract,
        snapWarning: putSnap.snapWarning,
        shortDated: r.shortDated,
        notAssignedReturnPct: r.notAssignedReturnPct,
        notAssignedAnnualizedPct: r.notAssignedAnnualizedPct,
        effectiveCostBasis: r.effectiveCostBasis,
        effectiveDiscountPct: r.effectiveDiscountPct,
        inTheMoney: r.inTheMoney,
      });
    }
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
