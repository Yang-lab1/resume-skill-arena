import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { orchestrateProviders } from "../orchestration/orchestrator.js";
import { createFailingProvider } from "../providers/failing-provider.js";
import { ProviderRegistry } from "../providers/registry.js";
import { createDefaultReferenceProviders } from "../providers/reference-provider.js";

interface ParsedArgs {
  runDirectory: string;
  orchestrationId: string;
  providerIds?: string[];
  timeoutMs?: number;
  simulateFailure: boolean;
  json: boolean;
}

function defaultOrchestrationId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `orch.${timestamp}.${randomUUID().slice(0, 8)}`;
}

function parseArgs(args: string[]): ParsedArgs {
  const valuedFlags = new Set([
    "--run",
    "--orchestration-id",
    "--providers",
    "--timeout-ms"
  ]);
  const values = new Map<string, string>();
  let json = false;
  let simulateFailure = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]!;
    if (flag === "--json") {
      json = true;
      continue;
    }
    if (flag === "--simulate-failure") {
      simulateFailure = true;
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
  if (!runDirectory) throw new Error("必须提供 --run <冻结运行目录>。");
  const providerValue = values.get("--providers");
  const providerIds = providerValue
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const timeoutValue = values.get("--timeout-ms");
  const timeoutMs = timeoutValue === undefined ? undefined : Number(timeoutValue);
  return {
    runDirectory,
    orchestrationId:
      values.get("--orchestration-id") ?? defaultOrchestrationId(),
    ...(providerIds ? { providerIds } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    simulateFailure,
    json
  };
}

export async function runProvidersCli(args: string[]): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const json = args.includes("--json");
    process.stdout.write(
      json
        ? `${JSON.stringify({ ok: false, code: "USAGE_ERROR", message })}\n`
        : `✗ 参数错误：${message}\n`
    );
    return 2;
  }

  try {
    const references = createDefaultReferenceProviders();
    const registry = new ProviderRegistry([
      ...references,
      ...(parsed.simulateFailure ? [createFailingProvider()] : [])
    ]);
    const requestedProviderIds =
      parsed.providerIds ??
      (parsed.simulateFailure
        ? [references[0]!.manifest.id, "simulated-failure", references[1]!.manifest.id]
        : undefined);
    const result = await orchestrateProviders({
      runDirectory: parsed.runDirectory,
      registry,
      orchestrationId: parsed.orchestrationId,
      ...(requestedProviderIds ? { requestedProviderIds } : {}),
      ...(parsed.timeoutMs === undefined ? {} : { timeoutMs: parsed.timeoutMs })
    });
    const summary = {
      ok: result.status === "COMPLETED" || result.status === "PARTIAL",
      orchestrationId: result.orchestrationId,
      status: result.status,
      candidateCount: result.candidates.length,
      providers: result.providers
    };
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(summary)}\n`);
    } else {
      process.stdout.write(
        `✓ 编排完成：${result.status}，获得 ${result.candidates.length} 个候选方案。\n`
      );
      result.providers.forEach((provider) => {
        process.stdout.write(`- ${provider.providerId}：${provider.status}\n`);
      });
    }
    return summary.ok ? 0 : 8;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      parsed.json
        ? `${JSON.stringify({ ok: false, code: "ORCHESTRATION_FAILED", message })}\n`
        : `✗ 编排未启动或异常结束：${message}\n`
    );
    return 8;
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entryUrl === import.meta.url) {
  process.exitCode = await runProvidersCli(process.argv.slice(2));
}
