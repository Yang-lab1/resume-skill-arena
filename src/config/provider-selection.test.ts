import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROVIDER_COUNT,
  MAX_PROVIDER_COUNT,
  ProviderSelectionError,
  selectProviders
} from "./provider-selection.js";

const available = ["ats", "star", "technical", "design", "clarity", "extra"];

describe("selectProviders", () => {
  it("defaults to the first three available providers", () => {
    expect(DEFAULT_PROVIDER_COUNT).toBe(3);
    expect(selectProviders(available)).toEqual(["ats", "star", "technical"]);
  });

  it("allows an explicit selection of five providers", () => {
    expect(MAX_PROVIDER_COUNT).toBe(5);
    expect(selectProviders(available, available.slice(0, 5))).toHaveLength(5);
  });

  it("rejects a sixth provider before execution", () => {
    expect(() => selectProviders(available, available)).toThrowError(
      expect.objectContaining<Partial<ProviderSelectionError>>({
        code: "PROVIDER_LIMIT_EXCEEDED"
      })
    );
  });
});
