import type { GateIssue } from "../gates/result.js";

export interface CliResult {
  ok: boolean;
  exitCode: number;
  issues: Array<GateIssue | CliIssue>;
}

export interface CliIssue {
  code: "USAGE_ERROR" | "FILE_READ_ERROR" | "JSON_PARSE_ERROR";
  path: string;
  summary: string;
  guidance: string;
  detail?: string;
}

export function formatHumanResult(result: CliResult): string {
  if (result.ok) {
    return "✓ ChangeSet 验证通过。";
  }

  const lines = ["✗ ChangeSet 验证未通过："];
  result.issues.forEach((issue) => {
    lines.push(`- [${issue.code}] ${issue.path}`);
    lines.push(`  原因：${issue.summary}`);
    lines.push(`  处理：${issue.guidance}`);
  });
  return lines.join("\n");
}

export function formatJsonResult(result: CliResult): string {
  return JSON.stringify(result, null, 2);
}
