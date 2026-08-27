import { sha256, stableId } from "./hash.js";
import { normalizeBlockText } from "./text.js";
import type { BaselineBlock, ResumeAst } from "./types.js";

const MAX_RESUME_BYTES = 20 * 1024 * 1024;
const MAX_BLOCKS = 2_000;
const MAX_BLOCK_CHARS = 20_000;

export function parseResumeText(
  extractedText: string,
  originalName: string,
  mediaType: string,
  locale: string,
  sourceBytes: Uint8Array
): ResumeAst {
  if (sourceBytes.byteLength > MAX_RESUME_BYTES) {
    throw new Error("简历文件超过 20 MiB 限制。");
  }

  const blocks: BaselineBlock[] = [];
  extractedText.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, sourceIndex) => {
    const text = normalizeBlockText(line);
    if (!text) return;
    if (text.length > MAX_BLOCK_CHARS) {
      throw new Error(`识别结果第 ${sourceIndex + 1} 行超过 20,000 字符限制。`);
    }
    const structuralPath = `extracted-text#line[${sourceIndex}]`;
    blocks.push({
      blockId: stableId("resume-block", structuralPath, text),
      index: blocks.length,
      kind: "PARAGRAPH",
      structuralPath,
      contentHash: sha256(text),
      text
    });
  });

  if (blocks.length === 0) {
    throw new Error("简历识别结果没有可用文字。");
  }
  if (blocks.length > MAX_BLOCKS) {
    throw new Error("简历识别结果超过 2,000 个非空区块限制。");
  }

  const resumeHash = sha256(sourceBytes);
  return {
    schemaVersion: "0.1",
    resumeId: stableId("resume", resumeHash),
    resumeHash,
    astVersion: "0.1",
    locale,
    source: {
      originalName,
      mediaType,
      sizeBytes: sourceBytes.byteLength,
      sha256: resumeHash
    },
    blocks
  };
}
