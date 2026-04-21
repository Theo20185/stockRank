#!/usr/bin/env tsx
/**
 * One-shot audit across the per-symbol options JSON files in
 * public/data/options/ + the rolled-up summary. Looks for rows that
 * would land on a user as bad trades or data quality flags:
 *
 *   - ITM survivors (call strike < spot, put strike > spot) — should be
 *     impossible after the post-snap floor lands; this is a regression check.
 *   - Sparse chains: only one strike per side, or zero open interest.
 *   - Implausibly attractive returns (best call > 50% annl, best put > 30%
 *     on collateral) — usually points to an illiquid stale quote.
 *   - Short-dated picks chosen as the "best" — annualized number is
 *     stretched.
 *   - Anchor-vs-snap distance > 10% (snap warning fired hard).
 *   - Effective put cost basis above current price (definitionally ITM).
 *
 * Pure read-only. Use after every refresh as a sanity pass.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OptionsSummary } from "@stockrank/core";
import type { OptionsView } from "@stockrank/ranking";

const OPTIONS_DIR = resolve(process.cwd(), "public/data/options");
const SUMMARY_PATH = resolve(process.cwd(), "public/data/options-summary.json");

type Finding = {
  symbol: string;
  severity: "CRITICAL" | "WARN" | "INFO";
  rule: string;
  detail: string;
};

function loadView(symbol: string): OptionsView {
  return JSON.parse(readFileSync(resolve(OPTIONS_DIR, `${symbol}.json`), "utf8")) as OptionsView;
}

function loadSummary(): OptionsSummary | null {
  try {
    return JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as OptionsSummary;
  } catch {
    return null;
  }
}

function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function audit(): Finding[] {
  const findings: Finding[] = [];
  const symbols = readdirSync(OPTIONS_DIR)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length));

  for (const symbol of symbols) {
    const view = loadView(symbol);
    const spot = view.currentPrice;

    let totalCalls = 0;
    let totalPuts = 0;

    for (const exp of view.expirations) {
      totalCalls += exp.coveredCalls.length;
      totalPuts += exp.puts.length;

      for (const c of exp.coveredCalls) {
        if (c.contract.strike < spot) {
          findings.push({
            symbol,
            severity: "CRITICAL",
            rule: "ITM call survived",
            detail: `${exp.expiration} K=$${c.contract.strike} < spot $${spot.toFixed(2)} (${c.label})`,
          });
        }
        if (c.contract.openInterest === 0 && c.contract.volume === 0) {
          findings.push({
            symbol,
            severity: "WARN",
            rule: "Zero liquidity contract",
            detail: `${exp.expiration} CALL K=$${c.contract.strike} OI=0 vol=0 — bid is stale`,
          });
        }
        if (c.shortDated) {
          findings.push({
            symbol,
            severity: "INFO",
            rule: "Short-dated covered call",
            detail: `${exp.expiration} K=$${c.contract.strike} DTE=${c.contract.daysToExpiry} — annualized ${pct(c.staticAnnualizedPct)} not repeatable`,
          });
        }
        const snapDistance = Math.abs(c.contract.strike - c.anchorPrice) / c.anchorPrice;
        if (snapDistance > 0.10) {
          findings.push({
            symbol,
            severity: "WARN",
            rule: "Hard snap (>10% off anchor)",
            detail: `${exp.expiration} CALL K=$${c.contract.strike} vs anchor $${c.anchorPrice.toFixed(2)} (${(snapDistance * 100).toFixed(0)}% off)`,
          });
        }
      }

      for (const p of exp.puts) {
        if (p.contract.strike > spot) {
          findings.push({
            symbol,
            severity: "CRITICAL",
            rule: "ITM put survived",
            detail: `${exp.expiration} K=$${p.contract.strike} > spot $${spot.toFixed(2)} (${p.label})`,
          });
        }
        if (p.effectiveCostBasis > spot) {
          findings.push({
            symbol,
            severity: "CRITICAL",
            rule: "Put effective cost > spot",
            detail: `${exp.expiration} K=$${p.contract.strike} eff=$${p.effectiveCostBasis.toFixed(2)} vs spot $${spot.toFixed(2)}`,
          });
        }
        if (p.contract.openInterest === 0 && p.contract.volume === 0) {
          findings.push({
            symbol,
            severity: "WARN",
            rule: "Zero liquidity contract",
            detail: `${exp.expiration} PUT K=$${p.contract.strike} OI=0 vol=0 — bid is stale`,
          });
        }
        if (p.shortDated) {
          findings.push({
            symbol,
            severity: "INFO",
            rule: "Short-dated put",
            detail: `${exp.expiration} K=$${p.contract.strike} DTE=${p.contract.daysToExpiry} — annualized ${pct(p.notAssignedAnnualizedPct)} not repeatable`,
          });
        }
        const snapDistance = Math.abs(p.contract.strike - p.anchorPrice) / p.anchorPrice;
        if (snapDistance > 0.10) {
          findings.push({
            symbol,
            severity: "WARN",
            rule: "Hard snap (>10% off anchor)",
            detail: `${exp.expiration} PUT K=$${p.contract.strike} vs anchor $${p.anchorPrice.toFixed(2)} (${(snapDistance * 100).toFixed(0)}% off)`,
          });
        }
      }
    }

    if (totalCalls === 0 && totalPuts === 0) {
      findings.push({
        symbol,
        severity: "WARN",
        rule: "No contracts after filters",
        detail: `chain has expirations but every strike was dropped (sparse chain or all ITM)`,
      });
    } else if (totalCalls + totalPuts === 1) {
      findings.push({
        symbol,
        severity: "WARN",
        rule: "Single-contract chain",
        detail: `only ${totalCalls + totalPuts} contract(s) survived filters across all expirations`,
      });
    }
  }

  // Cross-check the summary for absurdly attractive rolled-up numbers.
  const summary = loadSummary();
  if (summary) {
    for (const [symbol, best] of Object.entries(summary.symbols)) {
      if (best.bestCallAnnualized !== null && best.bestCallAnnualized > 0.50) {
        findings.push({
          symbol,
          severity: "WARN",
          rule: "Best Call > 50% annualized",
          detail: `summary reports ${pct(best.bestCallAnnualized)} — usually points to a stale or illiquid quote`,
        });
      }
      if (best.bestPutAnnualized !== null && best.bestPutAnnualized > 0.30) {
        findings.push({
          symbol,
          severity: "WARN",
          rule: "Best Put > 30% annualized",
          detail: `summary reports ${pct(best.bestPutAnnualized)} on collateral — usually a stale/illiquid quote`,
        });
      }
    }
  }

  return findings;
}

function main(): void {
  const findings = audit();
  const bySeverity = { CRITICAL: 0, WARN: 0, INFO: 0 };
  for (const f of findings) bySeverity[f.severity] += 1;

  const order = { CRITICAL: 0, WARN: 1, INFO: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.symbol.localeCompare(b.symbol));

  console.log(`audit: ${findings.length} findings (${bySeverity.CRITICAL} critical, ${bySeverity.WARN} warn, ${bySeverity.INFO} info)\n`);

  for (const f of findings) {
    console.log(`[${f.severity}] ${f.symbol} — ${f.rule}`);
    console.log(`         ${f.detail}`);
  }

  if (bySeverity.CRITICAL > 0) {
    process.exit(1);
  }
}

main();
