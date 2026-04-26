import type { Portfolio } from "@stockrank/core";
import { EMPTY_PORTFOLIO } from "@stockrank/core";

/**
 * Loads the user's portfolio file from `public/data/portfolio.json`.
 * v1 is read-only — the user maintains the file directly. The web
 * layer treats a missing or malformed file as an empty portfolio so
 * the Portfolio tab still renders gracefully on first load.
 */

const URL = `${import.meta.env.BASE_URL}data/portfolio.json`;

export async function loadPortfolio(
  fetchImpl: typeof fetch = fetch,
): Promise<Portfolio> {
  try {
    const response = await fetchImpl(URL);
    if (!response.ok) return EMPTY_PORTFOLIO;
    const parsed = (await response.json()) as Portfolio;
    if (!Array.isArray(parsed.positions)) return EMPTY_PORTFOLIO;
    return parsed;
  } catch {
    return EMPTY_PORTFOLIO;
  }
}
