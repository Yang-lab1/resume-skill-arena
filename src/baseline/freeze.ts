import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { validateFrozenBaselineSchema } from "../contracts/validate-baseline-schema.js";
import { parseResumeDocx } from "./docx-parser.js";
import { parseResumeText } from "./resume-text-parser.js";
import { createFactSnapshot } from "./fact-snapshot.js";
import { sha256, stableId, stableStringify } from "./hash.js";
import { parseJobText } from "./job-parser.js";
import type {
  BaselineConstraints,
  BaselineLock,
  FrozenBaseline
} from "./types.js";

export interface FreezeBaselineOptions {
  resumePath: string;
  resumeText?: string;
  resumeMediaType?: string;
  jobPath: string;
  outputDirectory: string;
  runId: string;
  locale: string;
  maxPages: number;
  templateId?: string;
  now?: () => Date;
}

export interface FreezeBaselineResult {
  runDirectory: string;
  baseline: FrozenBaseline;
  lock: BaselineLock;
}

export interface ChangeSetBaselineReference {
  resumeId: string;
  resumeHash: string;
  resumeAstVersion: string;
  jobId: string;
  jobHash: string;
  jobAstVersion: string;
  factSnapshotId: string;
  locale: string;
  constraints: {
    maxPages: number;
    outputLanguages: string[];
    templateId?: string;
  };
}

export function computeBaselineId(
  resumeHash: string,
  jobHash: string,
  constraints: BaselineConstraints
): string {
  return stableId(
    "baseline",
    resumeHash,
    jobHash,
    "resume-ast:0.1",
    "job-ast:0.1",
    "fact-snapshot:0.1",
    stableStringify(constraints)
  );
}

export function toChangeSetBaselineReference(
  baseline: FrozenBaseline
): ChangeSetBaselineReference {
  return {
    resumeId: baseline.resumeAst.resumeId,
    resumeHash: baseline.resumeAst.resumeHash,
    resumeAstVersion: baseline.resumeAst.astVersion,
    jobId: baseline.jobSnapshot.jobId,
    jobHash: baseline.jobSnapshot.jobHash,
    jobAstVersion: baseline.jobSnapshot.astVersion,
    factSnapshotId: baseline.factSnapshot.factSnapshotId,
    locale: baseline.constraints.locale,
    constraints: {
      maxPages: baseline.constraints.maxPages,
      outputLanguages: [baseline.constraints.locale],
      ...(baseline.constraints.templateId
        ? { templateId: baseline.constraints.templateId }
        : {})
    }
  };
}

function validateOptions(options: FreezeBaselineOptions): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(options.runId)) {
    throw new Error("runId 格式无效。");
  }
  const resumeExtension = extname(options.resumePath).toLowerCase();
  if (resumeExtension !== ".docx" && typeof options.resumeText !== "string") {
    throw new Error("PDF 或图片简历必须先提供真实识别文字。");
  }
  if (!new Set([".txt", ".md"]).has(extname(options.jobPath).toLowerCase())) {
    throw new Error("P2 JD 输入必须是 .txt 或 .md 文件。");
  }
  if (!Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 10) {
    throw new Error("maxPages 必须是 1 到 10 的整数。");
  }
}

export function freezeBaseline(
  options: FreezeBaselineOptions
): FreezeBaselineResult {
  validateOptions(options);
  const outputRoot = resolve(options.outputDirectory);
  const finalRunDirectory = join(outputRoot, options.runId);
  if (existsSync(finalRunDirectory)) {
    throw new Error(`运行目录已存在：${finalRunDirectory}`);
  }

  const resumeBytes = readFileSync(resolve(options.resumePath));
  const jobBytes = readFileSync(resolve(options.jobPath));
  const resumeAst = typeof options.resumeText === "string"
    ? parseResumeText(
      options.resumeText,
      basename(options.resumePath),
      options.resumeMediaType ?? "application/octet-stream",
      options.locale,
      resumeBytes
    )
    : parseResumeDocx(resumeBytes, basename(options.resumePath), options.locale);
  const jobSnapshot = parseJobText(
    jobBytes,
    basename(options.jobPath),
    options.locale
  );
  const factSnapshot = createFactSnapshot(resumeAst);
  const constraints: BaselineConstraints = {
    locale: options.locale,
    maxPages: options.maxPages,
    ...(options.templateId ? { templateId: options.templateId } : {})
  };
  const baselineId = computeBaselineId(
    resumeAst.resumeHash,
    jobSnapshot.jobHash,
    constraints
  );
  const baseline: FrozenBaseline = {
    schemaVersion: "0.1",
    baselineId,
    runId: options.runId,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    constraints,
    resumeAst,
    jobSnapshot,
    factSnapshot
  };
  const schemaResult = validateFrozenBaselineSchema(baseline);
  if (!schemaResult.ok) {
    throw new Error(
      `生成的冻结基线不符合 Schema：${schemaResult.issues
        .map((issue) => `${issue.path} ${issue.summary}`)
        .join("；")}`
    );
  }

  mkdirSync(outputRoot, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(outputRoot, `.${options.runId}.tmp-`));
  try {
    const inputDirectory = join(temporaryDirectory, "input");
    const baselineDirectory = join(temporaryDirectory, "baseline");
    mkdirSync(inputDirectory);
    mkdirSync(baselineDirectory);

    const resumeFileName = basename(options.resumePath);
    const jobFileName = basename(options.jobPath);
    const resumeRelativePath = `input/${resumeFileName}`;
    const jobRelativePath = `input/${jobFileName}`;
    writeFileSync(join(inputDirectory, resumeFileName), resumeBytes, { flag: "wx" });
    writeFileSync(join(inputDirectory, jobFileName), jobBytes, { flag: "wx" });

    const baselineBytes = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    writeFileSync(join(baselineDirectory, "baseline.json"), baselineBytes, {
      flag: "wx"
    });
    const lock: BaselineLock = {
      schemaVersion: "0.1",
      baselineId,
      baselineFileHash: sha256(baselineBytes),
      resumeFileHash: resumeAst.resumeHash,
      jobFileHash: jobSnapshot.jobHash,
      resumeRelativePath,
      jobRelativePath
    };
    writeFileSync(
      join(baselineDirectory, "baseline.lock.json"),
      `${JSON.stringify(lock, null, 2)}\n`,
      { encoding: "utf8", flag: "wx" }
    );

    renameSync(temporaryDirectory, finalRunDirectory);
    return { runDirectory: finalRunDirectory, baseline, lock };
  } catch (error) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}
