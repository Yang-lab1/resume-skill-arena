import type { ErrorObject } from "ajv";

import { createGateIssue } from "../gates/messages.zh-CN.js";
import { resultFromIssues, type GateResult } from "../gates/result.js";
import { changeSetSchemaValidator } from "./schema-loader.js";

function issuePath(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missing = String(error.params.missingProperty);
    return `${error.instancePath}/${missing}` || `/${missing}`;
  }

  return error.instancePath || "/";
}

function issueSummary(error: ErrorObject, path: string): string {
  if (path.endsWith("/resumeEvidence")) {
    return "修改缺少简历事实依据。";
  }

  return `ChangeSet 字段不符合规范：${error.message ?? error.keyword}`;
}

export function validateChangeSetSchema(input: unknown): GateResult {
  if (changeSetSchemaValidator(input)) {
    return resultFromIssues([]);
  }

  const issues = (changeSetSchemaValidator.errors ?? []).map((error) => {
    const path = issuePath(error);
    return createGateIssue(
      "SCHEMA_INVALID",
      path,
      issueSummary(error, path),
      JSON.stringify(error.params)
    );
  });

  return resultFromIssues(issues);
}
