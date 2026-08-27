import { describe, expect, it, vi } from "vitest";

import { createCodexAdapterProvider } from "./codex-adapter.js";
import type { ProviderContext } from "./types.js";

describe("createCodexAdapterProvider", () => {
  it("forwards the frozen context to an injected host bridge", async () => {
    const output = { untrusted: true };
    const invoke = vi.fn(async () => output);
    const provider = createCodexAdapterProvider(
      {
        id: "codex-sample",
        name: "Codex sample",
        version: "1.0.0",
        skillPath: "skills/sample/SKILL.md"
      },
      { invoke }
    );
    const signal = new AbortController().signal;
    const context = {
      orchestrationId: "orch.test.001",
      invocationId: "invoke.test.001",
      baseline: { baselineId: "baseline.test.001" },
      baselineReference: { resumeId: "resume.test.001" },
      signal
    } as unknown as ProviderContext;

    await expect(provider.execute(context)).resolves.toBe(output);
    expect(invoke).toHaveBeenCalledWith({
      skillPath: "skills/sample/SKILL.md",
      context
    });
  });
});

