import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseResumeDocx } from "../baseline/docx-parser.js";
import { createFactSnapshot } from "../baseline/fact-snapshot.js";
import { computeBaselineId } from "../baseline/freeze.js";
import { parseJobText } from "../baseline/job-parser.js";
import type { FrozenBaseline } from "../baseline/types.js";
import { validateFrozenBaselineSchema } from "./validate-baseline-schema.js";

function validBaseline(): FrozenBaseline {
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>设计师</w:t></w:r></w:p></w:body></w:document>`;
  const resumeAst = parseResumeDocx(
    zipSync({ "word/document.xml": strToU8(xml) }),
    "resume.docx",
    "zh-CN"
  );
  const jobSnapshot = parseJobText(
    new TextEncoder().encode("负责产品设计"),
    "job.txt",
    "zh-CN"
  );
  const constraints = { locale: "zh-CN", maxPages: 1 };
  return {
    schemaVersion: "0.1",
    baselineId: computeBaselineId(
      resumeAst.resumeHash,
      jobSnapshot.jobHash,
      constraints
    ),
    runId: "run.schema.001",
    createdAt: "2026-08-20T12:00:00.000Z",
    constraints,
    resumeAst,
    jobSnapshot,
    factSnapshot: createFactSnapshot(resumeAst)
  };
}

describe("validateFrozenBaselineSchema", () => {
  it("accepts a complete frozen baseline", () => {
    expect(validateFrozenBaselineSchema(validBaseline())).toEqual({
      ok: true,
      issues: []
    });
  });

  it("rejects a resume AST without blocks", () => {
    const input = validBaseline();
    input.resumeAst.blocks = [];

    const result = validateFrozenBaselineSchema(input);

    expect(result.ok).toBe(false);
    expect(result.issues[0]!.path).toBe("/resumeAst/blocks");
  });
});
