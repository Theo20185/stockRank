export { percentRank, percentRankAll } from "./percentile.js";
export { rank } from "./ranking.js";
export { DEFAULT_WEIGHTS, normalizeWeights } from "./weights.js";
export { FACTORS } from "./factors.js";
export type { FactorDef, FactorDirection } from "./factors.js";
export { fairValueFor, buildFairValueCohort } from "./fair-value/index.js";
export { bucketRows, classifyRow } from "./buckets.js";
export type { BucketKey, BucketedRows } from "./buckets.js";
export type {
  FairValue,
  FairValueAnchorKey,
  FairValueAnchors,
  FairValueConfidence,
  FairValuePeerSet,
} from "./fair-value/types.js";
export type {
  CategoryKey,
  CategoryScores,
  CategoryWeights,
  FactorContribution,
  FactorKey,
  RankInput,
  RankedRow,
  RankedSnapshot,
  TurnaroundReason,
  TurnaroundRow,
} from "./types.js";
export { buildExpirationView, buildOptionsView } from "./options/index.js";
export type {
  CashSecuredPut,
  CashSecuredPutAnchor,
  CashSecuredPutLabel,
  CoveredCall,
  CoveredCallAnchor,
  CoveredCallLabel,
  ExpirationView,
  OptionsView,
} from "./options/types.js";
export { computeCallReturns, computePutReturns } from "./options/returns.js";
export { snapStrike } from "./options/strike-snap.js";
export { computeTradeComparison, SPAXX_RATE } from "./trade-comparison/index.js";
export {
  bootstrapMeanCi,
  groupBy,
  mean,
  mulberry32,
  quantileSorted,
  quartileBin,
  wilsonInterval,
} from "./stats.js";
export type { Interval } from "./stats.js";
export type {
  ProjectedEndCase,
  TradeComparison,
  TradeKey,
  TradeLeg,
} from "./trade-comparison/types.js";
export {
  classifyNonRecovery,
  didRecover,
  fvDirection,
  type DidRecoverResult,
  type FvDirectionResult,
  type NonRecoveryClass,
  type PriceBar,
} from "./backtest/recovery.js";
export {
  classifyFundamentalsDirection,
  type FundamentalsDirection,
} from "./fundamentals.js";
