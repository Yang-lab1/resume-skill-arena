export interface SourceDescriptor {
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
}

export interface BaselineBlock {
  blockId: string;
  index: number;
  kind: "PARAGRAPH" | "JOB_LINE";
  structuralPath: string;
  contentHash: string;
  text: string;
  styleName?: string;
}

export interface ResumeAst {
  schemaVersion: "0.1";
  resumeId: string;
  resumeHash: string;
  astVersion: "0.1";
  locale: string;
  source: SourceDescriptor;
  blocks: BaselineBlock[];
}

export interface JobSnapshot {
  schemaVersion: "0.1";
  jobId: string;
  jobHash: string;
  astVersion: "0.1";
  locale: string;
  source: SourceDescriptor;
  blocks: BaselineBlock[];
}

export interface FactEvidenceUnit {
  evidenceId: string;
  sourceBlockId: string;
  sourceRef: string;
  quote: string;
  lockStatus: "LOCKED";
}

export interface FactSnapshot {
  schemaVersion: "0.1";
  factSnapshotId: string;
  resumeId: string;
  resumeHash: string;
  evidenceUnits: FactEvidenceUnit[];
}

export interface BaselineConstraints {
  locale: string;
  maxPages: number;
  templateId?: string;
}

export interface FrozenBaseline {
  schemaVersion: "0.1";
  baselineId: string;
  runId: string;
  createdAt: string;
  constraints: BaselineConstraints;
  resumeAst: ResumeAst;
  jobSnapshot: JobSnapshot;
  factSnapshot: FactSnapshot;
}

export interface BaselineLock {
  schemaVersion: "0.1";
  baselineId: string;
  baselineFileHash: string;
  resumeFileHash: string;
  jobFileHash: string;
  resumeRelativePath: string;
  jobRelativePath: string;
}
