export type GateIssueCode =
  | "SCHEMA_INVALID"
  | "BASELINE_MISMATCH"
  | "SOURCE_BLOCK_MISMATCH"
  | "FACT_EVIDENCE_MISSING"
  | "FACT_APPROVAL_REQUIRED"
  | "FACT_RISK_UNDERSPECIFIED";

export interface GateIssue {
  code: GateIssueCode;
  path: string;
  summary: string;
  guidance: string;
  detail?: string;
}

export interface GateResult {
  ok: boolean;
  issues: GateIssue[];
}

export function resultFromIssues(issues: GateIssue[]): GateResult {
  return { ok: issues.length === 0, issues };
}
