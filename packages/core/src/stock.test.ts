import { describe, it, expect } from "vitest";
import { capBucketFor } from "./stock.js";

describe("capBucketFor", () => {
  it("returns 'mega' for market caps at or above $200B", () => {
    expect(capBucketFor(200_000_000_000)).toBe("mega");
    expect(capBucketFor(3_500_000_000_000)).toBe("mega");
  });

  it("returns 'large' for market caps from $20B up to (but not including) $200B", () => {
    expect(capBucketFor(20_000_000_000)).toBe("large");
    expect(capBucketFor(199_999_999_999)).toBe("large");
  });

  it("returns 'midSmall' for market caps below $20B", () => {
    expect(capBucketFor(19_999_999_999)).toBe("midSmall");
    expect(capBucketFor(1_000_000_000)).toBe("midSmall");
    expect(capBucketFor(0)).toBe("midSmall");
  });
});
