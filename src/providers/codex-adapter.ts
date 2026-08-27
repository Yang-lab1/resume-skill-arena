import type { Provider, ProviderContext } from "./types.js";

export interface CodexSkillDefinition {
  id: string;
  name: string;
  version: string;
  skillPath: string;
}

export interface CodexSkillInvoker {
  invoke(input: {
    skillPath: string;
    context: ProviderContext;
  }): Promise<unknown>;
}

export function createCodexAdapterProvider(
  definition: CodexSkillDefinition,
  invoker: CodexSkillInvoker
): Provider {
  return {
    manifest: {
      id: definition.id,
      name: definition.name,
      version: definition.version,
      adapterId: "codex-host-bridge",
      adapterVersion: "0.1.0",
      enabled: true
    },
    execute: (context) =>
      invoker.invoke({ skillPath: definition.skillPath, context })
  };
}

