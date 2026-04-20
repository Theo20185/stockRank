/**
 * Snap an anchor price to the nearest listed strike per
 * docs/specs/options.md §3.3.
 *
 * - For calls, prefer the listed strike at or above the anchor.
 *   That keeps the call slightly more conservative — higher strike
 *   means more upside captured before assignment.
 * - For puts, prefer the listed strike at or below the anchor.
 *   That keeps the put slightly more conservative — lower strike
 *   means lower assignment cost.
 *
 * When the chain doesn't bracket the anchor on the preferred side,
 * fall back to the nearest available strike. Flag `snapWarning: true`
 * whenever the snap distance exceeds 5% of the anchor.
 */

const SNAP_WARNING_THRESHOLD = 0.05;

export type SnapResult = { strike: number; snapWarning: boolean };

export function snapStrike(
  listedStrikes: number[],
  anchor: number,
  side: "call" | "put",
): SnapResult | null {
  if (listedStrikes.length === 0) return null;
  if (anchor <= 0) return null;

  const sorted = [...listedStrikes].sort((a, b) => a - b);

  let chosen: number;
  if (side === "call") {
    const atOrAbove = sorted.find((s) => s >= anchor);
    chosen = atOrAbove ?? sorted[sorted.length - 1]!;
  } else {
    // walk descending — first strike <= anchor wins
    const atOrBelow = [...sorted].reverse().find((s) => s <= anchor);
    chosen = atOrBelow ?? sorted[0]!;
  }

  const offByPct = Math.abs(chosen - anchor) / anchor;
  return { strike: chosen, snapWarning: offByPct > SNAP_WARNING_THRESHOLD };
}
