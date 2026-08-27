import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import { computeBaselineId } from "./freeze.js";
import { sha256 } from "./hash.js";
import type { BaselineLock, FrozenBaseline } from "./types.js";

export type BaselineVerificationCode =
  | "LOCK_READ_ERROR"
  | "LOCK_PATH_INVALID"
  | "BASELINE_HASH_MISMATCH"
  | "RESUME_HASH_MISMATCH"
  | "JOB_HASH_MISMATCH"
  | "BASELINE_ID_MISMATCH";

export interface BaselineVerificationIssue {
  code: BaselineVerificationCode;
  path: string;
  summary: string;
}

export interface BaselineVerificationResult {
  ok: boolean;
  issues: BaselineVerificationIssue[];
}

function insideRunDirectory(runDirectory: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error("锁文件包含绝对路径。");
  }
  const root = resolve(runDirectory);
  const target = resolve(root, relativePath);
  const relation = relative(root, target);
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error("锁文件路径超出运行目录。");
  }
  return target;
}

function fileHash(path: string): string | undefined {
  try {
    return sha256(readFileSync(path));
  } catch {
    return undefined;
  }
}

export function verifyFrozenBaseline(
  runDirectory: string
): BaselineVerificationResult {
  const resolvedRunDirectory = resolve(runDirectory);
  let lock: BaselineLock;
  let baselineBytes: Buffer;
  let baseline: FrozenBaseline;
  try {
    lock = JSON.parse(
      readFileSync(
        resolve(resolvedRunDirectory, "baseline/baseline.lock.json"),
        "utf8"
      )
    ) as BaselineLock;
    baselineBytes = readFileSync(
      resolve(resolvedRunDirectory, "baseline/baseline.json")
    );
    baseline = JSON.parse(baselineBytes.toString("utf8")) as FrozenBaseline;
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: "LOCK_READ_ERROR",
          path: "baseline/",
          summary: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  let resumePath: string;
  let jobPath: string;
  try {
    resumePath = insideRunDirectory(
      resolvedRunDirectory,
      lock.resumeRelativePath
    );
    jobPath = insideRunDirectory(resolvedRunDirectory, lock.jobRelativePath);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: "LOCK_PATH_INVALID",
          path: "baseline/baseline.lock.json",
          summary: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }

  const directChecks: BaselineVerificationIssue[] = [];
  if (sha256(baselineBytes) !== lock.baselineFileHash) {
    directChecks.push({
      code: "BASELINE_HASH_MISMATCH",
      path: "baseline/baseline.json",
      summary: "baseline.json 已被修改。"
    });
  }
  if (fileHash(resumePath) !== lock.resumeFileHash) {
    directChecks.push({
      code: "RESUME_HASH_MISMATCH",
      path: lock.resumeRelativePath,
      summary: "冻结简历副本已被修改。"
    });
  }
  if (fileHash(jobPath) !== lock.jobFileHash) {
    directChecks.push({
      code: "JOB_HASH_MISMATCH",
      path: lock.jobRelativePath,
      summary: "冻结 JD 副本已被修改。"
    });
  }
  if (directChecks.length > 0) {
    return { ok: false, issues: directChecks };
  }

  const expectedBaselineId = computeBaselineId(
    lock.resumeFileHash,
    lock.jobFileHash,
    baseline.constraints
  );
  if (
    expectedBaselineId !== lock.baselineId ||
    expectedBaselineId !== baseline.baselineId ||
    lock.resumeFileHash !== baseline.resumeAst.resumeHash ||
    lock.jobFileHash !== baseline.jobSnapshot.jobHash
  ) {
    return {
      ok: false,
      issues: [
        {
          code: "BASELINE_ID_MISMATCH",
          path: "baseline/baseline.lock.json",
          summary: "基线 ID 与冻结输入不一致。"
        }
      ]
    };
  }

  return { ok: true, issues: [] };
}
