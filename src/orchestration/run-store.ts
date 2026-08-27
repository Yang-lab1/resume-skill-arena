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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type {
  ChangeSetCandidate,
  OrchestrationRunRecord
} from "./types.js";

function safeId(id: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(id)) {
    throw new Error(`编排 ID 格式无效：${id}`);
  }
}

function windowsSafeId(id: string): string {
  return id.replaceAll(":", "%3A");
}

function atomicJsonWrite(path: string, value: unknown): void {
  const directory = dirname(path);
  const temporaryDirectory = mkdtempSync(join(directory, ".write-"));
  const temporaryPath = join(temporaryDirectory, "value.json");
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export class OrchestrationRunStore {
  readonly directory: string;
  readonly candidatesDirectory: string;
  readonly recordPath: string;

  constructor(runDirectory: string, orchestrationId: string) {
    safeId(orchestrationId);
    this.directory = resolve(
      runDirectory,
      "orchestration",
      windowsSafeId(orchestrationId)
    );
    this.candidatesDirectory = join(this.directory, "candidates");
    this.recordPath = join(this.directory, "run.json");
  }

  initialize(record: OrchestrationRunRecord): void {
    if (existsSync(this.directory)) {
      throw new Error(`编排运行目录已存在：${this.directory}`);
    }
    mkdirSync(this.candidatesDirectory, { recursive: true });
    atomicJsonWrite(this.recordPath, record);
  }

  update(record: OrchestrationRunRecord): void {
    atomicJsonWrite(this.recordPath, record);
  }

  saveCandidate(providerId: string, candidate: ChangeSetCandidate): string {
    safeId(providerId);
    const fileName = `${windowsSafeId(providerId)}.json`;
    const path = join(this.candidatesDirectory, fileName);
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    return `candidates/${fileName}`;
  }

  read(): OrchestrationRunRecord {
    return JSON.parse(readFileSync(this.recordPath, "utf8")) as OrchestrationRunRecord;
  }
}

export function readOrchestrationRun(
  runDirectory: string,
  orchestrationId: string
): OrchestrationRunRecord {
  return new OrchestrationRunStore(runDirectory, orchestrationId).read();
}

export function loadOrchestrationCandidates(
  runDirectory: string,
  orchestrationId: string
): unknown[] {
  const store = new OrchestrationRunStore(runDirectory, orchestrationId);
  const record = store.read();
  const paths = record.providers
    .filter((provider) => provider.status === "SUCCESS" && provider.candidatePath)
    .map((provider) => provider.candidatePath!);
  if (paths.length > 5) throw new Error("运行记录包含超过 5 个候选文件。");
  return paths.map((candidatePath) => {
    const path = resolve(store.directory, candidatePath);
    const relation = relative(store.directory, path);
    if (relation.startsWith("..") || isAbsolute(relation)) {
      throw new Error("候选文件路径超出编排目录。");
    }
    if (statSync(path).size > 20 * 1024 * 1024) {
      throw new Error("候选文件超过 20 MiB 限制。");
    }
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  });
}
