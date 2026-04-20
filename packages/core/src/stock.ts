export type Industry = string;

export type CapBucket = "mega" | "large" | "midSmall";

export type Stock = {
  symbol: string;
  name: string;
  sector: string;
  industry: Industry;
  marketCap: number;
};

const MEGA_THRESHOLD = 200_000_000_000;
const LARGE_THRESHOLD = 20_000_000_000;

export function capBucketFor(marketCap: number): CapBucket {
  if (marketCap >= MEGA_THRESHOLD) return "mega";
  if (marketCap >= LARGE_THRESHOLD) return "large";
  return "midSmall";
}
