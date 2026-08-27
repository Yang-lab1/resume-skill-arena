import { describe, expect, it } from "vitest";

import {
  activeDecisionEvents,
  appendDecision,
  appendUndo,
  createDecisionLog
} from "./decision-log.js";

const clock = () => new Date("2026-08-20T00:00:00.000Z");

describe("DecisionLog", () => {
  it("appends immutable decisions with continuous sequence numbers", () => {
    const empty = createDecisionLog({
      decisionLogId: "decision.test.001",
      baselineId: "baseline.test.001",
      now: clock
    });
    const selected = appendDecision(
      empty,
      {
        type: "SELECT",
        changeSetId: "changeset.test.001",
        changeId: "change.test.001"
      },
      clock
    );

    expect(empty.events).toHaveLength(0);
    expect(selected.events[0]).toMatchObject({ sequence: 1, type: "SELECT" });
    expect(selected.events[0]!.eventId).toMatch(/^decision-event\./);
  });

  it("requires explicit fact confirmation for every manual edit", () => {
    const log = createDecisionLog({
      decisionLogId: "decision.test.002",
      baselineId: "baseline.test.001",
      now: clock
    });

    expect(() =>
      appendDecision(
        log,
        {
          type: "EDIT",
          sourceBlockId: "block.test.001",
          proposedText: "新增未经确认的数字 99%",
          factConfirmed: false
        },
        clock
      )
    ).toThrow("确认事实");
  });

  it("undoes the latest active ordinary decision without deleting history", () => {
    let log = createDecisionLog({
      decisionLogId: "decision.test.003",
      baselineId: "baseline.test.001",
      now: clock
    });
    log = appendDecision(
      log,
      { type: "EDIT", sourceBlockId: "block.test.001", proposedText: "A", factConfirmed: true },
      clock
    );
    log = appendDecision(
      log,
      { type: "EDIT", sourceBlockId: "block.test.001", proposedText: "B", factConfirmed: true },
      clock
    );
    const undone = appendUndo(log, clock);

    expect(undone.events).toHaveLength(3);
    expect(undone.events[2]).toMatchObject({
      type: "UNDO",
      targetEventId: log.events[1]!.eventId
    });
  });

  it("rejects a decision event whose content was modified after recording", () => {
    let log = createDecisionLog({
      decisionLogId: "decision.test.004",
      baselineId: "baseline.test.001",
      now: clock
    });
    log = appendDecision(
      log,
      { type: "EDIT", sourceBlockId: "block.test.001", proposedText: "原值", factConfirmed: true },
      clock
    );
    const tampered = structuredClone(log);
    const event = tampered.events[0];
    if (event?.type === "EDIT") event.proposedText = "篡改值";

    expect(() => activeDecisionEvents(tampered)).toThrow("已被修改");
  });
});
