import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { freezeBaseline } from "../baseline/freeze.js";
import { createFailingProvider } from "../providers/failing-provider.js";
import { ProviderRegistry } from "../providers/registry.js";
import { createReferenceProvider } from "../providers/reference-provider.js";
import type { Provider } from "../providers/types.js";
import { orchestrateProviders } from "./orchestrator.js";

function frozenRun(): string {
  const root = mkdtempSync(join(tmpdir(), "resume-studio-orch-"));
  const resumePath = join(root, "resume.docx");
  const jobPath = join(root, "job.md");
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>负责 AI 产品设计</w:t></w:r></w:p></w:body></w:document>`;
  writeFileSync(resumePath, zipSync({ "word/document.xml": strToU8(xml) }));
  writeFileSync(jobPath, "需要 AI 产品设计经验", "utf8");
  return freezeBaseline({
    resumePath,
    jobPath,
    outputDirectory: join(root, "runs"),
    runId: "run.test.001",
    locale: "zh-CN",
    maxPages: 1,
    now: () => new Date("2026-08-20T00:00:00.000Z")
  }).runDirectory;
}

function reference(id: string): Provider {
  return createReferenceProvider({
    id,
    name: id,
    rationaleCategory: "CLARITY"
  });
}

describe("orchestrateProviders", () => {
  it("keeps successful candidates when another provider fails", async () => {
    const runDirectory = frozenRun();
    const registry = new ProviderRegistry([
      reference("reference-one"),
      createFailingProvider("simulated-failure"),
      reference("reference-two")
    ]);

    const result = await orchestrateProviders({
      runDirectory,
      registry,
      orchestrationId: "orch.test.partial",
      timeoutMs: 500,
      now: () => new Date("2026-08-20T00:00:00.000Z")
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.candidates).toHaveLength(2);
    expect(result.providers.map((item) => item.status)).toEqual([
      "SUCCESS",
      "FAILED",
      "SUCCESS"
    ]);
    expect(new Set(result.candidates.map((item) => item.baseline.resumeHash)).size).toBe(1);

    const record = JSON.parse(
      readFileSync(
        join(runDirectory, "orchestration/orch.test.partial/run.json"),
        "utf8"
      )
    ) as { status: string; providers: unknown[] };
    expect(record.status).toBe("PARTIAL");
    expect(JSON.stringify(record)).not.toContain("负责 AI 产品设计");
  });

  it("rejects a schema-valid candidate that references another baseline", async () => {
    const bad = reference("wrong-baseline");
    const execute = bad.execute;
    bad.execute = async (context) => {
      const candidate = (await execute(context)) as Record<string, unknown>;
      const baseline = candidate.baseline as Record<string, unknown>;
      baseline.resumeHash = "f".repeat(64);
      return candidate;
    };

    const result = await orchestrateProviders({
      runDirectory: frozenRun(),
      registry: new ProviderRegistry([bad]),
      requestedProviderIds: ["wrong-baseline"],
      orchestrationId: "orch.test.rejected",
      timeoutMs: 500
    });

    expect(result.status).toBe("FAILED");
    expect(result.candidates).toHaveLength(0);
    expect(result.providers[0]).toMatchObject({
      status: "REJECTED",
      issueCodes: ["BASELINE_MISMATCH"]
    });
  });

  it("times out one provider without delaying a successful provider", async () => {
    const hanging: Provider = {
      manifest: {
        id: "hanging",
        name: "hanging",
        version: "0.1.0",
        adapterId: "test",
        adapterVersion: "0.1.0",
        enabled: true,
        referenceOnly: true
      },
      execute: async (context) => new Promise((_, reject) => {
        context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    };
    const result = await orchestrateProviders({
      runDirectory: frozenRun(),
      registry: new ProviderRegistry([hanging, reference("fast")]),
      requestedProviderIds: ["hanging", "fast"],
      orchestrationId: "orch.test.timeout",
      timeoutMs: 20
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.providers.map((item) => item.status)).toEqual([
      "TIMED_OUT",
      "SUCCESS"
    ]);
  });

  it("retries one timed-out provider once after its aborted execution settles", async () => {
    let calls = 0;
    const retrying: Provider = {
      manifest: {
        id: "retrying", name: "retrying", version: "0.1.0", adapterId: "test", adapterVersion: "0.1.0", enabled: true, referenceOnly: true
      },
      execute: async (context) => {
        calls += 1;
        if (calls === 1) {
          return new Promise((_, reject) => context.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
        }
        return reference("retrying").execute(context);
      }
    };
    const result = await orchestrateProviders({
      runDirectory: frozenRun(), registry: new ProviderRegistry([retrying]),
      orchestrationId: "orch.test.retry", timeoutMs: 20
    });

    expect(calls).toBe(2);
    expect(result.status).toBe("COMPLETED");
    expect(result.providers[0]).toMatchObject({
      status: "SUCCESS", retryCount: 1,
      attempts: [{ status: "TIMED_OUT" }, { status: "SUCCESS" }]
    });
  });

  it("runs selected providers one at a time on the shared local host", async () => {
    let active = 0;
    let maximumActive = 0;
    const delayedReference = (id: string): Provider => {
      const provider = reference(id);
      const execute = provider.execute;
      provider.execute = async (context) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 15));
          return await execute(context);
        } finally {
          active -= 1;
        }
      };
      return provider;
    };
    const result = await orchestrateProviders({
      runDirectory: frozenRun(),
      registry: new ProviderRegistry([delayedReference("serial-one"), delayedReference("serial-two")]),
      requestedProviderIds: ["serial-one", "serial-two"],
      orchestrationId: "orch.test.serial",
      timeoutMs: 500
    });

    expect(result.status).toBe("COMPLETED");
    expect(maximumActive).toBe(1);
  });
});
