export type EvidenceSourceType =
  | "RESUME"
  | "USER_FACT"
  | "JOB_DESCRIPTION"
  | "USER_CONFIRMATION";

export interface ChangeEvidence {
  sourceType: EvidenceSourceType;
  sourceRef: string;
  quote: string;
}

export interface FactImpact {
  impactType: "NONE" | "REFRAME" | "MODIFY" | "ADD" | "REMOVE";
  approvalRequired: boolean;
}

export interface ChangeSetChange {
  changeId: string;
  sourceBlockRef: {
    blockId: string;
    structuralPath: string;
    contentHash: string;
  };
  originalText: string | null;
  resumeEvidence: ChangeEvidence[];
  factImpacts: FactImpact[];
  risk: { level: "SAFE" | "REVIEW_REQUIRED" | "BLOCKED" };
  adoptionPolicy:
    | "USER_SELECTABLE"
    | "EXPLICIT_USER_APPROVAL"
    | "PROHIBITED";
}

export interface ChangeSet {
  changes: ChangeSetChange[];
}
