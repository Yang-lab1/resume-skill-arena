import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateChangeSetSchema } from "../contracts/validate-schema.js";
import { runSemanticGates } from "../gates/run-gates.js";
import {
  formatHumanResult,
  formatJsonResult,
  type CliIssue,
  type CliResult
} from "./format-result.js";

export const EXIT_CODE = {
  SUCCESS: 0,
  INPUT_ERROR: 2,
  JSON_ERROR: 3,
  SCHEMA_ERROR: 4,
  FACT_GATE_ERROR: 5
} as const;

interface CliIo {
  write(text: string): void;
}

function inputFailure(issue: CliIssue, exitCode: number): CliResult {
  return { ok: false, exitCode, issues: [issue] };
}

export function validateChangeSetFile(filePath: string): CliResult {
  let raw: string;
  try {
    raw = readFileSync(resolve(filePath), "utf8");
  } catch (error) {
    return inputFailure(
      {
        code: "FILE_READ_ERROR",
        path: filePath,
        summary: "无法读取指定的 ChangeSet 文件。",
        guidance: "请确认文件存在，并检查路径和读取权限。",
        detail: error instanceof Error ? error.message : String(error)
      },
      EXIT_CODE.INPUT_ERROR
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    return inputFailure(
      {
        code: "JSON_PARSE_ERROR",
        path: filePath,
        summary: "文件不是有效的 JSON。",
        guidance: "请修复 JSON 语法后重新验证。",
        detail: error instanceof Error ? error.message : String(error)
      },
      EXIT_CODE.JSON_ERROR
    );
  }

  const schemaResult = validateChangeSetSchema(input);
  if (!schemaResult.ok) {
    return {
      ok: false,
      exitCode: EXIT_CODE.SCHEMA_ERROR,
      issues: schemaResult.issues
    };
  }

  const gateResult = runSemanticGates(input);
  if (!gateResult.ok) {
    return {
      ok: false,
      exitCode: EXIT_CODE.FACT_GATE_ERROR,
      issues: gateResult.issues
    };
  }

  return { ok: true, exitCode: EXIT_CODE.SUCCESS, issues: [] };
}

export function runValidateChangeSetCli(args: string[], io: CliIo): number {
  const jsonOutput = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  const filePath = positional[0];

  const result = filePath
    ? validateChangeSetFile(filePath)
    : inputFailure(
        {
          code: "USAGE_ERROR",
          path: "/arguments/file",
          summary: "缺少 ChangeSet 文件路径。",
          guidance: "用法：npm run validate:changeset -- <文件路径> [--json]"
        },
        EXIT_CODE.INPUT_ERROR
      );

  io.write(jsonOutput ? formatJsonResult(result) : formatHumanResult(result));
  return result.exitCode;
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (entryUrl === import.meta.url) {
  process.exitCode = runValidateChangeSetCli(process.argv.slice(2), {
    write(text) {
      process.stdout.write(`${text}\n`);
    }
  });
}
