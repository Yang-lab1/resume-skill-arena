import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";
import { afterAll, describe, expect, it } from "vitest";

import { freezeBaseline } from "../src/baseline/freeze.js";
import { orchestrateProviders } from "../src/orchestration/orchestrator.js";
import { ProviderRegistry } from "../src/providers/registry.js";
import { createDefaultReferenceProviders } from "../src/providers/reference-provider.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = mkdtempSync(join(tmpdir(), "resume-studio-decision-cli-"));

afterAll(() => rmSync(tempRoot, { recursive: true, force: true }));

function runCli(args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli/decision.ts", ...args, "--json"],
    { cwd: projectRoot, encoding: "utf8" }
  );
}

describe("decision and composition CLI", () => {
  it("selects a candidate and persists a traceable composed resume", async () => {
    const resumePath = join(tempRoot, "resume.docx");
    const jobPath = join(tempRoot, "job.md");
    const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>AI 产品设计</w:t></w:r></w:p></w:body></w:document>`;
    writeFileSync(resumePath, zipSync({ "word/document.xml": strToU8(xml) }));
    writeFileSync(jobPath, "负责 AI 产品设计", "utf8");
    const runDirectory = freezeBaseline({
      resumePath,
      jobPath,
      outputDirectory: join(tempRoot, "runs"),
      runId: "run.decision.cli",
      locale: "zh-CN",
      maxPages: 1
    }).runDirectory;
    const orchestration = await orchestrateProviders({
      runDirectory,
      registry: new ProviderRegistry(createDefaultReferenceProviders()),
      orchestrationId: "orch.decision.cli"
    });
    const candidate = orchestration.candidates[0]!;

    const create = runCli([
      "--run", runDirectory,
      "--log-id", "decision.cli.001",
      "--action", "create"
    ]);
    expect(create.status).toBe(0);

    const select = runCli([
      "--run", runDirectory,
      "--log-id", "decision.cli.001",
      "--action", "select",
      "--change-set-id", candidate.changeSetId,
      "--change-id", candidate.changes[0]!.changeId
    ]);
    expect(select.status).toBe(0);

    const compose = runCli([
      "--run", runDirectory,
      "--log-id", "decision.cli.001",
      "--action", "compose",
      "--orchestration-id", "orch.decision.cli",
      "--composition-id", "composition.cli.001"
    ]);
    const output = JSON.parse(compose.stdout) as {
      ok: boolean;
      outputPath: string;
      finalResumeId: string;
    };
    expect(compose.status).toBe(0);
    expect(output.ok).toBe(true);
    expect(output.finalResumeId).toMatch(/^final-resume\./);
    expect(existsSync(output.outputPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(output.outputPath, "utf8")) as {
      blocks: Array<{ provenance: { type: string } }>;
    };
    expect(persisted.blocks[0]!.provenance.type).toBe("PROVIDER");
  });
});
