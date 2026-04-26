export { percentRank, percentRankAll } from "./percentile.js";
export { rank } from "./ranking.js";
export { DEFAULT_WEIGHTS, normalizeWeights } from "./weights.js";
export { FACTORS } from "./factors.js";
export type { FactorDef, FactorDirection } from "./factors.js";
export { fairValueFor, buildFairValueCohort } from "./fair-value/index.js";
export { bucketRows, classifyRow } from "./buckets.js";
export type { BucketKey, BucketedRows } from "./buckets.js";
export {
  evaluatePortfolio,
  SELL_SIGNAL_LABELS,
  type PortfolioEvaluation,
  type PositionEvaluation,
  type SellSignal,
} from "./portfolio/evaluator.js";
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
export { estimateCallPremiumPct } from "./options/premium-estimate.js";
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

// Super-group mapping (super-groups.md)
export {
  ALL_SUPER_GROUPS,
  INDUSTRY_TO_SUPER_GROUP,
  SUPER_GROUP_LABELS,
  superGroupOf,
  type SuperGroupKey,
} from "./super-groups.js";

// IC analysis pipeline (backtest.md §3.9–3.10)
export {
  buildIcObservations,
  type IcObservationsInput,
} from "./backtest/ic/observations.js";
export {
  buildRollingWindows,
  computeIcCells,
  computeIcForCell,
  dedupeYearly,
  type RollingWindow,
} from "./backtest/ic/pipeline.js";
export {
  applyGatesToAll,
  applyThreeGates,
  ECONOMIC_FLOOR_IC,
} from "./backtest/ic/three-gate.js";
export {
  falseDiscoveryCheck,
  runCalibration,
  type CalibrationOptions,
  type FalseDiscoveryCheck,
} from "./backtest/ic/calibration.js";
export {
  buildIcReport,
  renderCalibrationReport,
  renderIcReport,
} from "./backtest/ic/report.js";
export type {
  IcCalibration,
  IcCell,
  IcCellWithVerdict,
  IcNullThreshold,
  IcObservation,
  IcReport,
  ThreeGateVerdict,
} from "./backtest/ic/types.js";

// Weight validation (backtest.md §3.11)
export {
  ADOPTION_EXCESS_FLOOR_PER_YEAR,
  runWeightValidation,
  type WeightValidationOptions,
} from "./backtest/weight-validation/engine.js";
export { renderWeightValidationReport } from "./backtest/weight-validation/report.js";
export type {
  AdoptionVerdict,
  CandidateResult,
  CandidateWeights,
  HorizonPerformance,
  PreDecileFilter,
  SubFactorWeights,
  WeightValidationReport,
} from "./backtest/weight-validation/types.js";
export {
  runPerSuperGroupValidation,
  type PerSuperGroupPreset,
  type PerSuperGroupResult,
  type PerSuperGroupValidationReport,
} from "./backtest/weight-validation/per-super-group.js";
export { renderPerSuperGroupReport } from "./backtest/weight-validation/per-super-group-report.js";

// Legacy-rule audit (backtest.md §3.5: H10/H11/H12)
export {
  runLegacyAudit,
  type LegacyAuditInput,
} from "./backtest/legacy-audit/engine.js";
export { renderLegacyAuditReport } from "./backtest/legacy-audit/report.js";
export type {
  FloorAuditRow,
  FloorClassification,
  FloorRuleKey,
  LegacyAuditReport,
  TurnaroundAuditRow,
  TurnaroundClassification,
} from "./backtest/legacy-audit/types.js";

// User-picks validation (backtest-roadmap §Phase 1 C)
export {
  evaluateUserPicks,
  type UserPick,
  type UserPickRanking,
  type UserPicksInput,
  type UserPicksReport,
} from "./backtest/user-picks/engine.js";
export { renderUserPicksReport } from "./backtest/user-picks/report.js";

// FV-trend audit / H10 validation (Phase 4C)
export {
  runFvTrendAudit,
  type FvTrendAuditInput,
  type FvTrendAuditReport,
  type FvTrendStratumRow,
  type FvTrendClass,
} from "./backtest/fv-trend-audit/engine.js";
export { renderFvTrendAuditReport } from "./backtest/fv-trend-audit/report.js";
