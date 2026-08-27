import { describe, expect, it } from "vitest";

import { sha256, stableId, stableObjectHash, stableStringify } from "./hash.js";

describe("baseline hashing", () => {
  it("serializes object keys deterministically", () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":2}'
    );
  });

  it("produces the same object hash regardless of key insertion order", () => {
    expect(stableObjectHash({ locale: "zh-CN", maxPages: 1 })).toBe(
      stableObjectHash({ maxPages: 1, locale: "zh-CN" })
    );
  });

  it("changes hashes and IDs when content changes", () => {
    expect(sha256("resume A")).not.toBe(sha256("resume B"));
    expect(stableId("resume-block", "p[0]", "A")).not.toBe(
      stableId("resume-block", "p[0]", "B")
    );
  });
});
