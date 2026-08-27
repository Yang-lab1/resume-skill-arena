import { stableId } from "./hash.js";
import type { FactSnapshot, ResumeAst } from "./types.js";

export function createFactSnapshot(resumeAst: ResumeAst): FactSnapshot {
  return {
    schemaVersion: "0.1",
    factSnapshotId: stableId("facts", resumeAst.resumeId, "0.1"),
    resumeId: resumeAst.resumeId,
    resumeHash: resumeAst.resumeHash,
    evidenceUnits: resumeAst.blocks.map((block) => ({
      evidenceId: stableId("evidence", block.blockId),
      sourceBlockId: block.blockId,
      sourceRef: block.structuralPath,
      quote: block.text,
      lockStatus: "LOCKED"
    }))
  };
}
