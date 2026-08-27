import type { ErrorObject } from "ajv";

import { createGateIssue } from "../gates/messages.zh-CN.js";
import { resultFromIssues, type GateResult } from "../gates/result.js";
import { frozenBaselineSchemaValidator } from "./baseline-schema-loader.js";

function issuePath(error: ErrorObject): string {
  if (error.keyword === "required") {
    return `${error.instancePath}/${String(error.params.missingProperty)}`;
  }
  return error.instancePath || "/";
}

export function validateFrozenBaselineSchema(input: unknown): GateResult {
  if (frozenBaselineSchemaValidator(input)) {
    return resultFromIssues([]);
  }

  return resultFromIssues(
    (frozenBaselineSchemaValidator.errors ?? []).map((error) =>
      createGateIssue(
        "SCHEMA_INVALID",
        issuePath(error),
        `Frozen Baseline 字段不符合规范：${error.message ?? error.keyword}`,
        JSON.stringify(error.params)
      )
    )
  );
}
