import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateChangeSetSchema } from "./validate-schema.js";

function readExample(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../../examples/${name}`, import.meta.url), "utf8")
  );
}

describe("validateChangeSetSchema", () => {
  it("accepts the valid ChangeSet example", () => {
    const result = validateChangeSetSchema(readExample("valid-changeset.json"));

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("returns a stable path for missing resume evidence", () => {
    const result = validateChangeSetSchema(
      readExample("invalid-ungrounded-change.json")
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHEMA_INVALID",
          path: "/changes/0/resumeEvidence"
        })
      ])
    );
  });
});
