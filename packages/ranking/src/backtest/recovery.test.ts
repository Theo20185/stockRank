import { describe, expect, it } from "vitest";
import {
  classifyNonRecovery,
  didRecover,
  fvDirection,
  type PriceBar,
} from "./recovery.js";

function bar(date: string, high: number, close = high): PriceBar {
  return { date, high, low: high * 0.95, close };
}

describe("didRecover", () => {
  it("returns recovered=true when any forward bar's high reaches the target", () => {
    const bars: PriceBar[] = [
      bar("2025-01-31", 100),
      bar("2025-02-28", 105),
      bar("2025-03-31", 130),
      bar("2025-04-30", 120),
    ];
    const r = didRecover({ entryPrice: 90, targetPrice: 125, forwardBars: bars });
    expect(r.recovered).toBe(true);
    expect(r.recoveryDate).toBe("2025-03-31");
    expect(r.peakHigh).toBe(130);
  });

  it("returns recovered=false when forward bars never reach the target", () => {
    const bars: PriceBar[] = [
      bar("2025-01-31", 100),
      bar("2025-02-28", 110),
      bar("2025-03-31", 115),
    ];
    const r = didRecover({ entryPrice: 90, targetPrice: 125, forwardBars: bars });
    expect(r.recovered).toBe(false);
    expect(r.recoveryDate).toBeNull();
    expect(r.peakHigh).toBe(115);
  });

  it("uses bar.high (intraday) not bar.close — captures wicks", () => {
    const bars: PriceBar[] = [
      { date: "2025-03-31", high: 130, low: 100, close: 105 }, // intraday spike to 130
    ];
    const r = didRecover({ entryPrice: 90, targetPrice: 125, forwardBars: bars });
    expect(r.recovered).toBe(true);
  });

  it("returns recovered=false when forward bars are empty", () => {
    const r = didRecover({ entryPrice: 90, targetPrice: 125, forwardBars: [] });
    expect(r.recovered).toBe(false);
    expect(r.peakHigh).toBe(0);
  });

  it("recoveryDate is the earliest date that hit the target", () => {
    const bars: PriceBar[] = [
      bar("2025-03-31", 130),
      bar("2025-04-30", 140),
      bar("2025-05-31", 150),
    ];
    const r = didRecover({ entryPrice: 90, targetPrice: 125, forwardBars: bars });
    expect(r.recoveryDate).toBe("2025-03-31");
    expect(r.peakHigh).toBe(150); // peak across the entire window
  });
});

describe("classifyNonRecovery", () => {
  it("'lost' when final price is more than tolerance below entry", () => {
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 90 })).toBe("lost");
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 50 })).toBe("lost");
  });

  it("'stable' when final price is within ±5% of entry by default", () => {
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 95 })).toBe("stable");
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 100 })).toBe("stable");
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 105 })).toBe("stable");
  });

  it("'partial-gain' when final price is above stable band but didn't hit recovery target", () => {
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 115 })).toBe("partial-gain");
    expect(classifyNonRecovery({ entryPrice: 100, finalPrice: 124 })).toBe("partial-gain");
  });

  it("respects custom stableTolerancePct", () => {
    expect(
      classifyNonRecovery({
        entryPrice: 100,
        finalPrice: 92,
        stableTolerancePct: 10,
      }),
    ).toBe("stable");
    expect(
      classifyNonRecovery({
        entryPrice: 100,
        finalPrice: 88,
        stableTolerancePct: 10,
      }),
    ).toBe("lost");
  });
});

describe("fvDirection", () => {
  it("returns 'declining' when fvAtExit fell more than threshold below entry", () => {
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 90 })).toBe("declining");
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 70 })).toBe("declining");
  });

  it("returns 'flat' within ±5% by default", () => {
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 96 })).toBe("flat");
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 104 })).toBe("flat");
  });

  it("returns 'improving' when fvAtExit rose more than threshold", () => {
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 110 })).toBe("improving");
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 200 })).toBe("improving");
  });

  it("returns 'declining' when fvAtExit is null/zero (treated as collapse)", () => {
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: null })).toBe("declining");
    expect(fvDirection({ fvAtEntry: 100, fvAtExit: 0 })).toBe("declining");
  });

  it("returns 'flat' when fvAtEntry is null/zero (no signal)", () => {
    expect(fvDirection({ fvAtEntry: null, fvAtExit: 100 })).toBe("flat");
  });

  it("respects custom thresholdPct", () => {
    expect(
      fvDirection({ fvAtEntry: 100, fvAtExit: 92, thresholdPct: 10 }),
    ).toBe("flat");
    expect(
      fvDirection({ fvAtEntry: 100, fvAtExit: 88, thresholdPct: 10 }),
    ).toBe("declining");
  });
});
