import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tempDir = mkdtempSync(join(tmpdir(), "resume-studio-test-"));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function runPath(filePath: string, extraArgs: string[] = []) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli/validate-changeset.ts",
      filePath,
      ...extraArgs
    ],
    { cwd: projectRoot, encoding: "utf8" }
  );
}

function runCli(exampleName: string, extraArgs: string[] = []) {
  return runPath(`examples/${exampleName}`, extraArgs);
}

describe("validate-changeset CLI", () => {
  it("returns success for the valid example", () => {
    const result = runCli("valid-changeset.json");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("验证通过");
  });

  it("blocks the ungrounded example with a useful location", () => {
    const result = runCli("invalid-ungrounded-change.json");

    expect(result.status).toBe(4);
    expect(result.stdout).toContain("/changes/0/resumeEvidence");
    expect(result.stdout).toContain("事实依据");
  });

  it("offers stable JSON output for future UI integration", () => {
    const result = runCli("valid-changeset.json", ["--json"]);
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      exitCode: number;
      issues: unknown[];
    };

    expect(output).toEqual({ ok: true, exitCode: 0, issues: [] });
  });

  it("uses a separate exit code for a semantic fact gate failure", () => {
    const input = JSON.parse(
      readFileSync(join(projectRoot, "examples/valid-changeset.json"), "utf8")
    ) as { changes: Array<{ resumeEvidence: Array<{ sourceType: string }> }> };
    input.changes[0]!.resumeEvidence[0]!.sourceType = "JOB_DESCRIPTION";
    const filePath = join(tempDir, "只有岗位证据.json");
    writeFileSync(filePath, JSON.stringify(input), "utf8");

    const result = runPath(filePath);

    expect(result.status).toBe(5);
    expect(result.stdout).toContain("没有可用的简历事实依据");
  });

  it("distinguishes a missing file from malformed JSON", () => {
    const missing = runPath(join(tempDir, "不存在.json"));
    const malformedPath = join(tempDir, "格式错误.json");
    writeFileSync(malformedPath, "{not-json", "utf8");
    const malformed = runPath(malformedPath);

    expect(missing.status).toBe(2);
    expect(malformed.status).toBe(3);
  });
});
