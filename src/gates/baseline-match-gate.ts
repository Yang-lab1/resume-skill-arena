import { stableStringify } from "../baseline/hash.js";
import type { ChangeSetBaselineReference } from "../baseline/freeze.js";
import { createGateIssue } from "./messages.zh-CN.js";
import { resultFromIssues, type GateResult } from "./result.js";

export function runBaselineMatchGate(
  input: unknown,
  expected: ChangeSetBaselineReference
): GateResult {
  const actual = (input as { baseline?: unknown }).baseline;
  if (stableStringify(actual) === stableStringify(expected)) {
    return resultFromIssues([]);
  }
  return resultFromIssues([
    createGateIssue(
      "BASELINE_MISMATCH",
      "/baseline",
      "该方案引用的简历或 JD 基线与当前任务不一致。"
    )
  ]);
}

