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

type CallAnchorSpec = { label: CoveredCallLabel; anchor: CoveredCallAnchor };
type PutAnchorSpec = { label: CashSecuredPutLabel; anchor: CashSecuredPutAnchor };

const CALL_ANCHORS: CallAnchorSpec[] = [
  { label: "conservative", anchor: "p25" },
  { label: "aggressive", anchor: "median" },
  { label: "stretch", anchor: "p75" },
];

const PUT_ANCHORS: PutAnchorSpec[] = [
  { label: "stretch", anchor: "p75" },
  { label: "aggressive", anchor: "median" },
  { label: "deep-value", anchor: "p25" },
];

function anchorPrice(range: NonNullable<FairValue["range"]>, key: "p25" | "median" | "p75"): number {
  return range[key];
}

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

  // Dedupe by snapped strike: when two anchors collapse onto the same
  // listed strike, keep the entry whose anchor is closest to that
  // strike — that label most honestly describes what the snap chose.
  const callsByStrike = new Map<number, CoveredCall>();
  for (const spec of CALL_ANCHORS) {
    const anchor = anchorPrice(range, spec.anchor);
    // §3.1 floor: anchor below current price means strike < spot — drop.
    if (anchor < currentPrice) continue;

    const snap = snapStrike(callStrikes, anchor, "call");
    if (!snap) continue;

    const contract = findContract(group.calls, snap.strike);
    if (!contract) continue;
    if (contract.bid === null || contract.bid <= 0) continue;

    const r = computeCallReturns({ contract, currentPrice, annualDividendPerShare });
    const candidate: CoveredCall = {
      label: spec.label,
      anchor: spec.anchor,
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
    };
    const existing = callsByStrike.get(snap.strike);
    if (!existing) {
      callsByStrike.set(snap.strike, candidate);
    } else if (
      Math.abs(anchor - snap.strike) < Math.abs(existing.anchorPrice - snap.strike)
    ) {
      callsByStrike.set(snap.strike, candidate);
    }
  }
  const coveredCalls = Array.from(callsByStrike.values()).sort(
    (a, b) => a.contract.strike - b.contract.strike,
  );

  // §3.2 suppression: stock already below the low end of fair value →
  // outright buy beats put-selling for this profile.
  if (currentPrice < range.p25) {
    return {
      expiration: selected.expiration,
      selectionReason: selected.selectionReason,
      coveredCalls,
      puts: [],
      putsSuppressedReason: "below-fair-value",
    };
  }

  const putsByStrike = new Map<number, CashSecuredPut>();
  for (const spec of PUT_ANCHORS) {
    const anchor = anchorPrice(range, spec.anchor);
    const snap = snapStrike(putStrikes, anchor, "put");
    if (!snap) continue;

    const contract = findContract(group.puts, snap.strike);
    if (!contract) continue;
    if (contract.bid === null || contract.bid <= 0) continue;

    const r = computePutReturns({ contract, currentPrice });
    const candidate: CashSecuredPut = {
      label: spec.label,
      anchor: spec.anchor,
      anchorPrice: anchor,
      contract,
      snapWarning: snap.snapWarning,
      shortDated: r.shortDated,
      notAssignedReturnPct: r.notAssignedReturnPct,
      notAssignedAnnualizedPct: r.notAssignedAnnualizedPct,
      effectiveCostBasis: r.effectiveCostBasis,
      effectiveDiscountPct: r.effectiveDiscountPct,
      inTheMoney: r.inTheMoney,
    };
    const existing = putsByStrike.get(snap.strike);
    if (!existing) {
      putsByStrike.set(snap.strike, candidate);
    } else if (
      Math.abs(anchor - snap.strike) < Math.abs(existing.anchorPrice - snap.strike)
    ) {
      putsByStrike.set(snap.strike, candidate);
    }
  }
  // Sort puts descending by strike so "stretch" (closest to current)
  // appears first — matches PUT_ANCHORS ordering when no dedup happened.
  const puts = Array.from(putsByStrike.values()).sort(
    (a, b) => b.contract.strike - a.contract.strike,
  );

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
