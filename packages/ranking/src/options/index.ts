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

// Single anchor strategy: every strike is anchored to the conservative
// fair-value tail (p25). Calls assign at p25 or just above (the
// "exit at conservative fair value" trade); puts assign at the highest
// strike below current that's also ≤ p25 (the "buy at or below
// conservative fair value" trade). Median + p75 anchors were dropped
// to keep the workflow honest — selling above the conservative tail is
// greedy for a value investor; buying above it isn't a value entry.
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

  // ---- Single cash-secured put: anchored at p25, snapped to ≤ p25 AND ≤ current ----
  // When current < p25 (the Ranked precondition), the binding constraint
  // is "≤ current" — we want the highest OTM put strike. Snap to ≤ p25
  // first, then enforce the post-snap floor against current price.
  const puts: CashSecuredPut[] = [];
  if (currentPrice >= range.p25) {
    // Stock is at or above the conservative tail — selling a put at
    // (or above) p25 isn't a value entry for this profile.
    return {
      expiration: selected.expiration,
      selectionReason: selected.selectionReason,
      coveredCalls,
      puts: [],
      putsSuppressedReason: "above-conservative-tail",
    };
  }

  // Put snap target = min(p25, current). Since this branch only runs
  // when current < p25, that simplifies to current — i.e., "find the
  // highest put strike ≤ current." This is the meaningful constraint:
  // we want OTM (≤ current) AND at-or-below the conservative tail
  // (≤ p25 — guaranteed by current < p25). The displayed anchorPrice
  // remains p25 for consistency with the call side.
  const putSnap = snapStrike(putStrikes, currentPrice, "put");
  if (putSnap && putSnap.strike <= currentPrice) {
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
