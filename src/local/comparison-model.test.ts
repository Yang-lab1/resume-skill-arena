import { describe, expect, it } from "vitest";

import type { FrozenBaseline } from "../baseline/types.js";
import { buildComparisonModel } from "./comparison-model.js";

const block = {
  blockId: "resume-block.real",
  index: 0,
  kind: "PARAGRAPH" as const,
  structuralPath: "word/document.xml#paragraph[7]",
  contentHash: "a".repeat(64),
  text: "负责真实产品需求分析与跨团队交付。"
};

const baseline = {
  resumeAst: { blocks: [block] }
} as unknown as FrozenBaseline;

describe("buildComparisonModel", () => {
  it("uses original text from the frozen resume block, never provider-supplied demo text", () => {
    const model = buildComparisonModel(baseline, [
      {
        changeSetId: "changeset.real",
        producer: { skillId: "resume-optimizer", skillVersion: "1.0.0", invocationId: "invoke.real" },
        changes: [
          {
            changeId: "change.real",
            sourceBlockRef: {
              blockId: block.blockId,
              structuralPath: block.structuralPath,
              contentHash: block.contentHash
            },
            originalText: "伪造的原文",
            proposedText: "负责产品需求分析，推动跨团队按期交付。",
            rationale: { summary: "增强动作与结果。", category: "CLARITY" },
            risk: { level: "SAFE", codes: ["NONE"], reason: "只调整表达。" },
            adoptionPolicy: "USER_SELECTABLE"
          }
        ]
      }
    ]);

    expect(model.blocks[0]?.originalText).toBe(block.text);
    expect(model.blocks[0]?.candidates[0]?.proposedText).toContain("跨团队");
  });

  it("returns no candidates when no real ChangeSet was produced", () => {
    expect(buildComparisonModel(baseline, []).blocks[0]?.candidates).toEqual([]);
  });

  it("rejects a candidate that cannot be mapped to the frozen baseline", () => {
    expect(() =>
      buildComparisonModel(baseline, [
        {
          changeSetId: "changeset.bad",
          producer: { skillId: "resume-optimizer", skillVersion: "1.0.0", invocationId: "invoke.bad" },
          changes: [{ changeId: "change.bad", sourceBlockRef: { blockId: "missing" } }]
        }
      ])
    ).toThrow("无法映射到冻结简历");
  });
});

