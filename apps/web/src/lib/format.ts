export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(2)}`;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

export function formatMarketCap(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value}`;
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

// ─── Human-readable labels ──────────────────────────────────────────────

export const FACTOR_LABELS: Record<string, string> = {
  evToEbitda: "EV / EBITDA",
  priceToFcf: "P / FCF",
  peRatio: "P / E",
  priceToBook: "P / B",
  debtToEbitda: "Net Debt / EBITDA",
  currentRatio: "Current Ratio",
  interestCoverage: "Interest Coverage",
  roic: "ROIC",
  dividendYield: "Dividend Yield",
  buybackYield: "Buyback Yield",
  dividendGrowth5Y: "5Y Dividend Growth",
  revenueGrowth7Y: "7Y Revenue Growth",
  epsGrowth7Y: "7Y EPS Growth",
};

export const CATEGORY_LABELS: Record<string, string> = {
  valuation: "Valuation",
  health: "Financial Health",
  quality: "Quality",
  shareholderReturn: "Shareholder Return",
  growth: "Growth",
};

export const TURNAROUND_REASON_LABELS: Record<string, string> = {
  longTermQuality: "Long-term quality",
  ttmTrough: "TTM trough",
  deepDrawdown: "Deep drawdown",
};

export function factorLabel(key: string): string {
  return FACTOR_LABELS[key] ?? key;
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export function turnaroundReasonLabel(key: string): string {
  return TURNAROUND_REASON_LABELS[key] ?? key;
}

const SELECTION_REASON_LABELS: Record<string, string> = {
  leap: "LEAPS",
  "leap-fallback": "Near-term",
  quarterly: "Quarterly",
  monthly: "Monthly",
};

export function selectionReasonLabel(reason: string): string {
  return SELECTION_REASON_LABELS[reason] ?? reason;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-01-15" → "Jan 15, 2027". */
export function formatExpiration(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mm, dd] = m;
  const monthIdx = parseInt(mm!, 10) - 1;
  return `${MONTH_NAMES[monthIdx]} ${parseInt(dd!, 10)}, ${y}`;
}

export function formatDte(days: number): string {
  if (days < 0) return "—";
  return `${days}d`;
}
