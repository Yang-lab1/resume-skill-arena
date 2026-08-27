import { describe, expect, it } from "vitest";

import { parseResumeText } from "./resume-text-parser.js";

describe("parseResumeText", () => {
  it("creates traceable resume blocks from extracted PDF or OCR text", () => {
    const sourceBytes = new Uint8Array([1, 2, 3, 4]);
    const ast = parseResumeText(
      "教育经历\n示例大学\n\n工作经历\n产品设计师",
      "resume.pdf",
      "application/pdf",
      "zh-CN",
      sourceBytes
    );

    expect(ast.source.originalName).toBe("resume.pdf");
    expect(ast.source.mediaType).toBe("application/pdf");
    expect(ast.source.sizeBytes).toBe(sourceBytes.byteLength);
    expect(ast.blocks.map((block) => block.text)).toEqual([
      "教育经历",
      "示例大学",
      "工作经历",
      "产品设计师"
    ]);
    expect(ast.blocks[0]?.structuralPath).toBe("extracted-text#line[0]");
    expect(ast.blocks[0]?.kind).toBe("PARAGRAPH");
  });

  it("rejects empty extracted text", () => {
    expect(() => parseResumeText(" \n\n", "scan.png", "image/png", "zh-CN", new Uint8Array([1]))).toThrow(
      "简历识别结果没有可用文字。"
    );
  });
});
