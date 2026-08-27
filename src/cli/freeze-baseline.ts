import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { freezeBaseline } from "../baseline/freeze.js";

interface ParsedFreezeArgs {
  resumePath: string;
  jobPath: string;
  outputDirectory: string;
  runId: string;
  locale: string;
  maxPages: number;
  templateId?: string;
  json: boolean;
}

function defaultRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `run.${timestamp}.${randomUUID().slice(0, 8)}`;
}

function parseArgs(args: string[]): ParsedFreezeArgs {
  const values = new Map<string, string>();
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (!flag.startsWith("--")) {
      throw new Error(`无法识别的参数：${flag}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数 ${flag} 缺少值。`);
    }
    values.set(flag, value);
    index += 1;
  }

  const resumePath = values.get("--resume");
  const jobPath = values.get("--job");
  const outputDirectory = values.get("--out");
  if (!resumePath || !jobPath || !outputDirectory) {
    throw new Error("必须提供 --resume、--job 和 --out。");
  }
  const maxPages = Number(values.get("--max-pages") ?? "1");
  return {
    resumePath,
    jobPath,
    outputDirectory,
    runId: values.get("--run-id") ?? defaultRunId(),
    locale: values.get("--locale") ?? "zh-CN",
    maxPages,
    ...(values.has("--template-id")
      ? { templateId: values.get("--template-id")! }
      : {}),
    json
  };
}

export function runFreezeBaselineCli(args: string[]): number {
  let parsed: ParsedFreezeArgs;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    const json = args.includes("--json");
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      json
        ? `${JSON.stringify({ ok: false, code: "USAGE_ERROR", message })}\n`
        : `✗ 参数错误：${message}\n`
    );
    return 2;
  }

  try {
    const result = freezeBaseline(parsed);
    if (parsed.json) {
      process.stdout.write(
        `${JSON.stringify({
          ok: true,
          runDirectory: result.runDirectory,
          baselineId: result.baseline.baselineId
        })}\n`
      );
    } else {
      process.stdout.write(`✓ 基线冻结完成：${result.runDirectory}\n`);
      process.stdout.write(`  基线 ID：${result.baseline.baselineId}\n`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      parsed.json
        ? `${JSON.stringify({ ok: false, code: "FREEZE_FAILED", message })}\n`
        : `✗ 基线冻结失败：${message}\n`
    );
    return 6;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) {
  process.exitCode = runFreezeBaselineCli(process.argv.slice(2));
}
