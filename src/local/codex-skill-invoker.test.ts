import { describe, expect, it } from "vitest";

import type { ProviderContext } from "../providers/types.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { bindHostManagedMetadata, buildSkillPrompt, DEFAULT_CODEX_MODEL } from "./codex-skill-invoker.js";

describe("buildSkillPrompt", () => {
  it("uses the Codex-compatible default model instead of the API-only Sol target", () => {
    expect(DEFAULT_CODEX_MODEL).toBe("gpt-5.6-terra");
  });

  it("uses a host-compiled comparison method instead of asking Codex to execute the whole native Skill", () => {
    const context = {
      invocationId: "invoke.real.001",
      baseline: {
        runId: "run.real.001",
        createdAt: "2026-08-21T00:00:00.000Z",
        resumeAst: {
          blocks: [{ blockId: "resume-block.real", structuralPath: "p[1]", contentHash: "a".repeat(64), text: "真实原文" }]
        },
        jobSnapshot: {
          blocks: [{ blockId: "job-block.real", structuralPath: "line[1]", contentHash: "b".repeat(64), text: "真实岗位" }]
        }
      },
      baselineReference: { resumeId: "resume.real" }
    } as unknown as ProviderContext;
    const prompt = buildSkillPrompt(
      {
        id: "career-ops",
        name: "career-ops",
        version: "local-123456789abc",
        skillPath: "C:\\skills\\resume-optimizer\\SKILL.md",
        directory: "C:\\skills\\resume-optimizer",
        contentHash: "c".repeat(64)
      },
      context
    );

    expect(prompt).toContain("真实原文");
    expect(prompt).toContain("invoke.real.001");
    expect(prompt).toContain("Never quote a substring or invent a source sentence");
    expect(prompt).toContain("Copy the complete baselineReference object verbatim");
    expect(prompt).toContain("Host-compiled comparison method");
    expect(prompt).toContain("evidence-based CV-tailoring method");
    expect(prompt).toContain("The operation is already selected: resume comparison and rewrite");
    expect(prompt).not.toContain("Read and follow the actual Skill instructions");
    expect(prompt).not.toContain("Adapter mode restriction");
    expect(prompt).not.toContain("C:\\skills\\resume-optimizer\\SKILL.md");
  });

  it("keeps the Codex response schema within the supported subset", () => {
    const schema = JSON.parse(readFileSync(
      resolve(process.cwd(), "schemas", "codex-changeset-output.schema.json"),
      "utf8"
    )) as object;

    expect(JSON.stringify(schema)).not.toContain('"uniqueItems"');
  });

  it("binds host-owned identity without changing Skill-generated changes", () => {
    const skill = {
      id: "resume-optimizer",
      name: "resume-optimizer",
      version: "local-123456789abc",
      skillPath: "C:\\skills\\resume-optimizer\\SKILL.md",
      directory: "C:\\skills\\resume-optimizer",
      contentHash: "c".repeat(64)
    };
    const context = {
      invocationId: "invoke.real.001",
      baseline: {
        runId: "run.real.001",
        constraints: { locale: "zh-CN", maxPages: 2 },
        resumeAst: { resumeId: "resume.real", resumeHash: "a".repeat(64), astVersion: "0.1" },
        jobSnapshot: { jobId: "job.real", jobHash: "b".repeat(64), astVersion: "0.1" },
        factSnapshot: { factSnapshotId: "facts.real" }
      }
    } as unknown as ProviderContext;
    const changes = [{ changeId: "change.real", proposedText: "真实改写" }];

    const bound = bindHostManagedMetadata({ changes, summary: "真实 Skill 输出" }, skill, context, () => new Date("2026-08-22T00:00:00.000Z")) as Record<string, unknown>;

    expect(bound.changes).toBe(changes);
    expect(bound).toMatchObject({
      schemaVersion: "0.1",
      runId: "run.real.001",
      createdAt: "2026-08-22T00:00:00.000Z",
      producer: { skillId: "resume-optimizer", invocationId: "invoke.real.001" },
      baseline: { resumeId: "resume.real", jobId: "job.real" }
    });
  });

  it("canonicalizes a selected source block without changing the Skill rewrite", () => {
    const skill = {
      id: "resume-optimizer", name: "resume-optimizer", version: "local-123456789abc",
      skillPath: "C:\\skills\\resume-optimizer\\SKILL.md", directory: "C:\\skills\\resume-optimizer", contentHash: "c".repeat(64)
    };
    const context = {
      invocationId: "invoke.real.002",
      baseline: {
        runId: "run.real.002", constraints: { locale: "zh-CN", maxPages: 2 },
        resumeAst: {
          resumeId: "resume.real", resumeHash: "a".repeat(64), astVersion: "0.1",
          blocks: [{ blockId: "block.real", structuralPath: "line[2]", contentHash: "d".repeat(64), text: "冻结的真实原文" }]
        },
        jobSnapshot: { jobId: "job.real", jobHash: "b".repeat(64), astVersion: "0.1" },
        factSnapshot: { factSnapshotId: "facts.real" }
      }
    } as unknown as ProviderContext;
    const changes = [{
      changeId: "change.real", proposedText: "真实 Skill 改写", sourceBlockRef: { blockId: "block.real", structuralPath: "格式化后的路径", contentHash: "x".repeat(64) },
      originalText: "格式化后的原文", resumeEvidence: [{ sourceType: "RESUME", sourceRef: "格式化后的路径", quote: "格式化后的原文" }]
    }];

    const bound = bindHostManagedMetadata({ changes, summary: "真实 Skill 输出" }, skill, context) as { changes: Array<Record<string, unknown>> };

    expect(bound.changes[0]).toMatchObject({
      proposedText: "真实 Skill 改写",
      originalText: "冻结的真实原文",
      sourceBlockRef: { blockId: "block.real", structuralPath: "line[2]", contentHash: "d".repeat(64) },
      resumeEvidence: [{ sourceType: "RESUME", sourceRef: "line[2]", quote: "冻结的真实原文" }]
    });
  });

  it("recovers a drifted block id only when the Skill copied one unique frozen source exactly", () => {
    const skill = {
      id: "interview-coach", name: "interview-coach", version: "local-123456789abc",
      skillPath: "C:\\skills\\interview-coach\\SKILL.md", directory: "C:\\skills\\interview-coach", contentHash: "c".repeat(64)
    };
    const context = {
      invocationId: "invoke.real.003",
      baseline: {
        runId: "run.real.003", constraints: { locale: "zh-CN", maxPages: 2 },
        resumeAst: {
          resumeId: "resume.real", resumeHash: "a".repeat(64), astVersion: "0.1",
          blocks: [
            { blockId: "block.real.1", structuralPath: "line[1]", contentHash: "d".repeat(64), text: "冻结原文一" },
            { blockId: "block.real.2", structuralPath: "line[2]", contentHash: "e".repeat(64), text: "冻结原文二" }
          ]
        },
        jobSnapshot: { jobId: "job.real", jobHash: "b".repeat(64), astVersion: "0.1" },
        factSnapshot: { factSnapshotId: "facts.real" }
      }
    } as unknown as ProviderContext;
    const changes = [{
      changeId: "change.real", proposedText: "真实 Skill 改写", sourceBlockRef: { blockId: "block.drifted", structuralPath: "line[2]", contentHash: "x".repeat(64) },
      originalText: "冻结原文二", resumeEvidence: [{ sourceType: "RESUME", sourceRef: "line[2]", quote: "冻结原文二" }]
    }];

    const bound = bindHostManagedMetadata({ changes }, skill, context) as { changes: Array<Record<string, unknown>> };

    expect(bound.changes[0]).toMatchObject({
      proposedText: "真实 Skill 改写",
      originalText: "冻结原文二",
      sourceBlockRef: { blockId: "block.real.2", structuralPath: "line[2]", contentHash: "e".repeat(64) }
    });
  });
});
