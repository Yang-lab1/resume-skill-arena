import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  toChangeSetBaselineReference,
  type ChangeSetBaselineReference
} from "../baseline/freeze.js";
import { stableId } from "../baseline/hash.js";
import type { FrozenBaseline } from "../baseline/types.js";
import { verifyFrozenBaseline } from "../baseline/verify.js";
import { validateChangeSetSchema } from "../contracts/validate-schema.js";
import { runBaselineMatchGate } from "../gates/baseline-match-gate.js";
import { runSemanticGates } from "../gates/run-gates.js";
import { runSourceBlockGate } from "../gates/source-block-gate.js";
import type { GateIssueCode } from "../gates/result.js";
import type { Provider } from "../providers/types.js";
import type { ProviderRegistry } from "../providers/registry.js";
import { OrchestrationRunStore } from "./run-store.js";
import type {
  ChangeSetCandidate,
  OrchestrationResult,
  OrchestrationRunRecord,
  OrchestrationStatus,
  ProviderAttemptSummary,
  ProviderRunSummary
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_TIMEOUT_RETRIES = 1;

export interface OrchestrateProvidersOptions {
  runDirectory: string;
  registry: ProviderRegistry;
  requestedProviderIds?: readonly string[];
  orchestrationId: string;
  timeoutMs?: number;
  now?: () => Date;
  onProviderProgress?: (event: { providerId: string; index: number; total: number; status: ProviderRunSummary["status"] }) => void;
}

class ProviderTimeoutError extends Error {}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => deepFreeze(entry));
  }
  return value;
}

function readBaseline(runDirectory: string): FrozenBaseline {
  return JSON.parse(
    readFileSync(resolve(runDirectory, "baseline/baseline.json"), "utf8")
  ) as FrozenBaseline;
}

function validateCandidate(
  input: unknown,
  baselineReference: ChangeSetBaselineReference,
  frozenBaseline: FrozenBaseline
): GateIssueCode[] {
  const schema = validateChangeSetSchema(input);
  if (!schema.ok) {
    return [...new Set(schema.issues.map((issue) => issue.code))];
  }
  const semantic = runSemanticGates(input);
  if (!semantic.ok) {
    return [...new Set(semantic.issues.map((issue) => issue.code))];
  }
  const baseline = runBaselineMatchGate(input, baselineReference);
  const sourceBlocks = runSourceBlockGate(input, frozenBaseline);
  return [...new Set([...baseline.issues, ...sourceBlocks.issues].map((issue) => issue.code))];
}

async function executeWithTimeout(
  provider: Provider,
  context: Omit<Parameters<Provider["execute"]>[0], "signal">,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  // Convert every outcome to a resolved object. This keeps a late abort
  // rejection observed even after the timeout has won the race.
  const execution = Promise.resolve().then(() => provider.execute({
    ...context,
    signal: controller.signal
  }));
  const observedExecution = execution.then(
    (value) => ({ kind: "VALUE" as const, value }),
    (error) => ({ kind: "ERROR" as const, error })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ kind: "TIMEOUT" }>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ kind: "TIMEOUT" }), timeoutMs);
  });
  const outcome = await Promise.race([observedExecution, timeout]);
  if (timer) clearTimeout(timer);

  if (outcome.kind === "TIMEOUT") {
    controller.abort();
    // Do not start the next Skill (or the one permitted retry) while the
    // timed-out Codex invocation is still alive on the shared local host.
    await observedExecution;
    throw new ProviderTimeoutError("Provider timed out");
  }
  if (outcome.kind === "ERROR") throw outcome.error;
  return outcome.value;
}

function finalStatus(summaries: readonly ProviderRunSummary[]): OrchestrationStatus {
  const successes = summaries.filter((item) => item.status === "SUCCESS").length;
  if (successes === summaries.length && successes > 0) return "COMPLETED";
  if (successes > 0) return "PARTIAL";
  return "FAILED";
}

export async function orchestrateProviders(
  options: OrchestrateProvidersOptions
): Promise<OrchestrationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs 必须是正整数。");
  }
  const verification = verifyFrozenBaseline(options.runDirectory);
  if (!verification.ok) {
    throw new Error("冻结基线验证失败，Provider 未执行。");
  }
  const providers = options.registry.select(options.requestedProviderIds);
  if (providers.length === 0) {
    throw new Error("没有可运行的 Provider。");
  }

  const now = options.now ?? (() => new Date());
  const baseline = deepFreeze(readBaseline(options.runDirectory));
  const baselineReference = deepFreeze(toChangeSetBaselineReference(baseline));
  const createdAt = now().toISOString();
  const summaries: ProviderRunSummary[] = providers.map((provider, index) => ({
    providerId: provider.manifest.id,
    invocationId: stableId(
      "invoke",
      options.orchestrationId,
      provider.manifest.id,
      String(index)
    ),
    status: "PENDING"
  }));
  const store = new OrchestrationRunStore(
    options.runDirectory,
    options.orchestrationId
  );
  const initial: OrchestrationRunRecord = {
    schemaVersion: "0.1",
    orchestrationId: options.orchestrationId,
    baselineId: baseline.baselineId,
    status: "RUNNING",
    createdAt,
    updatedAt: createdAt,
    providers: summaries
  };
  store.initialize(initial);

  const outcomes: Array<ChangeSetCandidate | undefined> = [];
  // Codex Skills share one local execution host. Serializing selected Skills
  // avoids nondeterministic starvation where one otherwise-valid provider is
  // timed out solely because the other two are reasoning concurrently.
  for (const [index, provider] of providers.entries()) {
    const summary = summaries[index]!;
    options.onProviderProgress?.({ providerId: provider.manifest.id, index, total: providers.length, status: "RUNNING" });
    outcomes.push(await (async () => {
      const startedAt = now();
      summary.status = "RUNNING";
      summary.startedAt = startedAt.toISOString();
      const attempts: ProviderAttemptSummary[] = [];
      try {
        for (let attempt = 1; attempt <= MAX_TIMEOUT_RETRIES + 1; attempt += 1) {
          const attemptStartedAt = now();
          try {
            const output = await executeWithTimeout(
              provider,
              {
                orchestrationId: options.orchestrationId,
                invocationId: summary.invocationId,
                baseline,
                baselineReference
              },
              timeoutMs
            );
            const issueCodes = validateCandidate(output, baselineReference, baseline);
            const attemptDurationMs = Math.max(0, now().getTime() - attemptStartedAt.getTime());
            if (issueCodes.length > 0) {
              attempts.push({ attempt, status: "REJECTED", durationMs: attemptDurationMs, issueCodes });
              summary.status = "REJECTED";
              summary.issueCodes = issueCodes;
              return undefined;
            }
            const candidate = output as ChangeSetCandidate;
            attempts.push({ attempt, status: "SUCCESS", durationMs: attemptDurationMs });
            summary.status = "SUCCESS";
            summary.candidatePath = store.saveCandidate(
              provider.manifest.id,
              candidate
            );
            return candidate;
          } catch (error) {
            const timedOut = error instanceof ProviderTimeoutError;
            const errorCode = timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR";
            const errorMessage = timedOut
              ? "Skill 执行超过时限。"
              : (error instanceof Error ? error.message : String(error)).slice(0, 500);
            attempts.push({
              attempt,
              status: timedOut ? "TIMED_OUT" : "FAILED",
              durationMs: Math.max(0, now().getTime() - attemptStartedAt.getTime()),
              errorCode,
              errorMessage
            });
            if (timedOut && attempt <= MAX_TIMEOUT_RETRIES) continue;
            summary.status = timedOut ? "TIMED_OUT" : "FAILED";
            summary.errorCode = errorCode;
            summary.errorMessage = errorMessage;
            return undefined;
          }
        }
      } finally {
        summary.attempts = attempts;
        summary.retryCount = Math.max(0, attempts.length - 1);
        const completedAt = now();
        summary.completedAt = completedAt.toISOString();
        summary.durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
        options.onProviderProgress?.({ providerId: provider.manifest.id, index, total: providers.length, status: summary.status });
      }
    })());
  }

  const candidates = outcomes.filter(
    (candidate): candidate is ChangeSetCandidate => candidate !== undefined
  );
  const status = finalStatus(summaries);
  const finalRecord: OrchestrationRunRecord = {
    ...initial,
    status,
    updatedAt: now().toISOString(),
    providers: summaries
  };
  store.update(finalRecord);
  return { ...finalRecord, candidates };
}
