import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { ComposedResume } from "../composition/types.js";
import type { DecisionLog } from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function safeDirectoryId(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error(`本地记录 ID 格式无效：${id}`);
  return id.replaceAll(":", "%3A");
}

function atomicJsonWrite(path: string, value: unknown): void {
  const temporaryDirectory = mkdtempSync(join(dirname(path), ".write-"));
  const temporaryPath = join(temporaryDirectory, "value.json");
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export class DecisionLogStore {
  readonly directory: string;
  readonly path: string;

  constructor(runDirectory: string, decisionLogId: string) {
    this.directory = resolve(
      runDirectory,
      "decisions",
      safeDirectoryId(decisionLogId)
    );
    this.path = join(this.directory, "decision-log.json");
  }

  initialize(log: DecisionLog): void {
    if (existsSync(this.directory)) {
      throw new Error(`决策日志目录已存在：${this.directory}`);
    }
    mkdirSync(this.directory, { recursive: true });
    atomicJsonWrite(this.path, log);
  }

  update(log: DecisionLog): void {
    if (!existsSync(this.path)) throw new Error("决策日志不存在，不能更新。");
    atomicJsonWrite(this.path, log);
  }

  read(): DecisionLog {
    if (statSync(this.path).size > 20 * 1024 * 1024) {
      throw new Error("决策日志超过 20 MiB 限制。");
    }
    return JSON.parse(readFileSync(this.path, "utf8")) as DecisionLog;
  }
}

export class CompositionStore {
  readonly directory: string;
  readonly path: string;

  constructor(runDirectory: string, compositionId: string) {
    this.directory = resolve(
      runDirectory,
      "compositions",
      safeDirectoryId(compositionId)
    );
    this.path = join(this.directory, "composed-resume.json");
  }

  save(resume: ComposedResume): void {
    if (existsSync(this.directory)) {
      throw new Error(`合成结果目录已存在：${this.directory}`);
    }
    mkdirSync(this.directory, { recursive: true });
    atomicJsonWrite(this.path, resume);
  }

  read(): ComposedResume {
    if (statSync(this.path).size > 50 * 1024 * 1024) {
      throw new Error("合成结果超过 50 MiB 限制。");
    }
    return JSON.parse(readFileSync(this.path, "utf8")) as ComposedResume;
  }
}
