import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { FrozenBaseline } from "../baseline/types.js";
import { verifyFrozenBaseline } from "../baseline/verify.js";
import { composeResume } from "../composition/composer.js";
import {
  appendDecision,
  appendUndo,
  createDecisionLog
} from "../decisions/decision-log.js";
import { CompositionStore, DecisionLogStore } from "../decisions/store.js";
import type { ChangeReference, DecisionInput } from "../decisions/types.js";
import { loadOrchestrationCandidates } from "../orchestration/run-store.js";

type Action = "create" | "select" | "reject" | "edit" | "undo" | "compose";

interface ParsedArgs {
  runDirectory: string;
  decisionLogId: string;
  action: Action;
  values: Map<string, string>;
  confirmFacts: boolean;
  json: boolean;
}

const valuedFlags = new Set([
  "--run",
  "--log-id",
  "--action",
  "--change-set-id",
  "--change-id",
  "--block-id",
  "--text",
  "--based-on-change-set",
  "--based-on-change",
  "--orchestration-id",
  "--composition-id"
]);

function parseArgs(args: string[]): ParsedArgs {
  const values = new Map<string, string>();
  let confirmFacts = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === "--json" || flag === "--confirm-facts") {
      if (flag === "--json") json = true;
      else confirmFacts = true;
      continue;
    }
    const value = args[index + 1];
    if (!valuedFlags.has(flag) || !value || value.startsWith("--")) {
      throw new Error(`参数格式无效：${flag}`);
    }
    values.set(flag, value);
    index += 1;
  }
  const runDirectory = values.get("--run");
  const decisionLogId = values.get("--log-id");
  const action = values.get("--action") as Action | undefined;
  if (!runDirectory || !decisionLogId || !action) {
    throw new Error("必须提供 --run、--log-id 和 --action。");
  }
  if (!new Set<Action>(["create", "select", "reject", "edit", "undo", "compose"]).has(action)) {
    throw new Error(`无法识别的 action：${action}`);
  }
  return { runDirectory, decisionLogId, action, values, confirmFacts, json };
}

function readBaseline(runDirectory: string): FrozenBaseline {
  const verification = verifyFrozenBaseline(runDirectory);
  if (!verification.ok) throw new Error("冻结基线验证失败。");
  return JSON.parse(
    readFileSync(resolve(runDirectory, "baseline/baseline.json"), "utf8")
  ) as FrozenBaseline;
}

function changeReference(values: Map<string, string>): ChangeReference {
  const changeSetId = values.get("--change-set-id");
  const changeId = values.get("--change-id");
  if (!changeSetId || !changeId) {
    throw new Error("该操作必须提供 --change-set-id 和 --change-id。");
  }
  return { changeSetId, changeId };
}

function editInput(parsed: ParsedArgs): DecisionInput {
  const sourceBlockId = parsed.values.get("--block-id");
  const proposedText = parsed.values.get("--text");
  if (!sourceBlockId || proposedText === undefined) {
    throw new Error("edit 必须提供 --block-id 和 --text。");
  }
  const basedOnChangeSet = parsed.values.get("--based-on-change-set");
  const basedOnChange = parsed.values.get("--based-on-change");
  if (Boolean(basedOnChangeSet) !== Boolean(basedOnChange)) {
    throw new Error("手动编辑的来源候选必须成对提供。");
  }
  return {
    type: "EDIT",
    sourceBlockId,
    proposedText,
    factConfirmed: parsed.confirmFacts,
    ...(basedOnChangeSet && basedOnChange
      ? { basedOn: { changeSetId: basedOnChangeSet, changeId: basedOnChange } }
      : {})
  };
}

function defaultCompositionId(): string {
  return `composition.${new Date().toISOString().replace(/[-:.TZ]/g, "")}.${randomUUID().slice(0, 8)}`;
}

export async function runDecisionCli(args: string[]): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
    const baseline = readBaseline(parsed.runDirectory);
    const store = new DecisionLogStore(parsed.runDirectory, parsed.decisionLogId);
    if (parsed.action === "create") {
      const log = createDecisionLog({
        decisionLogId: parsed.decisionLogId,
        baselineId: baseline.baselineId
      });
      store.initialize(log);
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify({ ok: true, decisionLogId: log.decisionLogId, eventCount: 0 })}\n`
          : `✓ 决策日志已创建：${log.decisionLogId}\n`
      );
      return 0;
    }

    const log = store.read();
    if (parsed.action === "compose") {
      const orchestrationId = parsed.values.get("--orchestration-id");
      const candidates = orchestrationId
        ? loadOrchestrationCandidates(parsed.runDirectory, orchestrationId)
        : [];
      const result = composeResume({ baseline, candidates, decisionLog: log });
      if (!result.ok) {
        process.stdout.write(
          parsed.json
            ? `${JSON.stringify({ ok: false, code: "COMPOSITION_CONFLICT", conflicts: result.conflicts })}\n`
            : `✗ 存在 ${result.conflicts.length} 项冲突，已阻止合成。\n`
        );
        return 9;
      }
      const compositionId =
        parsed.values.get("--composition-id") ?? defaultCompositionId();
      const compositionStore = new CompositionStore(
        parsed.runDirectory,
        compositionId
      );
      compositionStore.save(result.resume);
      const output = {
        ok: true,
        compositionId,
        finalResumeId: result.resume.finalResumeId,
        blockCount: result.resume.blocks.length,
        outputPath: compositionStore.path
      };
      process.stdout.write(
        parsed.json
          ? `${JSON.stringify(output)}\n`
          : `✓ 合成完成：${result.resume.finalResumeId}\n`
      );
      return 0;
    }

    let updated;
    if (parsed.action === "undo") {
      updated = appendUndo(log);
    } else if (parsed.action === "edit") {
      updated = appendDecision(log, editInput(parsed));
    } else {
      updated = appendDecision(log, {
        type: parsed.action === "select" ? "SELECT" : "REJECT",
        ...changeReference(parsed.values)
      });
    }
    store.update(updated);
    const last = updated.events.at(-1)!;
    process.stdout.write(
      parsed.json
        ? `${JSON.stringify({ ok: true, eventId: last.eventId, eventCount: updated.events.length })}\n`
        : `✓ 决策已记录：${last.type}\n`
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const json = args.includes("--json");
    process.stdout.write(
      json
        ? `${JSON.stringify({ ok: false, code: "DECISION_FAILED", message })}\n`
        : `✗ 决策操作失败：${message}\n`
    );
    return 9;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) {
  process.exitCode = await runDecisionCli(process.argv.slice(2));
}
