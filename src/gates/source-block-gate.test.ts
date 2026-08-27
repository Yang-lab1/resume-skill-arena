import { describe, expect, it } from "vitest";

import type { FrozenBaseline } from "../baseline/types.js";
import { runSourceBlockGate } from "./source-block-gate.js";

const block = { blockId: "block.real", structuralPath: "p[3]", contentHash: "a".repeat(64), text: "真实原文" };
const baseline = { resumeAst: { blocks: [block] } } as unknown as FrozenBaseline;
const change = {
  changeId: "change.real",
  sourceBlockRef: { blockId: block.blockId, structuralPath: block.structuralPath, contentHash: block.contentHash },
  originalText: block.text,
  resumeEvidence: [{ sourceType: "RESUME", sourceRef: block.structuralPath, quote: block.text }]
};

describe("runSourceBlockGate", () => {
  it("accepts an exact frozen source block", () => {
    expect(runSourceBlockGate({ changes: [change] }, baseline).ok).toBe(true);
  });

  it("accepts the stable block id as the resume evidence source reference", () => {
    const withBlockIdEvidence = { ...change, resumeEvidence: [{ ...change.resumeEvidence[0], sourceRef: block.blockId }] };
    expect(runSourceBlockGate({ changes: [withBlockIdEvidence] }, baseline).ok).toBe(true);
  });

  it("rejects provider-supplied text that differs from the uploaded resume", () => {
    const result = runSourceBlockGate({ changes: [{ ...change, originalText: "演示原文" }] }, baseline);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("SOURCE_BLOCK_MISMATCH");
  });
});
