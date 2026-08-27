import type { ChangeSet } from "../contracts/types.js";
import { createGateIssue } from "./messages.zh-CN.js";
import type { GateIssue } from "./result.js";

const groundedSources = new Set(["RESUME", "USER_FACT", "USER_CONFIRMATION"]);

export function runFactEvidenceGate(input: unknown): GateIssue[] {
  const changeSet = input as ChangeSet;
  const issues: GateIssue[] = [];

  changeSet.changes.forEach((change, index) => {
    const basePath = `/changes/${index}`;
    const hasGroundedEvidence = change.resumeEvidence.some((evidence) =>
      groundedSources.has(evidence.sourceType)
    );

    if (!hasGroundedEvidence) {
      issues.push(
        createGateIssue(
          "FACT_EVIDENCE_MISSING",
          `${basePath}/resumeEvidence`,
          `修改 ${change.changeId} 没有可用的简历事实依据。`
        )
      );
    }

    const factualImpacts = change.factImpacts.filter(
      (impact) => impact.impactType !== "NONE"
    );
    if (factualImpacts.length === 0) {
      return;
    }

    if (
      change.adoptionPolicy === "USER_SELECTABLE" ||
      factualImpacts.some((impact) => !impact.approvalRequired)
    ) {
      issues.push(
        createGateIssue(
          "FACT_APPROVAL_REQUIRED",
          `${basePath}/adoptionPolicy`,
          `修改 ${change.changeId} 涉及事实变化，但没有要求用户明确确认。`
        )
      );
    }

    if (change.risk.level === "SAFE") {
      issues.push(
        createGateIssue(
          "FACT_RISK_UNDERSPECIFIED",
          `${basePath}/risk/level`,
          `修改 ${change.changeId} 涉及事实变化，不能标记为安全自动采用。`
        )
      );
    }
  });

  return issues;
}
