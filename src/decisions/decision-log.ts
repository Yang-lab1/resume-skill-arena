import { stableId, stableStringify } from "../baseline/hash.js";
import type {
  DecisionEvent,
  DecisionInput,
  DecisionLog,
  OrdinaryDecisionEvent,
  UndoDecisionEvent
} from "./types.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const MAX_DECISION_EVENTS = 10_000;

export interface CreateDecisionLogOptions {
  decisionLogId: string;
  baselineId: string;
  now?: () => Date;
}

function assertId(value: string, label: string): void {
  if (!ID_PATTERN.test(value)) throw new Error(`${label} 格式无效。`);
}

function assertReference(reference: { changeSetId: string; changeId: string }): void {
  assertId(reference.changeSetId, "changeSetId");
  assertId(reference.changeId, "changeId");
}

function eventPayload(event: DecisionEvent): DecisionInput | { type: "UNDO"; targetEventId: string } {
  if (event.type === "SELECT" || event.type === "REJECT") {
    return {
      type: event.type,
      changeSetId: event.changeSetId,
      changeId: event.changeId
    };
  }
  if (event.type === "EDIT") {
    return {
      type: "EDIT",
      sourceBlockId: event.sourceBlockId,
      proposedText: event.proposedText,
      factConfirmed: event.factConfirmed,
      ...(event.basedOn ? { basedOn: event.basedOn } : {})
    };
  }
  return { type: "UNDO", targetEventId: event.targetEventId };
}

function validateLog(log: DecisionLog): void {
  if (log.schemaVersion !== "0.1") throw new Error("决策日志版本不受支持。");
  assertId(log.decisionLogId, "decisionLogId");
  assertId(log.baselineId, "baselineId");
  if (!Array.isArray(log.events) || log.events.length > MAX_DECISION_EVENTS) {
    throw new Error(`单个决策日志最多 ${MAX_DECISION_EVENTS} 个事件。`);
  }
  const ids = new Set<string>();
  const ordinaryIds = new Set<string>();
  const undoneIds = new Set<string>();
  log.events.forEach((event, index) => {
    assertId(event.eventId, "eventId");
    if (event.sequence !== index + 1) throw new Error("决策事件序号不连续。");
    if (event.baselineId !== log.baselineId) throw new Error("决策事件引用了其他基线。");
    if (ids.has(event.eventId)) throw new Error("决策事件 ID 重复。");
    if (Number.isNaN(Date.parse(event.createdAt))) throw new Error("决策事件时间格式无效。");
    if (event.type === "SELECT" || event.type === "REJECT") {
      assertReference(event);
      ordinaryIds.add(event.eventId);
    } else if (event.type === "EDIT") {
      assertId(event.sourceBlockId, "sourceBlockId");
      if (event.factConfirmed !== true) throw new Error("手动编辑缺少事实确认。");
      if (
        typeof event.proposedText !== "string" ||
        !event.proposedText.trim() ||
        event.proposedText.length > 20_000
      ) {
        throw new Error("手动编辑文字必须为 1 到 20,000 字。");
      }
      if (event.basedOn) assertReference(event.basedOn);
      ordinaryIds.add(event.eventId);
    } else if (event.type === "UNDO") {
      assertId(event.targetEventId, "targetEventId");
      if (!ordinaryIds.has(event.targetEventId) || undoneIds.has(event.targetEventId)) {
        throw new Error("UNDO 必须引用一个尚未撤销的较早决策。 ");
      }
      undoneIds.add(event.targetEventId);
    } else {
      throw new Error("决策事件类型无效。");
    }
    const expectedId = stableId(
      "decision-event",
      log.decisionLogId,
      String(event.sequence),
      stableStringify(eventPayload(event))
    );
    if (event.eventId !== expectedId) throw new Error("决策事件内容或 ID 已被修改。");
    ids.add(event.eventId);
  });
}

export function createDecisionLog(options: CreateDecisionLogOptions): DecisionLog {
  assertId(options.decisionLogId, "decisionLogId");
  assertId(options.baselineId, "baselineId");
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  return {
    schemaVersion: "0.1",
    decisionLogId: options.decisionLogId,
    baselineId: options.baselineId,
    createdAt: timestamp,
    updatedAt: timestamp,
    events: []
  };
}

function appendEvent(
  log: DecisionLog,
  event: DecisionInput | { type: "UNDO"; targetEventId: string },
  now: () => Date
): DecisionLog {
  validateLog(log);
  if (log.events.length >= MAX_DECISION_EVENTS) {
    throw new Error(`单个决策日志最多 ${MAX_DECISION_EVENTS} 个事件。`);
  }
  const sequence = log.events.length + 1;
  const createdAt = now().toISOString();
  const fullEvent = {
    ...event,
    eventId: stableId(
      "decision-event",
      log.decisionLogId,
      String(sequence),
      stableStringify(event)
    ),
    sequence,
    baselineId: log.baselineId,
    createdAt
  } as DecisionEvent;
  return { ...log, updatedAt: createdAt, events: [...log.events, fullEvent] };
}

export function appendDecision(
  log: DecisionLog,
  input: DecisionInput,
  now: () => Date = () => new Date()
): DecisionLog {
  if (input.type === "EDIT") {
    if (!input.factConfirmed) throw new Error("手动编辑前必须确认事实。");
    if (!input.proposedText.trim() || input.proposedText.length > 20_000) {
      throw new Error("手动编辑文字必须为 1 到 20,000 字。");
    }
    assertId(input.sourceBlockId, "sourceBlockId");
    if (input.basedOn) assertReference(input.basedOn);
  } else {
    assertReference(input);
  }
  return appendEvent(log, input, now);
}

export function appendUndo(
  log: DecisionLog,
  now: () => Date = () => new Date()
): DecisionLog {
  validateLog(log);
  const undone = new Set(
    log.events
      .filter((event): event is UndoDecisionEvent => event.type === "UNDO")
      .map((event) => event.targetEventId)
  );
  const target = [...log.events]
    .reverse()
    .find((event) => event.type !== "UNDO" && !undone.has(event.eventId));
  if (!target) throw new Error("没有可撤销的决策。");
  return appendEvent(log, { type: "UNDO", targetEventId: target.eventId }, now);
}

export function activeDecisionEvents(log: DecisionLog): OrdinaryDecisionEvent[] {
  validateLog(log);
  const undone = new Set(
    log.events
      .filter((event): event is UndoDecisionEvent => event.type === "UNDO")
      .map((event) => event.targetEventId)
  );
  return log.events.filter(
    (event): event is OrdinaryDecisionEvent =>
      event.type !== "UNDO" && !undone.has(event.eventId)
  );
}
