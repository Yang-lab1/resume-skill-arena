import type { Provider } from "./types.js";

export function createFailingProvider(id = "simulated-failure"): Provider {
  return {
    manifest: {
      id,
      name: "模拟失败 Provider",
      version: "0.1.0",
      adapterId: "resume-studio-test",
      adapterVersion: "0.1.0",
      enabled: true,
      referenceOnly: true
    },
    execute: async () => {
      throw new Error("SIMULATED_PROVIDER_FAILURE");
    }
  };
}

