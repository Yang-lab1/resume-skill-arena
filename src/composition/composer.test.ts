import { describe, expect, it } from "vitest";

import { toChangeSetBaselineReference } from "../baseline/freeze.js";
import type { FrozenBaseline } from "../baseline/types.js";
import {
  appendDecision,
  appendUndo,
  createDecisionLog
} from "../decisions/decision-log.js";
import { composeResume } from "./composer.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const clock = () => new Date("2026-08-20T00:00:00.000Z");

function baseline(): FrozenBaseline {
  return {
    schemaVersion: "0.1",
    baselineId: "baseline.test.001",
    runId: "run.test.001",
    createdAt: clock().toISOString(),
    constraints: { locale: "zh-CN", maxPages: 1 },
    resumeAst: {
      schemaVersion: "0.1",
      resumeId: "resume.test.001",
      resumeHash: HASH_A,
      astVersion: "0.1",
      locale: "zh-CN",
      source: { originalName: "resume.docx", mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sizeBytes: 1, sha256: HASH_A },
      blocks: [
        { blockId: "block.test.001", index: 0, kind: "PARAGRAPH", structuralPath: "document.body[0]", contentHash: HASH_B, text: "原始经历" },
        { blockId: "block.test.002", index: 1, kind: "PARAGRAPH", structuralPath: "document.body[1]", contentHash: HASH_C, text: "第二段" }
      ]
    },
    jobSnapshot: {
      schemaVersion: "0.1",
      jobId: "job.test.001",
      jobHash: HASH_C,
      astVersion: "0.1",
      locale: "zh-CN",
      source: { originalName: "job.md", mediaType: "text/markdown", sizeBytes: 1, sha256: HASH_C },
      blocks: [{ blockId: "job-block.test.001", index: 0, kind: "JOB_LINE", structuralPath: "job.lines[0]", contentHash: HASH_C, text: "岗位要求" }]
    },
    factSnapshot: {
      schemaVersion: "0.1",
      factSnapshotId: "facts.test.001",
      resumeId: "resume.test.001",
      resumeHash: HASH_A,
      evidenceUnits: [{ evidenceId: "evidence.test.001", sourceBlockId: "block.test.001", sourceRef: "document.body[0]", quote: "原始经历", lockStatus: "LOCKED" }]
    }
  };
}

function candidate(id: string, changeId: string, proposedText: string, operation = "REPLACE", overrides: Record<string, unknown> = {}) {
  const frozen = baseline();
  const block = frozen.resumeAst.blocks[0]!;
  return {
    schemaVersion: "0.1",
    changeSetId: id,
    runId: frozen.runId,
    baseline: toChangeSetBaselineReference(frozen),
    producer: { skillId: `skill.${id}`, skillVersion: "0.1.0", adapterId: "test.adapter", adapterVersion: "0.1.0", invocationId: `invoke.${changeId}` },
    status: "VALID",
    createdAt: clock().toISOString(),
    changes: [{
      changeId,
      sourceBlockRef: { blockId: block.blockId, structuralPath: block.structuralPath, contentHash: block.contentHash },
      operation,
      originalText: operation === "INSERT" ? null : block.text,
      proposedText: operation === "REPLACE" || operation === "INSERT" ? proposedText : null,
      ...(operation === "INSERT" ? { insertPosition: "BEFORE" } : {}),
      ...(operation === "MOVE" ? { targetBlockRef: { blockId: "block.test.002", structuralPath: "document.body[1]", contentHash: HASH_C } } : {}),
      rationale: { summary: "测试建议", category: "CLARITY" },
      resumeEvidence: [{ evidenceId: `evidence.${changeId}`, sourceType: "RESUME", sourceRef: block.structuralPath, quote: block.text }],
      jobEvidence: [],
      factImpacts: [],
      risk: { level: "SAFE", codes: ["NONE"], reason: "测试" },
      adoptionPolicy: "USER_SELECTABLE",
      ...overrides
    }],
    validation: {
      schema: { status: "PASS", messages: [] }, baseline: { status: "PASS", messages: [] },
      facts: { status: "PASS", messages: [] }, evidence: { status: "PASS", messages: [] },
      length: { status: "NOT_RUN", messages: [] }, format: { status: "NOT_RUN", messages: [] }
    }
  };
}

function log() {
  return createDecisionLog({ decisionLogId: "decision.compose.001", baselineId: baseline().baselineId, now: clock });
}

describe("composeResume", () => {
  it("uses the latest selected provider and restores the prior one after undo", () => {
    const a = candidate("changeset.a.001", "change.a.001", "方案 A");
    const b = candidate("changeset.b.001", "change.b.001", "方案 B");
    let decisions = appendDecision(log(), { type: "SELECT", changeSetId: a.changeSetId, changeId: "change.a.001" }, clock);
    const resultA = composeResume({ baseline: baseline(), candidates: [a, b], decisionLog: decisions });
    decisions = appendDecision(decisions, { type: "SELECT", changeSetId: b.changeSetId, changeId: "change.b.001" }, clock);
    const resultB = composeResume({ baseline: baseline(), candidates: [a, b], decisionLog: decisions });
    const restored = composeResume({ baseline: baseline(), candidates: [a, b], decisionLog: appendUndo(decisions, clock) });

    expect(resultA.ok && resultA.resume.blocks[0]!.text).toBe("方案 A");
    expect(resultB.ok && resultB.resume.blocks[0]!.text).toBe("方案 B");
    expect(restored.ok && restored.resume.blocks[0]!.text).toBe("方案 A");
    expect(restored.ok).toBe(true);
    expect(resultA.ok).toBe(true);
    if (restored.ok && resultA.ok) {
      expect(restored.resume.finalResumeId).toBe(resultA.resume.finalResumeId);
    }
  });

  it("restores the prior state when the current candidate is rejected", () => {
    const a = candidate("changeset.a.002", "change.a.002", "方案 A");
    let decisions = appendDecision(log(), { type: "SELECT", changeSetId: a.changeSetId, changeId: "change.a.002" }, clock);
    decisions = appendDecision(decisions, { type: "REJECT", changeSetId: a.changeSetId, changeId: "change.a.002" }, clock);
    const result = composeResume({ baseline: baseline(), candidates: [a], decisionLog: decisions });

    expect(result.ok && result.resume.blocks[0]!.text).toBe("原始经历");
    expect(result.ok && result.resume.blocks[0]!.provenance.type).toBe("BASELINE");
  });

  it("records confirmed manual edits with USER_EDIT provenance", () => {
    const decisions = appendDecision(log(), { type: "EDIT", sourceBlockId: "block.test.001", proposedText: "用户确认后的文字", factConfirmed: true }, clock);
    const result = composeResume({ baseline: baseline(), candidates: [], decisionLog: decisions });

    expect(result.ok && result.resume.blocks[0]).toMatchObject({
      text: "用户确认后的文字",
      provenance: { type: "USER_EDIT" }
    });
  });

  it("blocks a manual edit that claims a missing candidate source", () => {
    const decisions = appendDecision(log(), {
      type: "EDIT",
      sourceBlockId: "block.test.001",
      proposedText: "用户编辑",
      factConfirmed: true,
      basedOn: { changeSetId: "changeset.missing", changeId: "change.missing" }
    }, clock);
    expect(composeResume({ baseline: baseline(), candidates: [], decisionLog: decisions })).toMatchObject({
      ok: false,
      conflicts: [{ code: "DECISION_REFERENCE_MISSING" }]
    });
  });

  it("blocks a candidate whose source block no longer matches the frozen baseline", () => {
    const bad = candidate("changeset.bad.001", "change.bad.001", "坏方案", "REPLACE", {
      sourceBlockRef: { blockId: "block.test.001", structuralPath: "document.body[0]", contentHash: "d".repeat(64) }
    });
    const decisions = appendDecision(log(), { type: "SELECT", changeSetId: bad.changeSetId, changeId: "change.bad.001" }, clock);
    const result = composeResume({ baseline: baseline(), candidates: [bad], decisionLog: decisions });

    expect(result).toMatchObject({ ok: false, conflicts: [{ code: "SOURCE_BLOCK_MISMATCH" }] });
  });

  it("does not let a rejected invalid candidate block the restored baseline", () => {
    const bad = candidate("changeset.bad.002", "change.bad.002", "坏方案", "REPLACE", {
      sourceBlockRef: { blockId: "block.test.001", structuralPath: "document.body[0]", contentHash: "d".repeat(64) }
    });
    let decisions = appendDecision(log(), { type: "SELECT", changeSetId: bad.changeSetId, changeId: "change.bad.002" }, clock);
    decisions = appendDecision(decisions, { type: "REJECT", changeSetId: bad.changeSetId, changeId: "change.bad.002" }, clock);
    const result = composeResume({ baseline: baseline(), candidates: [bad], decisionLog: decisions });

    expect(result.ok && result.resume.blocks[0]!.text).toBe("原始经历");
  });

  it("blocks ambiguous MOVE and competing INSERT decisions", () => {
    const move = candidate("changeset.move.001", "change.move.001", "", "MOVE");
    const insertA = candidate("changeset.insert.a", "change.insert.a", "插入 A", "INSERT");
    const insertB = candidate("changeset.insert.b", "change.insert.b", "插入 B", "INSERT");
    let moveLog = appendDecision(log(), { type: "SELECT", changeSetId: move.changeSetId, changeId: "change.move.001" }, clock);
    let insertLog = appendDecision(log(), { type: "SELECT", changeSetId: insertA.changeSetId, changeId: "change.insert.a" }, clock);
    insertLog = appendDecision(insertLog, { type: "SELECT", changeSetId: insertB.changeSetId, changeId: "change.insert.b" }, clock);

    expect(composeResume({ baseline: baseline(), candidates: [move], decisionLog: moveLog })).toMatchObject({ ok: false, conflicts: [{ code: "UNSUPPORTED_MOVE" }] });
    expect(composeResume({ baseline: baseline(), candidates: [insertA, insertB], decisionLog: insertLog })).toMatchObject({ ok: false, conflicts: [{ code: "INSERT_SLOT_CONFLICT" }] });
  });

  it("composes an unambiguous insert and a selected deletion", () => {
    const insert = candidate("changeset.insert.ok", "change.insert.ok", "新增段落", "INSERT");
    let insertDecisions = appendDecision(log(), { type: "SELECT", changeSetId: insert.changeSetId, changeId: "change.insert.ok" }, clock);
    const inserted = composeResume({ baseline: baseline(), candidates: [insert], decisionLog: insertDecisions });
    expect(inserted.ok && inserted.resume.blocks.map((block) => block.text)).toEqual([
      "新增段落",
      "原始经历",
      "第二段"
    ]);

    const deletion = candidate("changeset.delete.ok", "change.delete.ok", "", "DELETE");
    const deleteDecisions = appendDecision(log(), { type: "SELECT", changeSetId: deletion.changeSetId, changeId: "change.delete.ok" }, clock);
    const deleted = composeResume({ baseline: baseline(), candidates: [deletion], decisionLog: deleteDecisions });
    expect(deleted.ok && deleted.resume.blocks.map((block) => block.text)).toEqual(["第二段"]);
  });
});
