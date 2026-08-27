import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";

import { freezeBaseline } from "../src/baseline/freeze.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "resume-studio-provider-cli-"));

afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

function createRun(): string {
  const resumePath = join(tempRoot, "resume.docx");
  const jobPath = join(tempRoot, "job.md");
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>AI 产品设计</w:t></w:r></w:p></w:body></w:document>`;
  writeFileSync(resumePath, zipSync({ "word/document.xml": strToU8(xml) }));
  writeFileSync(jobPath, "负责 AI 产品设计", "utf8");
  return freezeBaseline({
    resumePath,
    jobPath,
    outputDirectory: join(tempRoot, "runs"),
    runId: "run.provider.cli",
    locale: "zh-CN",
    maxPages: 1
  }).runDirectory;
}

describe("run providers CLI", () => {
  it("creates three default candidates from one frozen baseline", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/run-providers.ts",
        "--run",
        createRun(),
        "--orchestration-id",
        "orch.cli.001",
        "--json"
      ],
      { cwd: projectRoot, encoding: "utf8" }
    );
    const output = JSON.parse(result.stdout) as {
      ok: boolean;
      status: string;
      candidateCount: number;
    };

    expect(result.status).toBe(0);
    expect(output).toMatchObject({
      ok: true,
      status: "COMPLETED",
      candidateCount: 3
    });
  });
});

