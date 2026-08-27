import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "resume-studio-cli-"));
const resumePath = join(tempRoot, "中文 简历.docx");
const jobPath = join(tempRoot, "岗位 说明.md");
const outputPath = join(tempRoot, "输出 目录");
const runId = "run.cli.001";

const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>AI 设计工程师</w:t></w:r></w:p></w:body></w:document>`;
writeFileSync(
  resumePath,
  Buffer.from(zipSync({ "word/document.xml": strToU8(documentXml) }))
);
writeFileSync(jobPath, "负责 AI 产品设计\n推动项目落地", "utf8");

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

describe("freeze and verify baseline CLIs", () => {
  it("freezes Chinese paths and verifies the result", () => {
    const freeze = run("src/cli/freeze-baseline.ts", [
      "--resume",
      resumePath,
      "--job",
      jobPath,
      "--out",
      outputPath,
      "--run-id",
      runId,
      "--locale",
      "zh-CN",
      "--max-pages",
      "1",
      "--json"
    ]);
    const freezeOutput = JSON.parse(freeze.stdout) as {
      ok: boolean;
      runDirectory: string;
      baselineId: string;
    };

    expect(freeze.status).toBe(0);
    expect(freezeOutput.ok).toBe(true);
    expect(freezeOutput.baselineId).toMatch(/^baseline\./);
    expect(existsSync(join(freezeOutput.runDirectory, "baseline/baseline.json"))).toBe(
      true
    );

    const verify = run("src/cli/verify-baseline.ts", [
      freezeOutput.runDirectory,
      "--json"
    ]);
    expect(verify.status).toBe(0);
    expect(JSON.parse(verify.stdout)).toEqual({ ok: true, issues: [] });
  });

  it("returns a blocking exit code after frozen input tampering", () => {
    const runDirectory = join(outputPath, runId);
    writeFileSync(join(runDirectory, "input/岗位 说明.md"), "被篡改", "utf8");

    const verify = run("src/cli/verify-baseline.ts", [runDirectory, "--json"]);
    const output = JSON.parse(verify.stdout) as {
      ok: boolean;
      issues: Array<{ code: string }>;
    };

    expect(verify.status).toBe(7);
    expect(output.ok).toBe(false);
    expect(output.issues[0]!.code).toBe("JOB_HASH_MISMATCH");
  });
});
