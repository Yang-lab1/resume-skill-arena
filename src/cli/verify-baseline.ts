import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyFrozenBaseline } from "../baseline/verify.js";

export function runVerifyBaselineCli(args: string[]): number {
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  const runDirectory = positional[0];
  if (!runDirectory || positional.length !== 1) {
    const result = {
      ok: false,
      issues: [
        {
          code: "USAGE_ERROR",
          path: "/arguments/run-directory",
          summary: "用法：npm run verify:baseline -- <运行目录> [--json]"
        }
      ]
    };
    process.stdout.write(
      json ? `${JSON.stringify(result)}\n` : `✗ ${result.issues[0]!.summary}\n`
    );
    return 2;
  }

  const result = verifyFrozenBaseline(runDirectory);
  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (result.ok) {
    process.stdout.write("✓ 冻结基线完整，允许进入后续阶段。\n");
  } else {
    process.stdout.write("✗ 冻结基线校验失败，已阻止继续：\n");
    result.issues.forEach((issue) => {
      process.stdout.write(`- [${issue.code}] ${issue.path}：${issue.summary}\n`);
    });
  }
  return result.ok ? 0 : 7;
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) {
  process.exitCode = runVerifyBaselineCli(process.argv.slice(2));
}
