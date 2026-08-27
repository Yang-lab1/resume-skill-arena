import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createDecisionLog } from "./decision-log.js";
import { CompositionStore, DecisionLogStore } from "./store.js";

describe("P4 local stores", () => {
  it("persists a decision log and refuses to overwrite a composition", () => {
    const runDirectory = mkdtempSync(join(tmpdir(), "resume-studio-decisions-"));
    const log = createDecisionLog({
      decisionLogId: "decision:store:001",
      baselineId: "baseline.test.001"
    });
    const decisionStore = new DecisionLogStore(runDirectory, log.decisionLogId);
    decisionStore.initialize(log);
    expect(decisionStore.read()).toEqual(log);

    const resume = {
      schemaVersion: "0.1" as const,
      finalResumeId: "final-resume.test.001",
      baselineId: log.baselineId,
      decisionLogId: log.decisionLogId,
      blocks: []
    };
    const compositionStore = new CompositionStore(
      runDirectory,
      "composition:store:001"
    );
    compositionStore.save(resume);
    expect(compositionStore.read()).toEqual(resume);
    expect(() => compositionStore.save(resume)).toThrow("已存在");
  });
});

