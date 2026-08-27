import type { GateResult } from "./result.js";
import { resultFromIssues } from "./result.js";
import { runFactEvidenceGate } from "./fact-evidence-gate.js";

export function runSemanticGates(input: unknown): GateResult {
  return resultFromIssues(runFactEvidenceGate(input));
}
