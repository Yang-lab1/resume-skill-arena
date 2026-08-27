import { describe, expect, it } from "vitest";

import type { Provider } from "./types.js";
import { ProviderRegistry } from "./registry.js";

function provider(id: string): Provider {
  return {
    manifest: {
      id,
      name: id,
      version: "0.1.0",
      adapterId: "test-adapter",
      adapterVersion: "0.1.0",
      enabled: true,
      referenceOnly: true
    },
    execute: async () => ({})
  };
}

describe("ProviderRegistry", () => {
  it("selects the first three enabled providers by default", () => {
    const registry = new ProviderRegistry([
      provider("one"),
      provider("two"),
      provider("three"),
      provider("four")
    ]);

    expect(registry.select().map((item) => item.manifest.id)).toEqual([
      "one",
      "two",
      "three"
    ]);
  });

  it("allows five but rejects six before execution", () => {
    const providers = ["one", "two", "three", "four", "five", "six"].map(
      provider
    );
    const registry = new ProviderRegistry(providers);

    expect(registry.select(["one", "two", "three", "four", "five"])).toHaveLength(5);
    expect(() => registry.select(providers.map((item) => item.manifest.id))).toThrow(
      "最多选择 5 个专家"
    );
  });

  it("rejects duplicate registrations and unknown selections", () => {
    expect(() => new ProviderRegistry([provider("same"), provider("same")])).toThrow(
      "重复"
    );
    const registry = new ProviderRegistry([provider("known")]);
    expect(() => registry.select(["missing"])).toThrow("未注册");
  });

  it("rejects duplicate selections", () => {
    const registry = new ProviderRegistry([provider("known")]);
    expect(() => registry.select(["known", "known"])).toThrow("重复选择");
  });
});
