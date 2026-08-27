import type { FrozenBaseline } from "../baseline/types.js";

export interface ComparisonCandidate {
  changeId: string;
  skillId: string;
  skillVersion: string;
  invocationId: string;
  proposedText: string | null;
  rationale: string;
  category: string;
  riskLevel: string;
  adoptionPolicy: string;
}

export interface ComparisonBlock {
  blockId: string;
  structuralPath: string;
  originalText: string;
  candidates: ComparisonCandidate[];
}

export interface ComparisonModel {
  blocks: ComparisonBlock[];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function buildComparisonModel(
  baseline: FrozenBaseline,
  candidates: readonly Record<string, unknown>[]
): ComparisonModel {
  const blocks = baseline.resumeAst.blocks.map<ComparisonBlock>((block) => ({
    blockId: block.blockId,
    structuralPath: block.structuralPath,
    originalText: block.text,
    candidates: []
  }));
  const blockById = new Map(blocks.map((block) => [block.blockId, block]));

  for (const candidate of candidates) {
    const producer = record(candidate.producer);
    const changes = Array.isArray(candidate.changes) ? candidate.changes : [];
    for (const rawChange of changes) {
      const change = record(rawChange);
      const sourceBlockRef = record(change.sourceBlockRef);
      const blockId = sourceBlockRef.blockId;
      const target = typeof blockId === "string" ? blockById.get(blockId) : undefined;
      if (!target) {
        throw new Error("Skill 结果无法映射到冻结简历。");
      }
      const rationale = record(change.rationale);
      const risk = record(change.risk);
      target.candidates.push({
        changeId: String(change.changeId ?? ""),
        skillId: String(producer.skillId ?? ""),
        skillVersion: String(producer.skillVersion ?? ""),
        invocationId: String(producer.invocationId ?? ""),
        proposedText: typeof change.proposedText === "string" ? change.proposedText : null,
        rationale: String(rationale.summary ?? ""),
        category: String(rationale.category ?? ""),
        riskLevel: String(risk.level ?? ""),
        adoptionPolicy: String(change.adoptionPolicy ?? "")
      });
    }
  }

  return { blocks };
}

