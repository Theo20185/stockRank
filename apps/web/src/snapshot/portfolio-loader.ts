import type { Portfolio } from "@stockrank/core";
import { EMPTY_PORTFOLIO } from "@stockrank/core";

/**
 * Portfolio storage. Lives in browser localStorage so holdings stay
 * device-local — the StockRank web app is publicly hosted and we
 * don't want positions visible to anyone reading the deployed bundle.
 *
 * Schema is the same as the in-memory Portfolio: { updatedAt, positions }.
 * v1 is read-only in-app; the user populates the key via DevTools or a
 * future settings UI.
 */

export const PORTFOLIO_STORAGE_KEY = "stockrank.portfolio";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadPortfolio(storage: StorageLike | null = defaultStorage()): Portfolio {
  if (!storage) return EMPTY_PORTFOLIO;
  try {
    const raw = storage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return EMPTY_PORTFOLIO;
    const parsed = JSON.parse(raw) as Portfolio;
    if (!Array.isArray(parsed.positions)) return EMPTY_PORTFOLIO;
    return parsed;
  } catch {
    return EMPTY_PORTFOLIO;
  }
}

export function savePortfolio(
  portfolio: Portfolio,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolio));
  } catch {
    // localStorage may be disabled (private mode, quota, etc.); fail silent.
  }
}
