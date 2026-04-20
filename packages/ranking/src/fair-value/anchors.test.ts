import { describe, it, expect } from "vitest";
import { chooseEpsForPeerAnchor } from "./anchors.js";
import { makeCompany, makePeriod, makeTtm } from "../test-helpers.js";

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
  return makeCompany({
    symbol: "TEST",
    annual,
    ttm: makeTtm({ forwardEps: opts.forwardEps }),
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
