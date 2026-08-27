import { stableId } from "../baseline/hash.js";
import type { Provider } from "./types.js";

export type RationaleCategory =
  | "CLARITY"
  | "ATS"
  | "STRUCTURE"
  | "EVIDENCE_QUALITY";

export interface ReferenceProviderOptions {
  id: string;
  name: string;
  rationaleCategory: RationaleCategory;
}

export function createReferenceProvider(
  options: ReferenceProviderOptions
): Provider {
  return {
    manifest: {
      id: options.id,
      name: options.name,
      version: "0.1.0",
      adapterId: "resume-studio-reference",
      adapterVersion: "0.1.0",
      enabled: true,
      referenceOnly: true
    },
    execute: async (context) => {
      const block = context.baseline.resumeAst.blocks[0];
      if (!block) {
        throw new Error("冻结简历没有可用区块。");
      }
      return {
        schemaVersion: "0.1",
        changeSetId: stableId(
          "changeset",
          context.orchestrationId,
          options.id
        ),
        runId: context.baseline.runId,
        baseline: { ...context.baselineReference },
        producer: {
          skillId: options.id,
          skillVersion: "0.1.0",
          adapterId: "resume-studio-reference",
          adapterVersion: "0.1.0",
          invocationId: context.invocationId
        },
        status: "VALID",
        createdAt: context.baseline.createdAt,
        summary: "P3 流程验证候选：保留原始区块，不代表正式优化建议。",
        changes: [
          {
            changeId: stableId("change", options.id, block.blockId),
            sourceBlockRef: {
              blockId: block.blockId,
              structuralPath: block.structuralPath,
              contentHash: block.contentHash
            },
            operation: "KEEP",
            originalText: block.text,
            proposedText: null,
            rationale: {
              summary: "参考 Provider 仅用于验证同源编排和结果门禁。",
              category: options.rationaleCategory
            },
            resumeEvidence: [
              {
                evidenceId: stableId("evidence", options.id, block.blockId),
                sourceType: "RESUME",
                sourceRef: block.structuralPath,
                quote: block.text
              }
            ],
            jobEvidence: [],
            factImpacts: [],
            risk: {
              level: "SAFE",
              codes: ["NONE"],
              reason: "未修改冻结基线中的任何事实或文字。"
            },
            adoptionPolicy: "USER_SELECTABLE"
          }
        ],
        validation: {
          schema: { status: "PASS", messages: [] },
          baseline: { status: "PASS", messages: [] },
          facts: { status: "PASS", messages: [] },
          evidence: { status: "PASS", messages: [] },
          length: { status: "NOT_RUN", messages: ["候选阶段尚未执行分页检查。"] },
          format: { status: "NOT_RUN", messages: ["候选阶段尚未渲染文件。"] }
        }
      };
    }
  };
}

export function createDefaultReferenceProviders(): Provider[] {
  return [
    createReferenceProvider({
      id: "reference-clarity",
      name: "清晰度参考方案",
      rationaleCategory: "CLARITY"
    }),
    createReferenceProvider({
      id: "reference-ats",
      name: "ATS 参考方案",
      rationaleCategory: "ATS"
    }),
    createReferenceProvider({
      id: "reference-structure",
      name: "结构参考方案",
      rationaleCategory: "STRUCTURE"
    })
  ];
}

