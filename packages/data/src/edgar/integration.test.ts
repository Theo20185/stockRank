/**
 * Live EDGAR parity check. Network-dependent test that:
 *   1. Fetches AAPL companyfacts (uses cache after first run).
 *   2. Maps to AnnualPeriod[] via the EDGAR mapper.
 *   3. Compares the most-recent fiscal year against the prior
 *      Yahoo-sourced snapshot at public/data/snapshot-latest.json.
 *
 * Skips automatically when:
 *   - The network is unreachable (CI, offline).
 *   - public/data/snapshot-latest.json doesn't have AAPL.
 *
 * See docs/specs/edgar.md §8 — this is the per-symbol parity gate.
 * For full S&P 500 validation, walk every symbol through the same
 * comparison.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@stockrank/core";
import { fetchCompanyFacts } from "./fetcher.js";
import { mapAnnualPeriods, withAnnualRatios } from "./mapper.js";

const RUN = process.env.EDGAR_LIVE_TEST === "1";

describe.skipIf(!RUN)("EDGAR live parity (AAPL)", () => {
  it("matches the snapshot's most-recent annual to within rounding", async () => {
    const facts = await fetchCompanyFacts("AAPL");
    const annuals = mapAnnualPeriods(facts).map(withAnnualRatios);
    expect(annuals.length).toBeGreaterThan(0);

    let snap: Snapshot;
    try {
      snap = JSON.parse(
        await readFile(resolve("public/data/snapshot-latest.json"), "utf8"),
      ) as Snapshot;
    } catch {
      console.warn("snapshot-latest.json missing, skipping parity check");
      return;
    }
    const aapl = snap.companies.find((c) => c.symbol === "AAPL");
    if (!aapl || !aapl.annual[0]) {
      console.warn("AAPL not in snapshot, skipping parity check");
      return;
    }

    const edgar = annuals[0]!;
    const yahoo = aapl.annual[0]!;

    // Period-end dates may differ by a day or two depending on Apple's
    // fiscal calendar variant — the snapshot's date is from Yahoo's
    // version, the EDGAR date is from the 10-K filing. Both refer to
    // the same fiscal year.
    expect(edgar.fiscalYear).toBe(yahoo.fiscalYear);

    const tolerate = (a: number | null, b: number | null, name: string) => {
      if (a === null || b === null) return;
      if (b === 0) return;
      const diff = Math.abs(a - b) / Math.abs(b);
      expect(diff, name).toBeLessThan(0.005); // 0.5% — accommodates restatement deltas
    };

    tolerate(edgar.income.revenue, yahoo.income.revenue, "revenue");
    tolerate(edgar.income.netIncome, yahoo.income.netIncome, "netIncome");
    tolerate(edgar.income.epsDiluted, yahoo.income.epsDiluted, "epsDiluted");
    tolerate(edgar.income.ebitda, yahoo.income.ebitda, "ebitda");
    tolerate(edgar.balance.cash, yahoo.balance.cash, "cash");
    tolerate(edgar.balance.totalEquity, yahoo.balance.totalEquity, "equity");
    tolerate(
      edgar.cashFlow.operatingCashFlow,
      yahoo.cashFlow.operatingCashFlow,
      "operatingCashFlow",
    );
    tolerate(
      edgar.cashFlow.freeCashFlow,
      yahoo.cashFlow.freeCashFlow,
      "freeCashFlow",
    );
  }, 30_000);
});
