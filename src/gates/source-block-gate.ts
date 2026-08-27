import type { FrozenBaseline } from "../baseline/types.js";
import type { ChangeSet } from "../contracts/types.js";
import { createGateIssue } from "./messages.zh-CN.js";
import { resultFromIssues, type GateResult } from "./result.js";

export function runSourceBlockGate(input: unknown, baseline: FrozenBaseline): GateResult {
  const changeSet = input as ChangeSet;
  const blocks = new Map(baseline.resumeAst.blocks.map((block) => [block.blockId, block]));
  const issues = changeSet.changes.flatMap((change, index) => {
    const block = blocks.get(change.sourceBlockRef.blockId);
    const evidenceMatches = block && change.resumeEvidence.some((evidence) =>
      evidence.sourceType === "RESUME" &&
      (evidence.sourceRef === block.structuralPath || evidence.sourceRef === block.blockId) &&
      evidence.quote === block.text
    );
    if (
      block &&
      change.sourceBlockRef.structuralPath === block.structuralPath &&
      change.sourceBlockRef.contentHash === block.contentHash &&
      change.originalText === block.text &&
      evidenceMatches
    ) return [];
    return [createGateIssue(
      "SOURCE_BLOCK_MISMATCH",
      `/changes/${index}/sourceBlockRef`,
      `修改 ${change.changeId} 没有逐字引用冻结简历中的真实原文。`
    )];
  });
  return resultFromIssues(issues);
}
