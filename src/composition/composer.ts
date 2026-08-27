import {
  toChangeSetBaselineReference,
  type ChangeSetBaselineReference
} from "../baseline/freeze.js";
import { stableId, stableStringify } from "../baseline/hash.js";
import type { BaselineBlock, FrozenBaseline } from "../baseline/types.js";
import { validateChangeSetSchema } from "../contracts/validate-schema.js";
import { activeDecisionEvents } from "../decisions/decision-log.js";
import type {
  ChangeReference,
  DecisionLog,
  EditDecisionEvent,
  SelectDecisionEvent
} from "../decisions/types.js";
import { runBaselineMatchGate } from "../gates/baseline-match-gate.js";
import { runSemanticGates } from "../gates/run-gates.js";
import type {
  BlockProvenance,
  ComposedResumeBlock,
  CompositionConflict,
  CompositionResult
} from "./types.js";

type Operation = "REPLACE" | "INSERT" | "DELETE" | "MOVE" | "KEEP";

interface CandidateChange {
  changeId: string;
  sourceBlockRef: {
    blockId: string;
    structuralPath: string;
    contentHash: string;
  };
  operation: Operation;
  originalText: string | null;
  proposedText: string | null;
  insertPosition?: "BEFORE" | "AFTER" | "FIRST_CHILD" | "LAST_CHILD";
  targetBlockRef?: {
    blockId: string;
    structuralPath: string;
    contentHash: string;
  };
}

interface CandidateDocument {
  changeSetId: string;
  baseline: ChangeSetBaselineReference;
  changes: CandidateChange[];
}

interface CandidateEntry extends ChangeReference {
  change: CandidateChange;
  valid: boolean;
  conflict?: CompositionConflict;
}

interface ProviderAction {
  kind: "PROVIDER";
  entry: CandidateEntry;
  event: SelectDecisionEvent;
}

interface EditAction {
  kind: "USER_EDIT";
  event: EditDecisionEvent;
}

type BlockAction = ProviderAction | EditAction;

function referenceKey(reference: ChangeReference): string {
  return `${reference.changeSetId}\u0000${reference.changeId}`;
}

function blockMatches(reference: CandidateChange["sourceBlockRef"], block: BaselineBlock): boolean {
  return (
    reference.blockId === block.blockId &&
    reference.structuralPath === block.structuralPath &&
    reference.contentHash === block.contentHash
  );
}

function validateEntry(
  document: CandidateDocument,
  change: CandidateChange,
  baseline: FrozenBaseline,
  candidateValid: boolean
): CandidateEntry {
  const entry = {
    changeSetId: document.changeSetId,
    changeId: change.changeId,
    change,
    valid: candidateValid
  } satisfies CandidateEntry;
  if (!candidateValid) {
    return {
      ...entry,
      conflict: {
        code: "CANDIDATE_INVALID",
        summary: "候选方案未通过结构、事实或基线门禁。",
        changeSetId: entry.changeSetId,
        changeId: entry.changeId
      }
    };
  }
  const block = baseline.resumeAst.blocks.find(
    (item) => item.blockId === change.sourceBlockRef.blockId
  );
  const originalMatches =
    change.operation === "INSERT"
      ? change.originalText === null
      : change.originalText === block?.text;
  if (!block || !blockMatches(change.sourceBlockRef, block) || !originalMatches) {
    return {
      ...entry,
      valid: false,
      conflict: {
        code: "SOURCE_BLOCK_MISMATCH",
        summary: "候选建议引用的源区块与冻结简历不一致。",
        sourceBlockId: change.sourceBlockRef.blockId,
        changeSetId: entry.changeSetId,
        changeId: entry.changeId
      }
    };
  }
  return entry;
}

function buildIndex(
  inputs: readonly unknown[],
  baseline: FrozenBaseline
): Map<string, CandidateEntry> {
  const expected = toChangeSetBaselineReference(baseline);
  const index = new Map<string, CandidateEntry>();
  const changeSetCounts = new Map<string, number>();
  inputs.forEach((input) => {
    const id = (input as { changeSetId?: unknown }).changeSetId;
    if (typeof id === "string") {
      changeSetCounts.set(id, (changeSetCounts.get(id) ?? 0) + 1);
    }
  });
  inputs.forEach((input) => {
    const document = input as CandidateDocument;
    const candidateValid =
      validateChangeSetSchema(input).ok &&
      runSemanticGates(input).ok &&
      runBaselineMatchGate(input, expected).ok &&
      changeSetCounts.get(document.changeSetId) === 1;
    if (!Array.isArray(document.changes)) return;
    document.changes.forEach((change) => {
      const entry = validateEntry(document, change, baseline, candidateValid);
      const key = referenceKey(entry);
      if (index.has(key)) {
        index.set(key, {
          ...entry,
          valid: false,
          conflict: {
            code: "CANDIDATE_INVALID",
            summary: "候选 Change 引用重复，无法确定唯一来源。",
            changeSetId: entry.changeSetId,
            changeId: entry.changeId
          }
        });
      } else {
        index.set(key, entry);
      }
    });
  });
  return index;
}

function missingReference(reference: ChangeReference): CompositionConflict {
  return {
    code: "DECISION_REFERENCE_MISSING",
    summary: "决策引用的候选建议不存在。",
    changeSetId: reference.changeSetId,
    changeId: reference.changeId
  };
}

function provenanceForProvider(action: ProviderAction): BlockProvenance {
  return {
    type: "PROVIDER",
    sourceBlockId: action.entry.change.sourceBlockRef.blockId,
    changeSetId: action.entry.changeSetId,
    changeId: action.entry.changeId,
    decisionEventId: action.event.eventId
  };
}

export interface ComposeResumeOptions {
  baseline: FrozenBaseline;
  candidates: readonly unknown[];
  decisionLog: DecisionLog;
}

export function composeResume(options: ComposeResumeOptions): CompositionResult {
  if (options.decisionLog.baselineId !== options.baseline.baselineId) {
    return {
      ok: false,
      conflicts: [{
        code: "DECISION_BASELINE_MISMATCH",
        summary: "决策日志不属于当前冻结基线。"
      }]
    };
  }
  const index = buildIndex(options.candidates, options.baseline);
  const stacks = new Map<string, BlockAction[]>();
  const inserts = new Map<string, ProviderAction>();
  const unresolvedReferences = new Map<string, CompositionConflict>();
  const conflicts: CompositionConflict[] = [];

  activeDecisionEvents(options.decisionLog).forEach((event) => {
    if (event.type === "EDIT") {
      if (!options.baseline.resumeAst.blocks.some((block) => block.blockId === event.sourceBlockId)) {
        conflicts.push({
          code: "SOURCE_BLOCK_MISMATCH",
          summary: "手动编辑引用的源区块不存在。",
          sourceBlockId: event.sourceBlockId
        });
        return;
      }
      const stack = stacks.get(event.sourceBlockId) ?? [];
      stack.push({ kind: "USER_EDIT", event });
      stacks.set(event.sourceBlockId, stack);
      return;
    }

    const key = referenceKey(event);
    const entry = index.get(key);
    if (!entry) {
      if (event.type === "REJECT") unresolvedReferences.delete(key);
      else unresolvedReferences.set(key, missingReference(event));
      return;
    }
    if (event.type === "REJECT") {
      unresolvedReferences.delete(key);
      if (entry.change.operation === "INSERT") {
        inserts.delete(key);
      } else {
        const stack = stacks.get(entry.change.sourceBlockRef.blockId) ?? [];
        stacks.set(
          entry.change.sourceBlockRef.blockId,
          stack.filter(
            (action) =>
              action.kind !== "PROVIDER" || referenceKey(action.entry) !== key
          )
        );
      }
      return;
    }
    unresolvedReferences.delete(key);
    const action: ProviderAction = { kind: "PROVIDER", entry, event };
    if (entry.change.operation === "INSERT") {
      inserts.set(key, action);
    } else {
      const blockId = entry.change.sourceBlockRef.blockId;
      const stack = stacks.get(blockId) ?? [];
      stack.push(action);
      stacks.set(blockId, stack);
    }
  });

  conflicts.push(...unresolvedReferences.values());

  const insertSlots = new Map<string, ProviderAction[]>();
  inserts.forEach((action) => {
    if (!action.entry.valid) {
      conflicts.push(action.entry.conflict ?? missingReference(action.entry));
      return;
    }
    const position = action.entry.change.insertPosition;
    if (position !== "BEFORE" && position !== "AFTER") {
      conflicts.push({
        code: "CANDIDATE_INVALID",
        summary: "当前合成器只支持在区块前后插入。",
        sourceBlockId: action.entry.change.sourceBlockRef.blockId
      });
      return;
    }
    const slot = `${action.entry.change.sourceBlockRef.blockId}\u0000${position}`;
    const values = insertSlots.get(slot) ?? [];
    values.push(action);
    insertSlots.set(slot, values);
  });
  insertSlots.forEach((actions) => {
    if (actions.length > 1) {
      conflicts.push({
        code: "INSERT_SLOT_CONFLICT",
        summary: "同一位置存在多个插入方案，需要先保留一个。",
        sourceBlockId: actions[0]!.entry.change.sourceBlockRef.blockId
      });
    }
  });

  stacks.forEach((actions, blockId) => {
    const current = actions.at(-1);
    if (current?.kind === "USER_EDIT" && current.event.basedOn) {
      const source = index.get(referenceKey(current.event.basedOn));
      if (!source) {
        conflicts.push(missingReference(current.event.basedOn));
        return;
      }
      if (
        !source.valid ||
        source.change.sourceBlockRef.blockId !== current.event.sourceBlockId
      ) {
        conflicts.push(
          source.conflict ?? {
            code: "SOURCE_BLOCK_MISMATCH",
            summary: "手动编辑标记的来源候选不属于当前区块。",
            sourceBlockId: current.event.sourceBlockId,
            changeSetId: current.event.basedOn.changeSetId,
            changeId: current.event.basedOn.changeId
          }
        );
        return;
      }
    }
    if (current?.kind === "PROVIDER" && !current.entry.valid) {
      conflicts.push(current.entry.conflict ?? missingReference(current.entry));
      return;
    }
    if (current?.kind === "PROVIDER" && current.entry.change.operation === "MOVE") {
      conflicts.push({
        code: "UNSUPPORTED_MOVE",
        summary: "MOVE 没有明确的前后位置，当前版本不会猜测移动结果。",
        sourceBlockId: blockId,
        changeSetId: current.entry.changeSetId,
        changeId: current.entry.changeId
      });
    }
    if (current?.kind === "PROVIDER" && current.entry.change.operation === "DELETE") {
      if (insertSlots.has(`${blockId}\u0000BEFORE`) || insertSlots.has(`${blockId}\u0000AFTER`)) {
        conflicts.push({
          code: "INSERT_ANCHOR_DELETED",
          summary: "插入方案依赖的锚点同时被删除。",
          sourceBlockId: blockId
        });
      }
    }
  });

  if (conflicts.length > 0) return { ok: false, conflicts };

  const blocks: ComposedResumeBlock[] = [];
  const pushInsert = (anchor: BaselineBlock, position: "BEFORE" | "AFTER") => {
    const action = insertSlots.get(`${anchor.blockId}\u0000${position}`)?.[0];
    if (!action) return;
    blocks.push({
      blockId: stableId("inserted-block", action.entry.changeSetId, action.entry.changeId),
      text: action.entry.change.proposedText!,
      structuralPath: `${anchor.structuralPath}.${position.toLowerCase()}`,
      provenance: provenanceForProvider(action)
    });
  };

  options.baseline.resumeAst.blocks.forEach((block) => {
    pushInsert(block, "BEFORE");
    const current = stacks.get(block.blockId)?.at(-1);
    if (!current) {
      blocks.push({
        blockId: block.blockId,
        text: block.text,
        structuralPath: block.structuralPath,
        provenance: { type: "BASELINE", sourceBlockId: block.blockId }
      });
    } else if (current.kind === "USER_EDIT") {
      blocks.push({
        blockId: block.blockId,
        text: current.event.proposedText,
        structuralPath: block.structuralPath,
        provenance: {
          type: "USER_EDIT",
          sourceBlockId: block.blockId,
          decisionEventId: current.event.eventId,
          ...(current.event.basedOn ? { basedOn: current.event.basedOn } : {})
        }
      });
    } else if (current.entry.change.operation !== "DELETE") {
      blocks.push({
        blockId: block.blockId,
        text:
          current.entry.change.operation === "REPLACE"
            ? current.entry.change.proposedText!
            : block.text,
        structuralPath: block.structuralPath,
        provenance: provenanceForProvider(current)
      });
    }
    pushInsert(block, "AFTER");
  });

  const identity = blocks.map((block) => ({
    blockId: block.blockId,
    text: block.text,
    provenance:
      block.provenance.type === "PROVIDER"
        ? {
            type: block.provenance.type,
            changeSetId: block.provenance.changeSetId,
            changeId: block.provenance.changeId
          }
        : { type: block.provenance.type, sourceBlockId: block.provenance.sourceBlockId }
  }));
  return {
    ok: true,
    conflicts: [],
    resume: {
      schemaVersion: "0.1",
      finalResumeId: stableId(
        "final-resume",
        options.baseline.baselineId,
        stableStringify(identity)
      ),
      baselineId: options.baseline.baselineId,
      decisionLogId: options.decisionLog.decisionLogId,
      blocks
    }
  };
}
