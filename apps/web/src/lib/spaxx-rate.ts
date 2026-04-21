import { useCallback, useState } from "react";
import { SPAXX_RATE } from "@stockrank/ranking";

/**
 * SPAXX (Fidelity government money market) annualized yield, persisted
 * in localStorage so the user sets it once per rate-regime. Stored as a
 * decimal fraction (e.g., 0.033 for 3.3%). Reads on mount, writes on
 * every change.
 *
 * Falls back to the package default constant when localStorage isn't
 * available (SSR, private browsing, etc.).
 */

const STORAGE_KEY = "stockrank.spaxxRate";

export const DEFAULT_SPAXX_RATE = SPAXX_RATE;

function loadInitial(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SPAXX_RATE;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_SPAXX_RATE;
    return n;
  } catch {
    return DEFAULT_SPAXX_RATE;
  }
}

export function useSpaxxRate(): [number, (rate: number) => void] {
  const [rate, setRateState] = useState(loadInitial);
  const setRate = useCallback((next: number) => {
    if (!Number.isFinite(next) || next < 0 || next > 1) return;
    setRateState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* persistence is best-effort */
    }
  }, []);
  return [rate, setRate];
}
