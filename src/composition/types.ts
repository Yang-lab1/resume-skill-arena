export type CompositionConflictCode =
  | "DECISION_BASELINE_MISMATCH"
  | "DECISION_REFERENCE_MISSING"
  | "CANDIDATE_INVALID"
  | "SOURCE_BLOCK_MISMATCH"
  | "UNSUPPORTED_MOVE"
  | "INSERT_SLOT_CONFLICT"
  | "INSERT_ANCHOR_DELETED";

export interface CompositionConflict {
  code: CompositionConflictCode;
  summary: string;
  sourceBlockId?: string;
  changeSetId?: string;
  changeId?: string;
}

export type BlockProvenance =
  | { type: "BASELINE"; sourceBlockId: string }
  | {
      type: "PROVIDER";
      sourceBlockId: string;
      changeSetId: string;
      changeId: string;
      decisionEventId: string;
    }
  | {
      type: "USER_EDIT";
      sourceBlockId: string;
      decisionEventId: string;
      basedOn?: { changeSetId: string; changeId: string };
    };

export interface ComposedResumeBlock {
  blockId: string;
  text: string;
  structuralPath: string;
  provenance: BlockProvenance;
}

export interface ComposedResume {
  schemaVersion: "0.1";
  finalResumeId: string;
  baselineId: string;
  decisionLogId: string;
  blocks: ComposedResumeBlock[];
}

export type CompositionResult =
  | { ok: true; resume: ComposedResume; conflicts: [] }
  | { ok: false; conflicts: CompositionConflict[] };

