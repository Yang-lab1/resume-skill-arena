import type { GateIssue, GateIssueCode } from "./result.js";

const guidance: Record<GateIssueCode, string> = {
  SCHEMA_INVALID: "请按 ChangeSet v0.1 格式补齐或修正该字段。",
  BASELINE_MISMATCH: "请让该方案重新基于当前冻结简历和 JD 生成。",
  SOURCE_BLOCK_MISMATCH: "请让 Skill 精确引用冻结简历中的原文区块，不得自行提供或替换原文。",
  FACT_EVIDENCE_MISSING: "请引用源简历或用户已确认的事实；没有证据时删除这项建议。",
  FACT_APPROVAL_REQUIRED: "请将这项事实变化标记为需要用户明确确认。",
  FACT_RISK_UNDERSPECIFIED: "请把风险级别改为需要确认或禁止采用。"
};

export function createGateIssue(
  code: GateIssueCode,
  path: string,
  summary: string,
  detail?: string
): GateIssue {
  return {
    code,
    path,
    summary,
    guidance: guidance[code],
    ...(detail === undefined ? {} : { detail })
  };
}
