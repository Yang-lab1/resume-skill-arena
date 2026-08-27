import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { freezeBaseline } from "../baseline/freeze.js";
import { orchestrateProviders } from "../orchestration/orchestrator.js";
import { createCodexAdapterProvider } from "../providers/codex-adapter.js";
import { ProviderRegistry } from "../providers/registry.js";
import type { CodexSkillInvoker } from "../providers/codex-adapter.js";
import { buildComparisonModel } from "./comparison-model.js";
import { createRealCodexSkillInvoker } from "./codex-skill-invoker.js";
import { validateRunRequest, type LocalRunRequest } from "./run-request.js";
import {
  discoverInstalledSkills,
  defaultSkillRoots,
  type InstalledSkill
} from "./skill-catalog.js";

const MAX_RESUME_BYTES = 20 * 1024 * 1024;

export interface LocalRunDependencies {
  projectRoot: string;
  runtimeRoot: string;
  skillRoots?: readonly string[];
  invokerFactory?: (skill: InstalledSkill, runDirectory: string) => CodexSkillInvoker;
  now?: () => Date;
  onProgress?: (progress: LocalRunProgress) => void;
}

export interface LocalRunProgress {
  stage: "intake" | "baseline" | "provider" | "gates" | "complete";
  completed: number;
  total: number;
  message: string;
  skillId?: string;
  status?: string;
}

function runId(now: Date): string {
  return `run.${now.toISOString().replace(/[-:.TZ]/g, "")}.${randomUUID().slice(0, 8)}`;
}

function decodeResume(base64: string): Buffer {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) throw new Error("简历文件内容为空。");
  if (bytes.length > MAX_RESUME_BYTES) throw new Error("DOCX 超过 20 MiB 限制。");
  return bytes;
}

export async function executeLocalRun(
  input: unknown,
  dependencies: LocalRunDependencies
) {
  const request: LocalRunRequest = validateRunRequest(input);
  const totalProgress = request.skillIds.length + 3;
  dependencies.onProgress?.({ stage: "intake", completed: 0, total: totalProgress, message: "已接收材料，准备冻结基线。" });
  const now = dependencies.now ?? (() => new Date());
  const id = runId(now());
  const runtimeRoot = resolve(dependencies.runtimeRoot);
  const intakeDirectory = resolve(runtimeRoot, "intake", id);
  const runsDirectory = resolve(runtimeRoot, "runs");
  mkdirSync(intakeDirectory, { recursive: true });
  mkdirSync(runsDirectory, { recursive: true });
  const resumePath = resolve(intakeDirectory, basename(request.resume.name));
  const jobPath = resolve(intakeDirectory, "job.txt");
  const resumeBytes = decodeResume(request.resume.base64);
  writeFileSync(resumePath, resumeBytes, { flag: "wx" });
  writeFileSync(jobPath, request.jobText, { encoding: "utf8", flag: "wx" });

  try {
    const frozen = freezeBaseline({
      resumePath,
      ...(request.resume.extractedText ? { resumeText: request.resume.extractedText } : {}),
      ...(request.resume.mediaType ? { resumeMediaType: request.resume.mediaType } : {}),
      jobPath,
      outputDirectory: runsDirectory,
      runId: id,
      locale: "zh-CN",
      maxPages: 2,
      now
    });
    dependencies.onProgress?.({ stage: "baseline", completed: 1, total: totalProgress, message: "简历与岗位已冻结为同一份真实基线。" });
    const skillRoots = dependencies.skillRoots ?? [resolve(runtimeRoot, "skills"), ...defaultSkillRoots()];
    const skills = discoverInstalledSkills(request.skillIds, skillRoots);
    const invokerFactory = dependencies.invokerFactory ?? ((skill, runDirectory) =>
      createRealCodexSkillInvoker({
        projectRoot: dependencies.projectRoot,
        runDirectory,
        skill
      }));
    const providers = skills.map((skill) => createCodexAdapterProvider(
      {
        id: skill.id,
        name: skill.name,
        version: skill.version,
        skillPath: skill.skillPath
      },
      invokerFactory(skill, frozen.runDirectory)
    ));
    const orchestrationId = `orch.${id.slice(4)}`;
    const result = await orchestrateProviders({
      runDirectory: frozen.runDirectory,
      registry: new ProviderRegistry(providers),
      requestedProviderIds: request.skillIds,
      orchestrationId,
      // The compiled comparison prompt normally returns within seconds. A
      // five-minute ceiling gives a cold host invocation time to initialize
      // while still bounding a wedged provider before the guarded retry.
      timeoutMs: 300_000,
      now,
      onProviderProgress: ({ providerId, index, total, status }) => dependencies.onProgress?.({
        stage: "provider",
        completed: status === "RUNNING" ? index + 1 : index + 2,
        total: total + 3,
        skillId: providerId,
        status,
        message: status === "RUNNING"
          ? `正在执行 ${providerId}。`
          : status === "SUCCESS"
            ? `${providerId} 已完成并通过结果校验。`
            : `${providerId} 返回 ${status}，不会生成替代结果。`
      })
    });
    dependencies.onProgress?.({ stage: "gates", completed: request.skillIds.length + 2, total: totalProgress, message: "所有候选已通过来源、事实与基线门禁。" });
    const comparison = buildComparisonModel(frozen.baseline, result.candidates);
    dependencies.onProgress?.({ stage: "complete", completed: totalProgress, total: totalProgress, message: "比较工作台已准备完成。" });
    return {
      schemaVersion: "0.1" as const,
      runId: id,
      orchestrationId,
      status: result.status,
      resume: {
        name: frozen.baseline.resumeAst.source.originalName,
        hash: frozen.baseline.resumeAst.resumeHash,
        blockCount: frozen.baseline.resumeAst.blocks.length
      },
      job: {
        hash: frozen.baseline.jobSnapshot.jobHash,
        blockCount: frozen.baseline.jobSnapshot.blocks.length
      },
      skills: skills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        version: skill.version,
        contentHash: skill.contentHash
      })),
      providers: result.providers,
      comparison
    };
  } finally {
    rmSync(intakeDirectory, { recursive: true, force: true });
  }
}
