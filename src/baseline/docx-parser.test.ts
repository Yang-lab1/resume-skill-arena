import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { parseResumeDocx } from "./docx-parser.js";

function minimalDocx(): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
          <w:r><w:t>候选人 A</w:t></w:r>
        </w:p>
        <w:p><w:r><w:t xml:space="preserve">AI 设计工程师</w:t></w:r></w:p>
        <w:p><w:r><w:t>   </w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc>
          <w:p><w:r><w:t>表格中的项目经历</w:t></w:r></w:p>
        </w:tc></w:tr></w:tbl>
        <w:sectPr/>
      </w:body>
    </w:document>`;

  return zipSync({ "word/document.xml": strToU8(documentXml) });
}

describe("parseResumeDocx", () => {
  it("extracts non-empty paragraphs in document order", () => {
    const ast = parseResumeDocx(minimalDocx(), "测试简历.docx", "zh-CN");

    expect(ast.blocks.map((block) => block.text)).toEqual([
      "候选人 A",
      "AI 设计工程师",
      "表格中的项目经历"
    ]);
    expect(ast.blocks[0]).toMatchObject({
      structuralPath: "word/document.xml#paragraph[0]",
      styleName: "Heading1"
    });
    expect(ast.blocks[2]!.structuralPath).toBe(
      "word/document.xml#paragraph[3]"
    );
  });

  it("produces stable IDs and hashes for identical bytes", () => {
    const bytes = minimalDocx();
    const first = parseResumeDocx(bytes, "first.docx", "zh-CN");
    const second = parseResumeDocx(bytes, "renamed.docx", "zh-CN");

    expect(second.resumeId).toBe(first.resumeId);
    expect(second.resumeHash).toBe(first.resumeHash);
    expect(second.blocks.map((block) => block.blockId)).toEqual(
      first.blocks.map((block) => block.blockId)
    );
  });

  it("rejects an archive without the main Word document", () => {
    const invalid = zipSync({ "readme.txt": strToU8("not a docx") });

    expect(() => parseResumeDocx(invalid, "broken.docx", "zh-CN")).toThrow(
      "缺少 word/document.xml"
    );
  });

  it("rejects XML document type declarations", () => {
    const xml = `<!DOCTYPE w:document [<!ENTITY injected "text">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&injected;</w:t></w:r></w:p></w:body></w:document>`;
    const archive = zipSync({ "word/document.xml": strToU8(xml) });

    expect(() => parseResumeDocx(archive, "unsafe.docx", "zh-CN")).toThrow(
      "禁止包含 DOCTYPE"
    );
  });
});
