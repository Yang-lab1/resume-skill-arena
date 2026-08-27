import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OrchestrationRunStore, readOrchestrationRun } from "./run-store.js";

describe("OrchestrationRunStore", () => {
  it("keeps an identifiable RUNNING record for interrupted work", () => {
    const runDirectory = mkdtempSync(join(tmpdir(), "resume-studio-record-"));
    const record = {
      schemaVersion: "0.1" as const,
      orchestrationId: "orch:test:recoverable",
      baselineId: "baseline.test.001",
      status: "RUNNING" as const,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      providers: []
    };
    new OrchestrationRunStore(runDirectory, record.orchestrationId).initialize(record);

    expect(readOrchestrationRun(runDirectory, record.orchestrationId)).toEqual(record);
  });
});

