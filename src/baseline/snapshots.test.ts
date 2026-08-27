import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseResumeDocx } from "./docx-parser.js";
import { createFactSnapshot } from "./fact-snapshot.js";
import { parseJobText } from "./job-parser.js";

function resumeAst() {
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>产品设计师</w:t></w:r></w:p><w:p><w:r><w:t>项目周期由 7 天缩短至 2 天</w:t></w:r></w:p></w:body></w:document>`;
  return parseResumeDocx(
    zipSync({ "word/document.xml": strToU8(xml) }),
    "resume.docx",
    "zh-CN"
  );
}

describe("parseJobText", () => {
  it("creates stable blocks from non-empty UTF-8 lines", () => {
    const bytes = new TextEncoder().encode("岗位职责\n\n负责 AI 产品设计  \r\n推动原型落地");
    const first = parseJobText(bytes, "岗位.md", "zh-CN");
    const second = parseJobText(bytes, "renamed.txt", "zh-CN");

    expect(first.blocks.map((block) => block.text)).toEqual([
      "岗位职责",
      "负责 AI 产品设计",
      "推动原型落地"
    ]);
    expect(second.jobId).toBe(first.jobId);
    expect(second.blocks.map((block) => block.blockId)).toEqual(
      first.blocks.map((block) => block.blockId)
    );
  });

  it("rejects an empty JD", () => {
    expect(() =>
      parseJobText(new TextEncoder().encode(" \n\n "), "empty.txt", "zh-CN")
    ).toThrow("没有可用文本");
  });
});

describe("createFactSnapshot", () => {
  it("locks every resume block as a traceable evidence unit", () => {
    const resume = resumeAst();
    const snapshot = createFactSnapshot(resume);

    expect(snapshot.evidenceUnits).toHaveLength(2);
    expect(snapshot.evidenceUnits[1]).toEqual(
      expect.objectContaining({
        sourceBlockId: resume.blocks[1]!.blockId,
        sourceRef: resume.blocks[1]!.structuralPath,
        quote: "项目周期由 7 天缩短至 2 天",
        lockStatus: "LOCKED"
      })
    );
    expect(createFactSnapshot(resume).factSnapshotId).toBe(
      snapshot.factSnapshotId
    );
  });
});
