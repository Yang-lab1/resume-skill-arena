export {
  DEFAULT_PROVIDER_COUNT,
  MAX_PROVIDER_COUNT,
  ProviderSelectionError,
  selectProviders
} from "./config/provider-selection.js";
export { validateChangeSetSchema } from "./contracts/validate-schema.js";
export { validateChangeSetFile } from "./cli/validate-changeset.js";
export { runSemanticGates } from "./gates/run-gates.js";
export {
  computeBaselineId,
  freezeBaseline,
  toChangeSetBaselineReference
} from "./baseline/freeze.js";
export { verifyFrozenBaseline } from "./baseline/verify.js";
export { parseResumeDocx } from "./baseline/docx-parser.js";
export { parseJobText } from "./baseline/job-parser.js";
export { createFactSnapshot } from "./baseline/fact-snapshot.js";
export { validateFrozenBaselineSchema } from "./contracts/validate-baseline-schema.js";
export { ProviderRegistry } from "./providers/registry.js";
export {
  createDefaultReferenceProviders,
  createReferenceProvider
} from "./providers/reference-provider.js";
export { createFailingProvider } from "./providers/failing-provider.js";
export { createCodexAdapterProvider } from "./providers/codex-adapter.js";
export { orchestrateProviders } from "./orchestration/orchestrator.js";
export {
  loadOrchestrationCandidates,
  readOrchestrationRun
} from "./orchestration/run-store.js";
export { runBaselineMatchGate } from "./gates/baseline-match-gate.js";
export type { Provider, ProviderContext, ProviderManifest } from "./providers/types.js";
export type {
  OrchestrationResult,
  OrchestrationRunRecord,
  ProviderRunSummary
} from "./orchestration/types.js";
export {
  activeDecisionEvents,
  appendDecision,
  appendUndo,
  createDecisionLog
} from "./decisions/decision-log.js";
export { CompositionStore, DecisionLogStore } from "./decisions/store.js";
export { composeResume } from "./composition/composer.js";
export type { DecisionEvent, DecisionInput, DecisionLog } from "./decisions/types.js";
export type {
  ComposedResume,
  ComposedResumeBlock,
  CompositionConflict,
  CompositionResult
} from "./composition/types.js";
