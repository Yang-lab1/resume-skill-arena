import type { ChangeSetBaselineReference } from "../baseline/freeze.js";
import type { GateIssueCode } from "../gates/result.js";

export type ProviderRunStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "REJECTED"
  | "FAILED"
  | "TIMED_OUT";

export type OrchestrationStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

export interface ProviderAttemptSummary {
  attempt: number;
  status: Extract<ProviderRunStatus, "SUCCESS" | "REJECTED" | "FAILED" | "TIMED_OUT">;
  durationMs: number;
  issueCodes?: GateIssueCode[];
  errorCode?: "PROVIDER_ERROR" | "PROVIDER_TIMEOUT";
  errorMessage?: string;
}

export interface ProviderRunSummary {
  providerId: string;
  invocationId: string;
  status: ProviderRunStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  issueCodes?: GateIssueCode[];
  errorCode?: "PROVIDER_ERROR" | "PROVIDER_TIMEOUT";
  errorMessage?: string;
  candidatePath?: string;
  /** 每次真实执行的结果；超时重试不会被伪装成首次成功。 */
  attempts?: ProviderAttemptSummary[];
  retryCount?: number;
}

export interface OrchestrationRunRecord {
  schemaVersion: "0.1";
  orchestrationId: string;
  baselineId: string;
  status: OrchestrationStatus;
  createdAt: string;
  updatedAt: string;
  providers: ProviderRunSummary[];
}

export interface ChangeSetCandidate extends Record<string, unknown> {
  changeSetId: string;
  baseline: ChangeSetBaselineReference;
  changes: Array<{ changeId: string } & Record<string, unknown>>;
}

export interface OrchestrationResult extends OrchestrationRunRecord {
  candidates: ChangeSetCandidate[];
}
