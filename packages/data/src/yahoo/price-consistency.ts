/**
 * Price-consistency check: detects Yahoo data corruption where a
 * phantom-split factor scales `quote.price` and per-share fields but
 * not aggregates like `marketCap`.
 *
 * Canonical failure: BKNG 2026-04 — quote.price $192 vs marketCap
 * $152B × 32.6M shares → implied $4664 per share (23× off). We
 * exclude from the snapshot rather than poison downstream FV math.
 *
 * Implementation subtlety: BOTH Yahoo's `sharesOutstanding` and
 * EDGAR's `WeightedAverageNumberOfDilutedSharesOutstanding` have
 * symbol-specific corner cases that make either alone unreliable:
 *
 *   - Dual-class tickers (GOOGL/GOOG, BRK.B, BF.B, FOXA/FOX,
 *     NWSA/NWS): Yahoo's `sharesOutstanding` is per-class while
 *     `marketCap` is company-wide → Yahoo-implied price is wildly
 *     inflated (~2×). EDGAR's total shares matches total marketCap.
 *   - Corporate actions mid-fiscal-year (AMCR Berry merger, DELL
 *     spin, CVNA dilution): EDGAR's most-recent-annual shares is
 *     pre-action while Yahoo is post-action → EDGAR-implied price
 *     is stale. Yahoo post-action matches.
 *
 * The fix: compute implied price from BOTH sources and only exclude
 * when BOTH disagree with quote. This catches genuine data
 * corruption (both sources agree marketCap and shares but price is
 * off) while tolerating structural discrepancies.
 */

/** Relative deviation threshold: >50% off quote → "disagrees." */
const DEVIATION_THRESHOLD = 0.5;

export type PriceConsistencyInput = {
  /** Yahoo's summaryDetail.marketCap — company-wide total. */
  marketCap: number;
  /** Yahoo's defaultKeyStatistics.sharesOutstanding — may be per-class. */
  yahooShares: number;
  /** EDGAR's most-recent annual WeightedAverage…DilutedShares (rescaled) —
   * total diluted count, but may be stale after recent corporate actions. */
  edgarShares: number | null;
  /** Yahoo's price.regularMarketPrice. */
  quotePrice: number;
};

export type PriceConsistencyResult =
  | { ok: true }
  | { ok: false; reason: string };

function devOver(implied: number, quote: number): boolean {
  return Math.abs(implied - quote) / quote > DEVIATION_THRESHOLD;
}

/**
 * Pure function. Returns `{ ok: true }` when either source's
 * implied price matches quote within tolerance, or when no sources
 * are usable. Returns `{ ok: false, reason }` only when both
 * sources produce wildly off implied prices.
 */
export function checkPriceConsistency(
  input: PriceConsistencyInput,
): PriceConsistencyResult {
  const { marketCap, yahooShares, edgarShares, quotePrice } = input;
  if (marketCap <= 0 || quotePrice <= 0) return { ok: true };

  const yahooImplied = yahooShares > 0 ? marketCap / yahooShares : null;
  const edgarImplied =
    edgarShares !== null && edgarShares > 0 ? marketCap / edgarShares : null;

  if (yahooImplied === null && edgarImplied === null) return { ok: true };

  const yahooFails = yahooImplied !== null && devOver(yahooImplied, quotePrice);
  const edgarFails = edgarImplied !== null && devOver(edgarImplied, quotePrice);

  // Only one source available → use it.
  if (yahooImplied === null) {
    return edgarFails
      ? {
          ok: false,
          reason:
            `quote.price $${quotePrice.toFixed(2)} disagrees with marketCap/edgarShares ` +
            `$${edgarImplied!.toFixed(2)} (${Math.round(
              (Math.abs(edgarImplied! - quotePrice) / quotePrice) * 100,
            )}% off); excluding`,
        }
      : { ok: true };
  }
  if (edgarImplied === null) {
    return yahooFails
      ? {
          ok: false,
          reason:
            `quote.price $${quotePrice.toFixed(2)} disagrees with marketCap/yahooShares ` +
            `$${yahooImplied.toFixed(2)} (${Math.round(
              (Math.abs(yahooImplied - quotePrice) / quotePrice) * 100,
            )}% off); excluding`,
        }
      : { ok: true };
  }

  // Both available: exclude only if BOTH disagree. Dual-class names
  // and mid-year corporate actions trip one source but not the other.
  if (yahooFails && edgarFails) {
    const closer = Math.abs(yahooImplied - quotePrice) < Math.abs(edgarImplied - quotePrice)
      ? yahooImplied
      : edgarImplied;
    const pct = Math.round((Math.abs(closer - quotePrice) / quotePrice) * 100);
    return {
      ok: false,
      reason:
        `quote.price $${quotePrice.toFixed(2)} disagrees with both marketCap/yahooShares ` +
        `$${yahooImplied.toFixed(2)} and marketCap/edgarShares ` +
        `$${edgarImplied.toFixed(2)} (closer: ${pct}% off); excluding`,
    };
  }
  return { ok: true };
}
