import { describe, it, expect } from "vitest";
import {
  chooseEbitdaForAnchor,
  chooseEpsForPeerAnchor,
  deriveTtm,
} from "./anchors.js";
import {
  makeCompany,
  makePeriod,
  makeQuarter,
  makeTtm,
} from "../test-helpers.js";

function company(opts: {
  ttmEps: number;
  priorEps: number[];
  forwardEps: number | null;
}) {
  // annual[0] = TTM-equivalent (most recent reported); annual[1..] = priors.
  const annual = [
    makePeriod({
      fiscalYear: "2025",
      income: { ...makePeriod().income, epsDiluted: opts.ttmEps },
    }),
    ...opts.priorEps.map((eps, i) =>
      makePeriod({
        fiscalYear: String(2024 - i),
        income: { ...makePeriod().income, epsDiluted: eps },
      }),
    ),
  ];
  // Set ttm.peRatio so deriveTtm derives the same TTM EPS the test
  // intends (price / peRatio). makeCompany defaults price to 100.
  return makeCompany({
    symbol: "TEST",
    annual,
    ttm: makeTtm({
      peRatio: opts.ttmEps > 0 ? 100 / opts.ttmEps : 18,
      forwardEps: opts.forwardEps,
    }),
  });
}

describe("chooseEpsForPeerAnchor — four-quadrant outlier detection", () => {
  it("uses TTM when prior years are similar (no spike)", () => {
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 5.0, priorEps: [4.8, 5.1, 4.9], forwardEps: 5.2 }),
    );
    expect(result.eps).toBe(5.0);
    expect(result.treatment).toBe("ttm");
  });

  it("uses TTM when spike is corroborated by forward EPS (real step-change)", () => {
    // TTM 12, prior avg 4 → 3× spike. Forward 11.5 confirms it. Trust TTM.
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 12.0, priorEps: [4.0, 4.0, 4.0], forwardEps: 11.5 }),
    );
    expect(result.eps).toBe(12.0);
    expect(result.treatment).toBe("ttm");
  });

  it("falls back to prior-3y mean when TTM spikes but forward EPS doesn't (one-time gain)", () => {
    // The EIX shape: TTM 11.55, prior avg ~4.5, forward only 6.12 (~53% of TTM).
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 11.55, priorEps: [3.31, 3.11, 1.60], forwardEps: 6.12 }),
    );
    expect(result.treatment).toBe("normalized");
    expect(result.eps).toBeCloseTo((3.31 + 3.11 + 1.60) / 3, 2);
  });

  it("falls back to prior-3y mean when TTM spikes and no forward EPS is available", () => {
    // FMP-provided rows have forwardEps null; rule still fires on TTM-vs-prior alone.
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 12.0, priorEps: [4.0, 4.0, 4.0], forwardEps: null }),
    );
    expect(result.treatment).toBe("normalized");
    expect(result.eps).toBe(4);
  });

  it("uses TTM when there isn't enough prior history to detect an outlier", () => {
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 12.0, priorEps: [4.0], forwardEps: null }),
    );
    expect(result.eps).toBe(12.0);
    expect(result.treatment).toBe("ttm");
  });

  it("returns null when the most recent EPS is missing", () => {
    const subject = makeCompany({
      symbol: "X",
      // Null peRatio so deriveTtm can't derive TTM EPS from ratios;
      // forces the annual[0] fallback (also null in this fixture).
      ttm: makeTtm({ peRatio: null }),
      annual: [
        makePeriod({
          fiscalYear: "2025",
          income: { ...makePeriod().income, epsDiluted: null },
        }),
      ],
    });
    const result = chooseEpsForPeerAnchor(subject);
    expect(result.eps).toBeNull();
    expect(result.treatment).toBe("ttm");
  });

  it("treats a marginal spike (ratio between 1× and 1.5×) as TTM", () => {
    // 5.6 / 4.0 = 1.4 — below the 1.5 threshold.
    const result = chooseEpsForPeerAnchor(
      company({ ttmEps: 5.6, priorEps: [4.0, 4.0, 4.0], forwardEps: null }),
    );
    expect(result.treatment).toBe("ttm");
  });
});

describe("chooseEpsForPeerAnchor — baseline collapse (deep cyclicals, spec §3.4)", () => {
  // NEM 2026-08, verbatim: annual EPS newest-first
  // [6.39, 2.92, -2.97, -0.54, 1.46, 3.51, 3.81], TTM 8.58 (gold-price
  // peak), forward 10.58 (extrapolates the same gold price). The
  // spike window annual[1:4] = [2.92, -2.97, -0.54] collapses to
  // [2.92] after the >0 filter. Cycle average = mean of the 5 most
  // recent profitable of 7 = (6.39+2.92+1.46+3.51+3.81)/5 = 3.618.
  const NEM_ANNUAL_EPS = [6.39, 2.92, -2.97, -0.54, 1.46, 3.51, 3.81];
  const NEM_CYCLE_AVG = (6.39 + 2.92 + 1.46 + 3.51 + 3.81) / 5;

  function cyclical(opts: { ttmEps: number; annualEps: number[]; forwardEps: number | null }) {
    return makeCompany({
      symbol: "CYC",
      annual: opts.annualEps.map((eps, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
      ttm: makeTtm({
        peRatio: opts.ttmEps > 0 ? 100 / opts.ttmEps : null,
        forwardEps: opts.forwardEps,
      }),
    });
  }

  it("NEM regression: loss-emptied window + elevated TTM → cycle average, forward NOT consulted", () => {
    const result = chooseEpsForPeerAnchor(
      cyclical({ ttmEps: 8.58, annualEps: NEM_ANNUAL_EPS, forwardEps: 10.58 }),
    );
    // forwardEps 10.58 ≥ 0.7 × 8.58 would have corroborated under the
    // two-signal rule — proving this path never consults it.
    expect(result.treatment).toBe("normalized");
    expect(result.eps).toBeCloseTo(NEM_CYCLE_AVG, 3);
  });

  it("loss-emptied window but TTM not elevated vs cycle average → keeps TTM", () => {
    // Recovering cyclical: TTM 2.0 < 1.5 × cycle average (~2.74 here).
    const result = chooseEpsForPeerAnchor(
      cyclical({ ttmEps: 2.0, annualEps: [2.0, 2.92, -2.97, -0.54, 1.46, 3.51, 3.81], forwardEps: null }),
    );
    expect(result.treatment).toBe("ttm");
    expect(result.eps).toBe(2.0);
  });

  it("short history (single prior year, even a loss) still accepts TTM — no evidence either way", () => {
    const result = chooseEpsForPeerAnchor(
      cyclical({ ttmEps: 12.0, annualEps: [12.0, -1.0], forwardEps: null }),
    );
    expect(result.treatment).toBe("ttm");
    expect(result.eps).toBe(12.0);
  });

  it("non-positive cycle average: passes it through so P/E anchors go null downstream", () => {
    // Losses dominate the whole window; a positive TTM has no
    // defensible earnings basis. all-years mean = (3-5-6-4-3-2-1)/7 < 0.
    const result = chooseEpsForPeerAnchor(
      cyclical({ ttmEps: 3.0, annualEps: [3.0, -5, -6, -4, -3, -2, -1], forwardEps: null }),
    );
    expect(result.treatment).toBe("normalized");
    expect(result.eps).not.toBeNull();
    expect(result.eps!).toBeLessThan(0);
  });

  it("negative TTM never triggers the cyclical fallback (nothing to normalize)", () => {
    const subject = makeCompany({
      symbol: "CYC",
      annual: [-1.5, 1.0, -2.97, -0.54].map((eps, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, epsDiluted: eps },
        }),
      ),
      // peRatio null + annual[0] negative → deriveTtm eps = -1.5.
      ttm: makeTtm({ peRatio: null, forwardEps: null }),
    });
    const result = chooseEpsForPeerAnchor(subject);
    expect(result.treatment).toBe("ttm");
    expect(result.eps).toBe(-1.5);
  });
});

describe("chooseEbitdaForAnchor — baseline collapse mirror", () => {
  // TTM EBITDA comes through deriveTtm's ratio path:
  // enterpriseValue / evToEbitda (no quarterly data in fixtures).
  function ebitdaCyclical(opts: { ttmEbitda: number; annualEbitda: number[] }) {
    return makeCompany({
      symbol: "CYC",
      annual: opts.annualEbitda.map((ebitda, i) =>
        makePeriod({
          fiscalYear: String(2025 - i),
          income: { ...makePeriod().income, ebitda },
        }),
      ),
      ttm: makeTtm({
        enterpriseValue: opts.ttmEbitda * 6,
        evToEbitda: 6,
      }),
    });
  }

  const B = 1_000_000_000;

  it("loss-emptied window + elevated TTM → cycle-average EBITDA", () => {
    // Window annual[1:4] = [8, -3, -1] → one positive. Cycle average =
    // mean of 5 most recent profitable of 7 = (12+8+6+7+9)/5 = 8.4B.
    // TTM 15B > 1.5 × 8.4B → normalized.
    const result = chooseEbitdaForAnchor(
      ebitdaCyclical({
        ttmEbitda: 15 * B,
        annualEbitda: [12 * B, 8 * B, -3 * B, -1 * B, 6 * B, 7 * B, 9 * B],
      }),
    );
    expect(result.treatment).toBe("normalized");
    expect(result.ebitda).toBeCloseTo(8.4 * B, -3);
  });

  it("loss-emptied window but TTM not elevated → keeps TTM", () => {
    const result = chooseEbitdaForAnchor(
      ebitdaCyclical({
        ttmEbitda: 10 * B,
        annualEbitda: [12 * B, 8 * B, -3 * B, -1 * B, 6 * B, 7 * B, 9 * B],
      }),
    );
    expect(result.treatment).toBe("ttm");
    expect(result.ebitda).toBeCloseTo(10 * B, -3);
  });

  it("short history still accepts TTM", () => {
    const result = chooseEbitdaForAnchor(
      ebitdaCyclical({ ttmEbitda: 15 * B, annualEbitda: [12 * B, -3 * B] }),
    );
    expect(result.treatment).toBe("ttm");
    expect(result.ebitda).toBeCloseTo(15 * B, -3);
  });
});

// ---- deriveTtm: contiguity gate + per-field fall-through ----
//
// As-filed XBRL has no 10-Q for fiscal Q4, so for many names the four
// newest quarters span ~15 months. Summing across the gap is not a
// TTM (2026-10-29: DECK's FCF summed to −$92M vs ~+$950M true), and
// one populated quarterly field must not lock the other fields out of
// the ratio back-out tier. See fair-value.md §4.1.
describe("deriveTtm", () => {
  function quarter(
    end: string,
    v: { eps?: number | null; ebitda?: number | null; fcf?: number | null; ni?: number | null },
  ) {
    const base = makeQuarter();
    return makeQuarter({
      periodEndDate: end,
      income: {
        ...base.income,
        epsDiluted: v.eps === undefined ? null : v.eps,
        ebitda: v.ebitda === undefined ? null : v.ebitda,
        netIncome: v.ni === undefined ? null : v.ni,
      },
      cashFlow: {
        ...base.cashFlow,
        freeCashFlow: v.fcf === undefined ? null : v.fcf,
      },
    });
  }

  it("disqualifies the whole quarterly tier when the window is gapped (DECK shape)", () => {
    // Four newest quarters miss fiscal Q4 (Mar'26): Jun'26 → Dec'25 is
    // a 181-day gap. The naive sums (EPS 7.02, FCF −$92M) must NOT be
    // used; every field falls through to ratio back-out or annual[0].
    const subject = makeCompany({
      symbol: "DECKISH",
      quarterly: [
        quarter("2026-06-30", { eps: 0.94, fcf: 32_682_000 }),
        quarter("2025-12-31", { eps: 3.33, fcf: 1_020_282_000 }),
        quarter("2025-09-30", { eps: 1.82, fcf: -1_157_154_000 }),
        quarter("2025-06-30", { eps: 0.93, fcf: 12_206_000 }),
      ],
      annual: [makePeriod()], // eps 8, ebitda 12e9, fcf 8e9, ni 8e9
      ttm: makeTtm({
        peRatio: 12.5, // price 100 → EPS back-out 8
        evToEbitda: 8,
        enterpriseValue: 80_000_000_000, // → EBITDA back-out 10e9
        priceToFcf: null, // FCF back-out unavailable → annual[0]
      }),
    });
    const ttm = deriveTtm(subject);
    expect(ttm.eps).toBe(8); // ratio tier, not the gapped 7.02
    expect(ttm.ebitda).toBe(10_000_000_000); // ratio tier, not annual 12e9
    expect(ttm.freeCashFlow).toBe(8_000_000_000); // annual, not −92M
    expect(ttm.netIncome).toBe(8_000_000_000); // annual
  });

  it("falls through per field: quarterly EPS must not shadow the EBITDA ratio back-out", () => {
    // Contiguous window, EPS sums fine, quarterly EBITDA all null.
    // Pre-fix the early return committed EBITDA to null even though
    // EV / evToEbitda was available (155/499 names on 2026-10-29).
    const subject = makeCompany({
      symbol: "SHADOW",
      quarterly: [
        quarter("2026-06-30", { eps: 1.5, fcf: 1_000_000_000 }),
        quarter("2026-03-31", { eps: 1.5, fcf: 1_000_000_000 }),
        quarter("2025-12-31", { eps: 1.5, fcf: 1_000_000_000 }),
        quarter("2025-09-30", { eps: 1.5, fcf: 1_000_000_000 }),
      ],
      annual: [makePeriod()],
      ttm: makeTtm({
        peRatio: 12.5,
        evToEbitda: 8,
        enterpriseValue: 80_000_000_000,
        priceToFcf: 20,
      }),
    });
    const ttm = deriveTtm(subject);
    expect(ttm.eps).toBe(6); // quarterly sum beats the ratio's 8
    expect(ttm.ebitda).toBe(10_000_000_000); // EV / evToEbitda back-out
    expect(ttm.freeCashFlow).toBe(4_000_000_000); // quarterly sum
  });

  it("falls through per field when one quarter's FCF is null in a contiguous window", () => {
    const subject = makeCompany({
      symbol: "PARTIAL",
      quarterly: [
        quarter("2026-06-30", { eps: 1.5, ebitda: 2_500_000_000, fcf: null }),
        quarter("2026-03-31", { eps: 1.5, ebitda: 2_500_000_000, fcf: 1_000_000_000 }),
        quarter("2025-12-31", { eps: 1.5, ebitda: 2_500_000_000, fcf: 1_000_000_000 }),
        quarter("2025-09-30", { eps: 1.5, ebitda: 2_500_000_000, fcf: 1_000_000_000 }),
      ],
      annual: [makePeriod()],
      // price 100 / priceToFcf 20 × annual[0] shares 1e9 = 5e9
      ttm: makeTtm({ peRatio: null, evToEbitda: null, priceToFcf: 20 }),
    });
    const ttm = deriveTtm(subject);
    expect(ttm.eps).toBe(6);
    expect(ttm.ebitda).toBe(10_000_000_000); // quarterly sum
    expect(ttm.freeCashFlow).toBe(5_000_000_000); // ratio back-out
  });

  it("sums a contiguous window as before, including a 98-day 53-week quarter", () => {
    const subject = makeCompany({
      symbol: "CONTIG",
      quarterly: [
        quarter("2026-06-30", { eps: 1.25, ebitda: 2_500_000_000, fcf: 1_500_000_000, ni: 2_000_000_000 }),
        quarter("2026-03-24", { eps: 1.25, ebitda: 2_500_000_000, fcf: 1_500_000_000, ni: 2_000_000_000 }),
        quarter("2025-12-23", { eps: 1.25, ebitda: 2_500_000_000, fcf: 1_500_000_000, ni: 2_000_000_000 }),
        quarter("2025-09-23", { eps: 1.25, ebitda: 2_500_000_000, fcf: 1_500_000_000, ni: 2_000_000_000 }),
      ],
      annual: [makePeriod()],
      ttm: makeTtm({
        peRatio: null,
        evToEbitda: null,
        priceToFcf: null,
        enterpriseValue: null,
      }),
    });
    const ttm = deriveTtm(subject);
    expect(ttm.eps).toBe(5);
    expect(ttm.ebitda).toBe(10_000_000_000);
    expect(ttm.freeCashFlow).toBe(6_000_000_000);
    expect(ttm.netIncome).toBe(8_000_000_000);
  });
});
